-- MA FERME : gouvernance (comité), règles agronomiques, conseils, matières actives, journal des travaux.
-- Déjà appliqué sur la base de production (migrations ma_ferme_a_gouvernance_regles_journal + treatments_type_elargi).
-- À rejouer uniquement sur une base neuve, après supabase_schema.sql.

create or replace function public.is_farm_member(p_farm uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.farms f where f.id=p_farm and f.owner_id=auth.uid())
      or exists(select 1 from public.workers w where w.farm_id=p_farm and w.user_id=auth.uid());
$$;
create or replace function public.is_field_member(p_field uuid) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select public.is_farm_member(fi.farm_id) from public.fields fi where fi.id=p_field), false);
$$;

create table if not exists public.committee_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.committee_members enable row level security;
create or replace function public.is_committee() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.committee_members where user_id=auth.uid());
$$;
grant execute on function public.is_farm_member(uuid), public.is_field_member(uuid), public.is_committee() to authenticated, anon;
create policy committee_members_read on public.committee_members for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy committee_members_admin_write on public.committee_members for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.governance_history (
  id uuid primary key default gen_random_uuid(),
  table_name text not null, record_id uuid not null, old_status text, new_status text not null,
  actor_id uuid references public.profiles(id), created_at timestamptz not null default now()
);
alter table public.governance_history enable row level security;
create policy governance_history_read on public.governance_history for select to authenticated using (public.is_committee() or public.is_admin());

create table if not exists public.agro_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null check (rule_type in ('besoin_engrais','dose_pied','dose_foliaire','dose_traitement')),
  crop_id uuid not null references public.crops(id),
  territory text not null default 'Cameroun',
  payload jsonb not null, source text not null, version int not null default 1,
  status text not null default 'brouillon' check (status in ('brouillon','en_validation','validee','suspendue')),
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) default auth.uid(),
  validated_by uuid references public.profiles(id), validated_at timestamptz, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (rule_type, crop_id, territory, version)
);
alter table public.agro_rules enable row level security;
create policy agro_rules_read on public.agro_rules for select to authenticated using (status='validee' or is_demo or public.is_committee() or public.is_admin());
create policy agro_rules_write on public.agro_rules for all to authenticated using (public.is_committee() or public.is_admin()) with check (public.is_committee() or public.is_admin());

create table if not exists public.crop_advice (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references public.crops(id),
  category text not null check (category in ('choix_plants','emplacement','preparation','plantation','conduite','desherbage','irrigation','fertilisation','surveillance','recolte')),
  week_from int not null check (week_from >= 0), week_to int not null check (week_to >= week_from),
  title text not null, body text not null, source text not null default 'à renseigner par le comité',
  version int not null default 1,
  status text not null default 'brouillon' check (status in ('brouillon','en_validation','validee','suspendue')),
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) default auth.uid(),
  validated_by uuid references public.profiles(id), validated_at timestamptz, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.crop_advice enable row level security;
create policy crop_advice_read on public.crop_advice for select to authenticated using (status='validee' or is_demo or public.is_committee() or public.is_admin());
create policy crop_advice_write on public.crop_advice for all to authenticated using (public.is_committee() or public.is_admin()) with check (public.is_committee() or public.is_admin());

create or replace function public.enforce_validation_governance() returns trigger language plpgsql security definer set search_path=public as $$
declare ignore_keys text[] := array['status','validated_by','validated_at','updated_at','note'];
        a jsonb; b jsonb; k text;
begin
  if tg_op='INSERT' then
    if new.status not in ('brouillon','en_validation') then
      raise exception 'Une nouvelle entrée doit être créée en brouillon ou en validation, pas directement « % ».', new.status;
    end if;
    return new;
  end if;
  new.updated_at := now();
  if old.status='validee' then
    a := to_jsonb(old); b := to_jsonb(new);
    foreach k in array ignore_keys loop a := a - k; b := b - k; end loop;
    if a is distinct from b then
      raise exception 'Cette entrée est validée et ne peut pas être modifiée : créez une nouvelle version.';
    end if;
  end if;
  if new.status is distinct from old.status then
    if new.status='validee' then
      if not public.is_committee() then raise exception 'Seul un membre du comité technique peut valider.'; end if;
      new.validated_by := auth.uid(); new.validated_at := now();
    elsif old.status='validee' and new.status not in ('suspendue') then
      raise exception 'Une entrée validée ne peut qu''être suspendue.';
    elsif old.status='suspendue' and new.status='validee' then
      raise exception 'Réactivation : repasser par une validation du comité.';
    end if;
    insert into public.governance_history(table_name, record_id, old_status, new_status, actor_id)
    values (tg_table_name, new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end; $$;
create trigger enforce_validation_governance before insert or update on public.agro_rules for each row execute procedure public.enforce_validation_governance();
create trigger enforce_validation_governance before insert or update on public.crop_advice for each row execute procedure public.enforce_validation_governance();

create or replace function public.enforce_disease_validation() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.validated and (tg_op='INSERT' or not old.validated) and not public.is_committee() then
    raise exception 'Seul un membre du comité technique peut valider une fiche.';
  end if;
  return new;
end; $$;
create trigger enforce_disease_validation before insert or update on public.plant_diseases for each row execute procedure public.enforce_disease_validation();

create table if not exists public.active_ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  family text not null default 'autre' check (family in ('insecticide','fongicide','herbicide','acaricide','nematicide','autre')),
  legal_status text not null default 'non_verifie' check (legal_status in ('homologue','restreint','interdit','non_verifie')),
  toxicity_class text,
  pre_harvest_interval_days int check (pre_harvest_interval_days is null or pre_harvest_interval_days >= 0),
  source text, notes text, is_demo boolean not null default false,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint active_ingredients_source_required check (legal_status = 'non_verifie' or source is not null)
);
create unique index if not exists active_ingredients_name_uidx on public.active_ingredients (lower(name));
alter table public.active_ingredients enable row level security;
create policy active_ingredients_read on public.active_ingredients for select to authenticated using (true);
create policy active_ingredients_write on public.active_ingredients for all to authenticated using (public.is_committee() or public.is_admin()) with check (public.is_committee() or public.is_admin());

