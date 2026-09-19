-- AgroConnect 2.0 — production schema + RLS
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text,
 phone text,
 role text not null default 'producteur' check (role in ('producteur','acheteur','ouvrier','admin')),
 country text default 'Cameroun',
 created_at timestamptz not null default now()
);
create table if not exists public.farms (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 name text not null, area_ha numeric(12,2) not null default 0, region text, created_at timestamptz not null default now()
);
create table if not exists public.crops (
 id uuid primary key default gen_random_uuid(), name text not null unique, icon text, cycle_days integer not null default 90, active boolean not null default true
);
create table if not exists public.fields (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id) on delete cascade,
 crop_id uuid references public.crops(id), name text not null, area_ha numeric(12,2) not null default 0,
 planting_date date, latitude double precision, longitude double precision, created_at timestamptz not null default now()
);
create table if not exists public.harvest_forecasts (
 id uuid primary key default gen_random_uuid(), field_id uuid not null references public.fields(id) on delete cascade,
 estimated_date date, estimated_volume_kg numeric(14,2), status text not null default 'growth', created_at timestamptz not null default now()
);
create table if not exists public.tenders (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references public.profiles(id) on delete cascade,
 crop_id uuid references public.crops(id), volume_kg numeric(14,2) not null check(volume_kg>0), delivery_from date,
 delivery_to date, tolerance_days integer not null default 15, price_note text, delivery_zone text,
 status text not null default 'open' check(status in ('open','closed','cancelled')), created_at timestamptz not null default now()
);
create table if not exists public.tender_responses (
 id uuid primary key default gen_random_uuid(), tender_id uuid not null references public.tenders(id) on delete cascade,
 producer_id uuid not null references public.profiles(id) on delete cascade, field_id uuid references public.fields(id) on delete cascade,
 offered_volume_kg numeric(14,2) not null check(offered_volume_kg>0), estimated_harvest_date date, note text,
 status text not null default 'pending' check(status in ('pending','accepted','rejected')), created_at timestamptz not null default now()
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, body text, type text not null default 'system', read_at timestamptz, created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.farms enable row level security;
alter table public.fields enable row level security;
alter table public.harvest_forecasts enable row level security;
alter table public.tenders enable row level security;
alter table public.tender_responses enable row level security;
alter table public.notifications enable row level security;

-- CORRECTIF 2.1.1 — SÉCURITÉ CRITIQUE : le rôle transmis par le client à l'inscription
-- (raw_user_meta_data->>'role') n'est jamais fiable. Seuls producteur/acheteur/ouvrier
-- peuvent être créés par une inscription publique ; toute autre valeur (dont 'admin')
-- retombe sur 'producteur'. L'attribution du rôle admin doit se faire uniquement à la main
-- dans Supabase (voir README section 6).
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare safe_role text;
begin
  safe_role := new.raw_user_meta_data->>'role';
  if safe_role is null or safe_role not in ('producteur','acheteur','ouvrier') then
    safe_role := 'producteur';
  end if;
  insert into public.profiles(id,full_name,phone,role,country)
  values(new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', safe_role, 'Cameroun')
  on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin'); $$;

-- Déjà présent dans la version précédente : empêche un client de changer son propre rôle
-- (donc de se déclarer admin) via une simple mise à jour de profil. Conservé tel quel.
create or replace function public.prevent_client_role_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.role is distinct from new.role and not public.is_admin() then
    raise exception 'Role modification is restricted to administrators';
  end if;
  return new;
end; $$;
drop trigger if exists prevent_client_role_change on public.profiles;
create trigger prevent_client_role_change before update on public.profiles for each row execute procedure public.prevent_client_role_change();

-- CORRECTIF 2.1.1 : toutes les policies passent en "drop if exists" + "create" pour que
-- le script entier soit rejouable sans erreur "policy already exists".
drop policy if exists profiles_select_self on public.profiles; create policy profiles_select_self on public.profiles for select using (id=auth.uid() or public.is_admin());
drop policy if exists profiles_update_self on public.profiles; create policy profiles_update_self on public.profiles for update using (id=auth.uid() or public.is_admin()) with check (id=auth.uid() or public.is_admin());

drop policy if exists farms_select_owner on public.farms; create policy farms_select_owner on public.farms for select using (owner_id=auth.uid() or public.is_admin());
drop policy if exists farms_insert_owner on public.farms; create policy farms_insert_owner on public.farms for insert with check (owner_id=auth.uid());
drop policy if exists farms_update_owner on public.farms; create policy farms_update_owner on public.farms for update using (owner_id=auth.uid() or public.is_admin()) with check (owner_id=auth.uid() or public.is_admin());
drop policy if exists farms_delete_owner on public.farms; create policy farms_delete_owner on public.farms for delete using (owner_id=auth.uid() or public.is_admin());

drop policy if exists crops_select_auth on public.crops; create policy crops_select_auth on public.crops for select to authenticated using (active=true or public.is_admin());
drop policy if exists crops_admin_insert on public.crops; create policy crops_admin_insert on public.crops for insert with check (public.is_admin());
drop policy if exists crops_admin_update on public.crops; create policy crops_admin_update on public.crops for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists crops_admin_delete on public.crops; create policy crops_admin_delete on public.crops for delete using (public.is_admin());

drop policy if exists fields_select_owner on public.fields; create policy fields_select_owner on public.fields for select using (exists(select 1 from public.farms f where f.id=farm_id and (f.owner_id=auth.uid() or public.is_admin())));
drop policy if exists fields_insert_owner on public.fields; create policy fields_insert_owner on public.fields for insert with check (exists(select 1 from public.farms f where f.id=farm_id and f.owner_id=auth.uid()));
drop policy if exists fields_update_owner on public.fields; create policy fields_update_owner on public.fields for update using (exists(select 1 from public.farms f where f.id=farm_id and (f.owner_id=auth.uid() or public.is_admin()))) with check (exists(select 1 from public.farms f where f.id=farm_id and (f.owner_id=auth.uid() or public.is_admin())));
drop policy if exists fields_delete_owner on public.fields; create policy fields_delete_owner on public.fields for delete using (exists(select 1 from public.farms f where f.id=farm_id and (f.owner_id=auth.uid() or public.is_admin())));

drop policy if exists forecast_select_owner on public.harvest_forecasts; create policy forecast_select_owner on public.harvest_forecasts for select using (exists(select 1 from public.fields fi join public.farms f on f.id=fi.farm_id where fi.id=field_id and (f.owner_id=auth.uid() or public.is_admin())));
drop policy if exists forecast_insert_owner on public.harvest_forecasts; create policy forecast_insert_owner on public.harvest_forecasts for insert with check (exists(select 1 from public.fields fi join public.farms f on f.id=fi.farm_id where fi.id=field_id and f.owner_id=auth.uid()));
drop policy if exists forecast_update_owner on public.harvest_forecasts; create policy forecast_update_owner on public.harvest_forecasts for update using (exists(select 1 from public.fields fi join public.farms f on f.id=fi.farm_id where fi.id=field_id and (f.owner_id=auth.uid() or public.is_admin()))) with check (exists(select 1 from public.fields fi join public.farms f on f.id=fi.farm_id where fi.id=field_id and (f.owner_id=auth.uid() or public.is_admin())));
drop policy if exists forecast_delete_owner on public.harvest_forecasts; create policy forecast_delete_owner on public.harvest_forecasts for delete using (exists(select 1 from public.fields fi join public.farms f on f.id=fi.farm_id where fi.id=field_id and (f.owner_id=auth.uid() or public.is_admin())));

drop policy if exists tenders_select on public.tenders; create policy tenders_select on public.tenders for select to authenticated using (status='open' or buyer_id=auth.uid() or public.is_admin());
drop policy if exists tenders_insert_buyer on public.tenders; create policy tenders_insert_buyer on public.tenders for insert with check (buyer_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role in ('acheteur','admin')));
drop policy if exists tenders_update_buyer on public.tenders; create policy tenders_update_buyer on public.tenders for update using (buyer_id=auth.uid() or public.is_admin()) with check (buyer_id=auth.uid() or public.is_admin());
drop policy if exists tenders_delete_buyer on public.tenders; create policy tenders_delete_buyer on public.tenders for delete using (buyer_id=auth.uid() or public.is_admin());

drop policy if exists responses_select on public.tender_responses; create policy responses_select on public.tender_responses for select using (producer_id=auth.uid() or exists(select 1 from public.tenders t where t.id=tender_id and t.buyer_id=auth.uid()) or public.is_admin());
drop policy if exists responses_insert on public.tender_responses; create policy responses_insert on public.tender_responses for insert with check (producer_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='producteur') and (field_id is not null or herd_id is not null));
drop policy if exists responses_update on public.tender_responses; create policy responses_update on public.tender_responses for update using (producer_id=auth.uid() or exists(select 1 from public.tenders t where t.id=tender_id and t.buyer_id=auth.uid()) or public.is_admin()) with check (producer_id=auth.uid() or exists(select 1 from public.tenders t where t.id=tender_id and t.buyer_id=auth.uid()) or public.is_admin());

