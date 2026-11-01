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

-- ============================================================
-- LOT 1 — Accès public, portail admin séparé, invitations Ouvrier
-- (déjà appliqué en direct sur le projet Supabase de production)
-- ============================================================

create table if not exists public.worker_invites (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  farm_id uuid references public.farms(id) on delete cascade not null,
  created_by uuid references auth.users(id),
  full_name text,
  phone text,
  used boolean not null default false,
  used_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table public.worker_invites enable row level security;
create policy worker_invites_owner_rw on public.worker_invites for all
  using (exists (select 1 from public.farms f where f.id = worker_invites.farm_id and f.owner_id = auth.uid()) or public.is_admin())
  with check (exists (select 1 from public.farms f where f.id = worker_invites.farm_id and f.owner_id = auth.uid()) or public.is_admin());
create policy worker_invites_code_check on public.worker_invites for select to anon
  using (used = false);

-- handle_new_user() : gère désormais l'inscription par code d'invitation (crée un
-- compte "ouvrier" rattaché à la ferme de l'invitation) ; l'inscription publique
-- classique reste limitée à producteur/acheteur (jamais admin/super_admin).
-- Voir la définition complète appliquée en direct sur le projet.

-- Permissions de base manquantes lors de la reconstruction du schéma (correctif
-- critique du 28/09/2026) : sans ceci, RLS ne s'applique jamais, PostgreSQL refuse
-- l'accès à la table avant même d'évaluer les règles.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;
grant execute on function public.is_admin() to anon;
grant execute on function public.is_super_admin() to anon;

-- ============================================================
-- LOT 2 — Monétisation Gratuit/PRO, commission tracée, multi-exploitations
-- (déjà appliqué en direct sur le projet Supabase de production)
-- ============================================================
-- Tables pricing_config, commission_config, payment_intents, sales et les colonnes
-- profiles.plan / profiles.pro_expires_at existaient déjà dans le schéma d'origine.
-- Ajouts du Lot 2 :

create or replace function public.is_pro() returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and plan = 'pro' and (pro_expires_at is null or pro_expires_at > now())
  );
$$;
grant execute on function public.is_pro() to authenticated, anon;

-- Le taux de commission, le montant de commission et le montant net sont calculés et
-- verrouillés côté serveur à l'insertion — jamais fournis par le client. Garantit que
-- l'historique conserve fidèlement le taux réellement appliqué à chaque transaction.
create or replace function public.set_sale_commission() returns trigger language plpgsql security definer set search_path=public as $$
declare current_rate numeric;
begin
  select rate_percent into current_rate from public.commission_config where id = 1;
  new.commission_rate_applied := coalesce(current_rate, 0);
  new.commission_amount := round(new.gross_amount * new.commission_rate_applied / 100.0, 2);
  new.net_amount := new.gross_amount - new.commission_amount;
  return new;
end; $$;
create trigger set_sale_commission before insert on public.sales for each row execute procedure public.set_sale_commission();

-- Seul un compte PRO actif (ou un admin) peut enregistrer une vente commerciale.
create policy sales_seller_insert on public.sales for insert with check (
  seller_id = auth.uid() and (public.is_pro() or public.is_admin())
);

-- Multi-exploitations : farms.owner_id supportait déjà plusieurs lignes par producteur
-- (aucune contrainte unique) — seule l'interface limitait à une seule ferme. Corrigé
-- côté frontend (Farm.tsx, Team.tsx) ; aucun changement de schéma nécessaire ici.

-- ============================================================
-- LOT 3 — Prix de référence DulyAgrivia, offres de marché à statuts, prévisions
-- (déjà appliqué en direct sur le projet Supabase de production)
-- ============================================================
-- Tables harvest_forecasts, growth_stages, crop_guides, livestock_guides, tenders,
-- tender_responses, cooperative_offers, commitments existaient déjà. Ajouts du Lot 3 :

create table if not exists public.reference_prices (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid references public.crops(id),
  livestock_type_id uuid references public.livestock_types(id),
  price_per_kg numeric not null,
  currency text not null default 'FCFA',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint reference_prices_one_target check ((crop_id is not null and livestock_type_id is null) or (crop_id is null and livestock_type_id is not null))
);
alter table public.reference_prices enable row level security;
create policy reference_prices_read on public.reference_prices for select using (true);
create policy reference_prices_admin_write on public.reference_prices for all using (public.is_admin()) with check (public.is_admin());

-- Offres de vente publiées par les producteurs/vendeurs, avec statut commercial
-- (disponible_maintenant / prochainement / programmee / appel_offres). Le prix vendeur
-- reste toujours distinct du prix de référence DulyAgrivia (reference_prices ci-dessus).
create table if not exists public.market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id),
  farm_id uuid references public.farms(id),
  field_id uuid references public.fields(id),
  herd_id uuid references public.herds(id),
  crop_id uuid references public.crops(id),
  livestock_type_id uuid references public.livestock_types(id),
  volume_kg numeric not null check (volume_kg > 0),
  price_per_kg numeric not null,
  currency text not null default 'FCFA',
  status text not null default 'disponible_maintenant' check (status in ('disponible_maintenant','prochainement','programmee','appel_offres')),
  available_from date,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint market_listings_one_target check ((crop_id is not null and livestock_type_id is null) or (crop_id is null and livestock_type_id is not null))
);
alter table public.market_listings enable row level security;
create policy market_listings_public_read on public.market_listings for select using (active = true);
create policy market_listings_seller_all on public.market_listings for all using (seller_id = auth.uid() or public.is_admin()) with check (seller_id = auth.uid() and (public.is_pro() or public.is_admin()));