alter table public.treatments
  add column if not exists active_ingredient_id uuid references public.active_ingredients(id),
  add column if not exists dose_value numeric check (dose_value is null or dose_value >= 0),
  add column if not exists dose_unit text,
  add column if not exists area_ha numeric check (area_ha is null or area_ha >= 0),
  add column if not exists performed_by uuid references public.profiles(id),
  add column if not exists pre_harvest_until date,
  add column if not exists rule_id uuid references public.agro_rules(id),
  add column if not exists notes text,
  add column if not exists created_by uuid references public.profiles(id);

alter table public.treatments drop constraint if exists treatments_type_check;
alter table public.treatments add constraint treatments_type_check check (type = any (array['engrais','pesticide','insecticide','fongicide','herbicide','irrigation','désherbage','vaccin','vermifuge','semis','plantation','récolte','autre']));

create or replace function public.treatments_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare ai record;
begin
  if tg_op='INSERT' then new.created_by := auth.uid(); if new.performed_by is null then new.performed_by := auth.uid(); end if; end if;
  if new.active_ingredient_id is not null then
    select * into ai from public.active_ingredients where id=new.active_ingredient_id;
    if ai.legal_status='interdit' then
      raise exception 'Matière active interdite au Cameroun (%). Enregistrement refusé.', coalesce(ai.source,'source non précisée');
    end if;
    if ai.pre_harvest_interval_days is not null and new.treatment_date is not null then
      new.pre_harvest_until := new.treatment_date + ai.pre_harvest_interval_days;
    end if;
  end if;
  return new;
end; $$;
create trigger treatments_guard before insert or update on public.treatments for each row execute procedure public.treatments_guard();

create policy treatments_select_member on public.treatments for select to authenticated using (field_id is not null and public.is_field_member(field_id));
create policy treatments_insert_member on public.treatments for insert to authenticated with check (field_id is not null and public.is_field_member(field_id));
create policy fields_select_worker on public.fields for select to authenticated using (public.is_farm_member(farm_id));
create policy farms_select_worker on public.farms for select to authenticated using (public.is_farm_member(id));
create policy harvest_forecasts_select_member on public.harvest_forecasts for select to authenticated using (field_id is not null and public.is_field_member(field_id));

alter table public.ai_diagnoses
  add column if not exists field_id uuid references public.fields(id),
  add column if not exists follow_status text not null default 'a_traiter' check (follow_status in ('a_traiter','traite','resolu'));
create policy ai_diagnoses_select_member on public.ai_diagnoses for select to authenticated using (field_id is not null and public.is_field_member(field_id));
create policy ai_diagnoses_update_follow on public.ai_diagnoses for update to authenticated using (
  user_id=auth.uid() or (field_id is not null and public.is_field_member(field_id))) with check (
  user_id=auth.uid() or (field_id is not null and public.is_field_member(field_id)));
create or replace function public.ai_diagnoses_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.field_id is not null and not public.is_field_member(new.field_id) then
      raise exception 'Ce champ n''appartient pas à votre exploitation.';
    end if;
  elsif (to_jsonb(new) - 'follow_status') is distinct from (to_jsonb(old) - 'follow_status') then
    raise exception 'Le résultat d''un diagnostic ne peut pas être modifié, seul son suivi.';
  end if;
  return new;
end; $$;
create trigger ai_diagnoses_guard before insert or update on public.ai_diagnoses for each row execute procedure public.ai_diagnoses_guard();

-- Données chargées (voir README) : matières interdites sourcées + lignes DÉMO (is_demo = true) supprimables depuis le panneau Comité.

-- Types de règles : besoin_engrais (N-P-K kg/ha), dose_pied (granulé, g par pied), dose_foliaire (liquide, pulvérisateur), dose_traitement (pesticide/insecticide/fongicide/herbicide, champ payload.family).