drop policy if exists notifications_select on public.notifications; create policy notifications_select on public.notifications for select using (user_id=auth.uid() or public.is_admin());
drop policy if exists notifications_update on public.notifications; create policy notifications_update on public.notifications for update using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());
drop policy if exists notifications_insert_service on public.notifications; create policy notifications_insert_service on public.notifications for insert with check (public.is_admin());

-- CORRECTIF 2.1.1 : notifications réellement envoyées au bon utilisateur lors du workflow
-- appel d'offres → réponse → décision (au lieu de rester un module isolé sans producteur).
create or replace function public.notify_new_tender_response() returns trigger language plpgsql security definer set search_path=public as $$
declare buyer uuid; crop_name text;
begin
  select buyer_id into buyer from public.tenders where id=new.tender_id;
  if buyer is not null then
    insert into public.notifications(user_id,title,body,type)
    values(buyer,'Nouvelle proposition reçue','Une proposition a été soumise sur votre appel d''offres.','commercial');
  end if;
  return new;
end; $$;
drop trigger if exists on_tender_response_created on public.tender_responses;
create trigger on_tender_response_created after insert on public.tender_responses for each row execute procedure public.notify_new_tender_response();

create or replace function public.notify_tender_response_decision() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status is distinct from old.status and new.status in ('accepted','rejected') then
    insert into public.notifications(user_id,title,body,type)
    values(new.producer_id, case when new.status='accepted' then 'Proposition acceptée' else 'Proposition refusée' end,
      case when new.status='accepted' then 'Votre proposition a été acceptée par l''acheteur.' else 'Votre proposition a été refusée par l''acheteur.' end,
      'commercial');
  end if;
  return new;
