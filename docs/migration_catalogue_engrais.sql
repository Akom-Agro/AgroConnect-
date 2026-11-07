-- Catalogue des engrais du commerce (sacs, analyse N-P2O5-K2O lue sur l'étiquette du fabricant).
-- Les analyses sont celles du fabricant ; le comité technique n'a pas à les homologuer.
-- Les besoins des cultures (kg/ha) restent, eux, dans agro_rules (validés par le comité).
create table if not exists public.fertilizer_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  brand text check (brand is null or char_length(brand) <= 100),
  n_pct numeric(5,2) not null default 0 check (n_pct >= 0 and n_pct <= 100),
  p2o5_pct numeric(5,2) not null default 0 check (p2o5_pct >= 0 and p2o5_pct <= 100),
  k2o_pct numeric(5,2) not null default 0 check (k2o_pct >= 0 and k2o_pct <= 100),
  bag_kg numeric(6,2) not null default 50 check (bag_kg > 0 and bag_kg <= 1000),
  verified boolean not null default false,
  source text check (source is null or char_length(source) <= 300),
  notes text check (notes is null or char_length(notes) <= 1000),
  label_photos text[] not null default '{}',
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fertilizer_total_pct check (n_pct + p2o5_pct + k2o_pct <= 100),
  constraint fertilizer_has_nutrient check (n_pct + p2o5_pct + k2o_pct > 0),
  constraint fertilizer_photos_max check (coalesce(array_length(label_photos, 1), 0) <= 3)
);
alter table public.fertilizer_products enable row level security;
drop policy if exists fertilizer_products_read on public.fertilizer_products;
create policy fertilizer_products_read on public.fertilizer_products for select to authenticated using (active or public.is_admin());
drop policy if exists fertilizer_products_admin_write on public.fertilizer_products;
create policy fertilizer_products_admin_write on public.fertilizer_products for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-labels', 'product-labels', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists product_labels_admin_insert on storage.objects;
create policy product_labels_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'product-labels' and public.is_admin());
drop policy if exists product_labels_admin_update on storage.objects;
create policy product_labels_admin_update on storage.objects for update to authenticated using (bucket_id = 'product-labels' and public.is_admin()) with check (bucket_id = 'product-labels' and public.is_admin());
drop policy if exists product_labels_admin_delete on storage.objects;
create policy product_labels_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'product-labels' and public.is_admin());

-- Produits de départ : analyses TYPIQUES du marché, marquées « à vérifier sur le sac » (verified = false).
insert into public.fertilizer_products (name, n_pct, p2o5_pct, k2o_pct, bag_kg, verified, source)
select v.name, v.n, v.p, v.k, 50, false, 'Analyse typique du marché, à confirmer sur l''étiquette du sac'
from (values
  ('NPK 20-10-10', 20, 10, 10),
  ('NPK 12-12-17', 12, 12, 17),
  ('OCP 14-23-14', 14, 23, 14),
  ('DAP 16-46-0', 16, 46, 0),
  ('Urée 46 %', 46, 0, 0),
  ('MOP (chlorure de potassium)', 0, 0, 60),
  ('TSP (superphosphate triple)', 0, 46, 0)
) as v(name, n, p, k)
where not exists (select 1 from public.fertilizer_products);