-- Prévision de récolte : recalculée à partir de crop_guides.expected_yield_kg_per_ha
-- et crops.cycle_days (jamais inventée par l'IA), et toujours corrigible manuellement
-- par le producteur (statut 'corrige_producteur' dans harvest_forecasts). Logique
-- entièrement côté frontend (Field.tsx) — aucun nouveau déclencheur nécessaire.

-- Appels d'offres (tenders/tender_responses) et ventes groupées entre producteurs
-- (cooperative_offers/commitments) existaient déjà avec RLS correcte ; le Lot 3 ajoute
-- l'interface "Ventes groupées" (bouton "S'engager") dans l'écran Marché.

-- ============================================================
-- AUDIT DU 1er OCTOBRE 2026 — Sécurité paiement, parrainage, prix de référence (public)
-- ============================================================
-- CORRECTIF SÉCURITÉ CRITIQUE : payment_intents avait une policy ALL permettant à
-- l'utilisateur propriétaire de modifier lui-même le statut de son propre paiement
-- (il aurait pu se déclarer "successful" sans paiement réel). Remplacée par :
--   - payment_intents_select : lecture par le propriétaire ou un admin
--   - payment_intents_insert : création par le propriétaire, statut limité à
--     ('non_configure','pending') — jamais 'successful' à la création
--   - payment_intents_admin_update : seule une mise à jour de statut par un admin
--     (ou plus tard le service_role depuis une Edge Function de webhook) est permise
-- Colonnes ajoutées : provider_reference, idempotency_key (unique), period
-- ('mensuel'/'annuel', nécessaire pour calculer la durée d'activation PRO), updated_at.
-- Table payment_status_log : journal d'audit de chaque changement de statut.
--
-- PROGRAMME DE PARRAINAGE (nouvelle exigence) :
--   - profiles.referral_code : code unique généré automatiquement à la création du profil
--   - referrals(referral_code, referrer_user_id, referred_user_id, referred_signup_at,
--     pro_conversion_at, qualifying_payment_intent_id, commission_amount, currency,
--     status pending/approved/paid/cancelled, valid_after, paid_at, cancel_reason)
--   - Anti-fraude testés en direct sur la base réelle : auto-parrainage refusé (contrainte
--     referrers_no_self), boucle de parrainage refusée (trigger check_referral_no_loop,
--     remontée récursive de la chaîne de parrainage), un filleul ne peut être parrainé
--     qu'une seule fois (contrainte unique referrals_referred_once)
--   - Capture automatique à l'inscription : trigger zz_capture_referral sur auth.users
--     (renommé depuis capture_referral pour s'exécuter APRÈS on_auth_user_created —
--     sinon la ligne profiles du filleul n'existe pas encore et l'insertion échoue
--     silencieusement ; bug trouvé et corrigé pendant cette session)
--   - L'action qualifiante est une conversion PRO réellement payée (payment_intents.status
--     passe à 'successful' avec purpose='abonnement_pro'), jamais la simple inscription
--   - referral_commission_config(rate_percent, validation_delay_days) : taux et délai
--     anti-fraude configurables par le Super Admin ; AUCUNE valeur par défaut non nulle
--     n'est imposée (conformément à la demande de ne pas coder un taux comme une règle)
--   - Fonction trigger on_payment_status_change (BEFORE UPDATE sur payment_intents) :
--     à chaque paiement PRO confirmé, active profiles.plan='pro' avec la bonne durée,
--     ET fait progresser le parrainage correspondant vers son délai de validation
--     (jamais directement vers 'approved' — validation manuelle ensuite)
--   - Fonction approve_due_referrals() : callable par un admin (RPC), approuve les
--     commissions dont le délai anti-fraude est écoulé
--   - Testé en direct (puis données de test supprimées) : paiement 2000 FCFA à 10% →
--     commission 200 FCFA en statut 'pending', PRO activé avec expiration +1 mois,
--     mise à jour frauduleuse du statut par l'utilisateur lui-même bien bloquée,
--     boucle de parrainage bien rejetée
--
-- PRIX DE RÉFÉRENCE PUBLIC :
--   - reference_prices et market_listings étaient déjà créés pour le Lot 3 (lecture admin
--     uniquement pour reference_prices, vendeur PRO pour market_listings) ; le portail
--     public (PublicGate) affiche désormais aussi ces offres réelles avec leur statut et
--     le prix de référence, en plus des appels d'offres — l'audit notait que le catalogue
--     public n'était pas complet, c'est corrigé.

-- ============================================================
-- DIAGNOSTIC IA RÉEL — AgroDoctor / VétoDoctor (Edge Function diagnose-image)
-- ============================================================
-- Table ai_diagnoses : historique des analyses, toujours rattachées à un utilisateur réel
-- (jamais anonyme), avec confiance et recommandation ; résultat brut conservé en JSON.
-- Edge Function "diagnose-image" (déployée, verify_jwt=true) : reçoit une photo en base64,
-- authentifie l'appelant via son JWT Supabase, appelle l'API Claude (vision, modèle
-- claude-sonnet-4-6) avec un prompt système forçant une réponse JSON stricte
-- (condition_label, confidence, recommendation, disclaimer), enregistre le résultat et
-- le renvoie. La clé ANTHROPIC_API_KEY vit uniquement en secret de la fonction côté
-- Supabase (Dashboard > Edge Functions > diagnose-image > Secrets) — jamais dans le
-- frontend. Tant que ce secret n'est pas configuré, la fonction répond explicitement
-- {error:'not_configured'} plutôt que d'inventer un résultat.

-- ============================================================
-- DOSSIER UNIQUE DU 5 OCTOBRE 2026 — Points P0 (a,b,c,d)
-- ============================================================
-- (a) MARCHÉ — workflow de modération réel, distinct du statut de vente existant :
--   market_listings.moderation_status (brouillon→soumise→en_controle→validee→publiee,
--   ou modification_demandee/refusee/suspendue/expiree), avec trigger serveur
--   enforce_market_moderation_transition qui impose les transitions autorisées par rôle
--   (le vendeur ne peut jamais s'auto-publier) et exige un motif pour un refus ou une
--   demande de modification. Journal d'audit : market_listing_history.
--   Bug RLS trouvé et corrigé pendant cette session : la policy précédente empêchait
--   l'admin de modérer les offres des AUTRES utilisateurs (elle exigeait seller_id =
--   son propre id même pour l'admin) — remplacée par des policies insert/update/delete
--   séparées. Cycle complet testé en direct : brouillon→soumission→refus motivé→
--   correction→resoumission→validation→publication→visibilité publique confirmée
--   pour un visiteur anonyme.
-- (b) INTRANTS — colonne description ajoutée (caractéristiques du produit), gestion
--   complète côté Admin (ajout, masquage/réactivation). Testé en direct.
-- (c) CARTE — fields.boundary (polygone, liste de points lat/lng) et boundary_area_ha
--   (superficie calculée automatiquement par formule du lacet sur projection
--   équirectangulaire locale — vérifiée mathématiquement : carré 100×100 m → 1,00 ha).
--   Carte réelle (tuiles OpenStreetMap via Leaflet, chargé en CDN dans index.html,
--   pas de dépendance npm supplémentaire) avec dessin de polygone au clic.
-- (d) AGRODOCTOR/VÉTODOCTOR — proposition de traitement désormais structurée et
--   séparée de la recommandation générale : ai_diagnoses.treatment_product,
--   treatment_dosage, treatment_precautions. Edge Function diagnose-image mise à
--   jour (v2) avec consigne explicite de ne jamais inventer un dosage chiffré précis
--   pour une marque qu'elle ne connaît pas réellement.
--
-- RAPPEL IMPORTANT — Bug réel trouvé et corrigé dans cette même session, signalé par un
-- document d'audit externe (lui-même en grande partie erroné sur le reste, car écrit sans
-- accès au vrai code) : worker_invites.created_by est NOT NULL mais n'était jamais envoyé
-- par Team().createInvite() — corrigé côté frontend (created_by:profile.id ajouté à l'insert).