end; $$;
drop trigger if exists on_tender_response_decision on public.tender_responses;
create trigger on_tender_response_decision after update on public.tender_responses for each row execute procedure public.notify_tender_response_decision();

insert into public.crops(name,icon,cycle_days) values
('Tomate','🍅',90),('Maïs','🌽',100),('Pastèque','🍉',90),('Légumes','🥬',60),('Plantain','🍌',300),('Avocat','🥑',180),('Café','☕',1095),('Cacao','🍫',1460)
on conflict(name) do update set icon=excluded.icon, cycle_days=excluded.cycle_days, active=true;

-- ============================================================
-- DulyAgrivia — extension secteur Élevage + Financement + Intrants
-- ============================================================
create table if not exists public.livestock_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  cycle_days int not null default 180,
  active boolean not null default true
);

create table if not exists public.herds (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  livestock_type_id uuid references public.livestock_types(id),
  name text not null,
  headcount int not null default 0,
  region text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.herd_health_records (
  id uuid primary key default gen_random_uuid(),
  herd_id uuid not null references public.herds(id) on delete cascade,
  record_date date not null default current_date,
  type text not null,
  note text,
  urgency text not null default 'normal' check (urgency in ('normal','eleve')),
  created_at timestamptz not null default now()
);

alter table public.tenders add column if not exists livestock_type_id uuid references public.livestock_types(id);
-- CORRECTIF 2.1.1 : un appel d'offres agricole (crop_id) ou d'élevage (livestock_type_id),
-- jamais les deux vides à la fois.
alter table public.tenders drop constraint if exists tenders_one_sector_chk;
alter table public.tenders add constraint tenders_one_sector_chk check (crop_id is not null or livestock_type_id is not null);

-- CORRECTIF 2.1.1 : une réponse à un appel d'offres porte sur un champ (agriculture)
-- OU un troupeau (élevage), jamais les deux, jamais aucun des deux.
alter table public.tender_responses add column if not exists herd_id uuid references public.herds(id) on delete cascade;
alter table public.tender_responses drop constraint if exists responses_one_target_chk;
alter table public.tender_responses add constraint responses_one_target_chk check (
  (field_id is not null and herd_id is null) or (field_id is null and herd_id is not null)
);

create table if not exists public.input_products (
  id uuid primary key default gen_random_uuid(),
  sector text not null check (sector in ('agriculture','elevage')),
  category text not null,
  name text not null,
  supplier_name text,
  price_note text,
  region text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.funding_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization text not null,
  sector text not null check (sector in ('agriculture','elevage','both')),
  region text,
  description text,
  contact_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.livestock_types enable row level security;
alter table public.input_products enable row level security;
alter table public.funding_programs enable row level security;
alter table public.herds enable row level security;
alter table public.herd_health_records enable row level security;

drop policy if exists livestock_types_read on public.livestock_types; create policy livestock_types_read on public.livestock_types for select to authenticated using (active or public.is_admin());
drop policy if exists livestock_types_admin_write on public.livestock_types; create policy livestock_types_admin_write on public.livestock_types for all using (public.is_admin()) with check (public.is_admin());

-- CORRECTIF 2.1.1 : lecture ouverte mais écriture/désactivation réservées à l'admin,
-- pour que les utilisateurs ne puissent pas injecter eux-mêmes des annonces via le navigateur.
drop policy if exists input_products_read on public.input_products; create policy input_products_read on public.input_products for select to authenticated using (active or public.is_admin());
drop policy if exists input_products_admin_write on public.input_products; create policy input_products_admin_write on public.input_products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists funding_programs_read on public.funding_programs; create policy funding_programs_read on public.funding_programs for select to authenticated using (active or public.is_admin());
drop policy if exists funding_programs_admin_write on public.funding_programs; create policy funding_programs_admin_write on public.funding_programs for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists herds_owner_rw on public.herds; create policy herds_owner_rw on public.herds for all using (
  farm_id in (select id from public.farms where owner_id = auth.uid()) or public.is_admin()
) with check (
  farm_id in (select id from public.farms where owner_id = auth.uid()) or public.is_admin()
);

drop policy if exists herd_health_owner_rw on public.herd_health_records; create policy herd_health_owner_rw on public.herd_health_records for all using (
  herd_id in (select h.id from public.herds h join public.farms f on f.id = h.farm_id where f.owner_id = auth.uid()) or public.is_admin()
) with check (
  herd_id in (select h.id from public.herds h join public.farms f on f.id = h.farm_id where f.owner_id = auth.uid()) or public.is_admin()
);

insert into public.livestock_types (name, icon, cycle_days)
select * from (values
  ('Bovins', '🐄', 285),
  ('Volaille', '🐔', 42),
  ('Caprins', '🐐', 150),
  ('Porcins', '🐖', 114),
  ('Aquaculture', '🐟', 180)
) as v(name, icon, cycle_days)
where not exists (select 1 from public.livestock_types lt where lt.name = v.name);

-- ============================================================
-- CORRECTIF 2.1.1 — Module Ouvrier : tâches réelles (au lieu de l'écran vide)
-- ============================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  field_id uuid references public.fields(id) on delete set null,
  herd_id uuid references public.herds(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  due_date date,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.tasks enable row level security;

-- Lecture : l'ouvrier affecté voit sa tâche ; le propriétaire de la ferme voit tout.
-- Un ouvrier ne voit jamais les tâches affectées à un autre ouvrier.
drop policy if exists tasks_select on public.tasks; create policy tasks_select on public.tasks for select using (
  assigned_to = auth.uid() or exists(select 1 from public.farms f where f.id=farm_id and f.owner_id=auth.uid()) or public.is_admin()
);
drop policy if exists tasks_insert_owner on public.tasks; create policy tasks_insert_owner on public.tasks for insert with check (
  exists(select 1 from public.farms f where f.id=farm_id and f.owner_id=auth.uid())
);
-- Mise à jour : le producteur garde le contrôle total ; l'ouvrier affecté peut seulement
-- changer le statut de SA tâche (la garde applicative ci-dessous l'empêche de toucher au reste).
drop policy if exists tasks_update on public.tasks; create policy tasks_update on public.tasks for update using (
  exists(select 1 from public.farms f where f.id=farm_id and f.owner_id=auth.uid()) or assigned_to = auth.uid() or public.is_admin()
) with check (
  exists(select 1 from public.farms f where f.id=farm_id and f.owner_id=auth.uid()) or assigned_to = auth.uid() or public.is_admin()
);
drop policy if exists tasks_delete_owner on public.tasks; create policy tasks_delete_owner on public.tasks for delete using (
  exists(select 1 from public.farms f where f.id=farm_id and f.owner_id=auth.uid()) or public.is_admin()
);

-- Garde applicative : un ouvrier ne peut modifier que le statut et la date de complétion
-- de sa propre tâche ; le producteur et l'admin gardent un accès complet.
create or replace function public.guard_task_worker_update() returns trigger language plpgsql security definer set search_path=public as $$
declare owner boolean;
begin
  select exists(select 1 from public.farms f where f.id=new.farm_id and f.owner_id=auth.uid()) into owner;
  if owner or public.is_admin() then
    return new;
  end if;
  if new.assigned_to = auth.uid() and old.assigned_to = auth.uid() then
    if new.title is distinct from old.title or new.description is distinct from old.description
       or new.priority is distinct from old.priority or new.due_date is distinct from old.due_date
       or new.farm_id is distinct from old.farm_id or new.field_id is distinct from old.field_id
       or new.herd_id is distinct from old.herd_id or new.assigned_to is distinct from old.assigned_to then
      raise exception 'Un ouvrier ne peut modifier que le statut de sa tâche';
    end if;
    return new;
  end if;
  raise exception 'Modification non autorisée';
end; $$;
drop trigger if exists guard_task_worker_update on public.tasks;
create trigger guard_task_worker_update before update on public.tasks for each row execute procedure public.guard_task_worker_update();
