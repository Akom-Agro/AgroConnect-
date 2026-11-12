-- DulyAgrivia — lot 12/11 : fiches produit complètes, intrants vendables, vitrine publique, tâches assignées avant inscription de l'ouvrier.
-- Additif uniquement.

-- 1) Fiche produit du marché
alter table public.market_listings add column if not exists product_name text check (product_name is null or char_length(product_name) <= 120);
alter table public.market_listings add column if not exists sale_unit text not null default 'kg' check (sale_unit in ('kg','tonne','sac','cageot','carton','fût','litre','pièce','régime','botte'));
alter table public.market_listings add column if not exists units_available numeric check (units_available is null or units_available > 0);
alter table public.market_listings add column if not exists unit_weight_kg numeric check (unit_weight_kg is null or unit_weight_kg > 0);
alter table public.market_listings drop constraint if exists market_listings_note_len;
alter table public.market_listings add constraint market_listings_note_len check (note is null or char_length(note) <= 1500);

-- 2) Appels d'offres : description du besoin
alter table public.tenders add column if not exists description text check (description is null or char_length(description) <= 1500);
alter table public.tenders add column if not exists preferred_unit text check (preferred_unit is null or char_length(preferred_unit) <= 40);

-- 3) Ventes groupées : description
alter table public.cooperative_offers add column if not exists description text check (description is null or char_length(description) <= 1500);

-- 4) Intrants vendables : prix, unité, photos (bucket product-labels, public en lecture)
alter table public.input_products add column if not exists price_fcfa numeric check (price_fcfa is null or price_fcfa >= 0);
alter table public.input_products add column if not exists sale_unit text check (sale_unit is null or char_length(sale_unit) <= 40);
alter table public.input_products add column if not exists photo_paths text[] not null default '{}';
alter table public.input_products drop constraint if exists input_products_photos_max;
alter table public.input_products add constraint input_products_photos_max check (coalesce(array_length(photo_paths,1),0) <= 4);

-- 5) Totaux des ventes groupées visibles par les visiteurs (aucune donnée personnelle)
create or replace function public.coop_offer_totals_public()
returns table(offer_id uuid, committed_kg numeric, producers integer)
language sql stable security definer set search_path to 'public' as $f$
  select c.offer_id, coalesce(sum(c.volume_kg) filter (where c.status='actif'),0), count(*) filter (where c.status='actif')::int
  from public.commitments c join public.cooperative_offers o on o.id=c.offer_id
  where o.status='ouvert' group by c.offer_id;
$f$;
revoke all on function public.coop_offer_totals_public() from public;
grant execute on function public.coop_offer_totals_public() to anon, authenticated;

-- 6) Tâches : assignables à un ouvrier invité qui ne s'est pas encore inscrit ; transférées à son inscription
alter table public.tasks add column if not exists assigned_invite uuid references public.worker_invites(id) on delete set null;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare safe_role text; inv record;
begin
  safe_role := new.raw_user_meta_data->>'role';
  if new.raw_user_meta_data->>'invite_code' is not null then
    select * into inv from public.worker_invites where code = new.raw_user_meta_data->>'invite_code' and used = false limit 1;
    if inv.id is not null then
      insert into public.profiles(id,full_name,phone,role,country)
      values(new.id, coalesce(new.raw_user_meta_data->>'full_name', inv.full_name), coalesce(new.raw_user_meta_data->>'phone', inv.phone), 'ouvrier', 'Cameroun')
      on conflict(id) do nothing;
      insert into public.workers(farm_id, user_id, phone) values (inv.farm_id, new.id, new.raw_user_meta_data->>'phone')
      on conflict do nothing;
      update public.worker_invites set used=true, used_by=new.id, used_at=now() where id=inv.id;
      update public.tasks set assigned_to=new.id, assigned_invite=null where assigned_invite=inv.id;
      return new;
    end if;
  end if;
  if safe_role is null or safe_role not in ('producteur','acheteur') then
    safe_role := 'producteur';
  end if;
  insert into public.profiles(id,full_name,phone,role,country)
  values(new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', safe_role, 'Cameroun')
  on conflict(id) do nothing;
  return new;
end; $f$;

-- 7) Vitrine publique : lecture seule pour les visiteurs (le contact des financements reste réservé aux inscrits)
drop policy if exists input_products_public_read on public.input_products;
create policy input_products_public_read on public.input_products for select to anon using (active);
drop policy if exists funding_programs_public_read on public.funding_programs;
create policy funding_programs_public_read on public.funding_programs for select to anon using (active);
drop policy if exists coop_public_read on public.cooperative_offers;
create policy coop_public_read on public.cooperative_offers for select to anon using (status = 'ouvert');
revoke select on public.funding_programs from anon;
grant select (id, name, organization, sector, region, description, active, created_at, is_demo) on public.funding_programs to anon;
