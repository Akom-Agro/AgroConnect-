-- PHOTOS DES OFFRES DU MARCHÉ (déjà appliqué sur la base de production : migration photos_offres_marche).
-- À rejouer uniquement sur une base neuve. Au moins 3 photos pour soumettre ou publier une offre, 6 maximum.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('market-images','market-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy market_images_upload on storage.objects for insert to authenticated
  with check (bucket_id='market-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy market_images_delete on storage.objects for delete to authenticated
  using (bucket_id='market-images' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

create table if not exists public.market_listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.market_listings(id) on delete cascade,
  path text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (listing_id, path)
);
alter table public.market_listing_images enable row level security;
create policy mli_select on public.market_listing_images for select to anon, authenticated using (
  exists (select 1 from public.market_listings l where l.id = listing_id));
create policy mli_insert on public.market_listing_images for insert to authenticated with check (
  exists (select 1 from public.market_listings l where l.id = listing_id and l.seller_id = auth.uid())
  and path like auth.uid()::text || '/%');
create policy mli_delete on public.market_listing_images for delete to authenticated using (
  exists (select 1 from public.market_listings l where l.id = listing_id and (l.seller_id = auth.uid() or public.is_admin())));

create or replace function public.market_images_limit() returns trigger language plpgsql security definer set search_path=public as $fn$
begin
  if (select count(*) from public.market_listing_images where listing_id=new.listing_id) >= 6 then
    raise exception 'Maximum 6 photos par offre.';
  end if;
  return new;
end; $fn$;
create trigger market_images_limit before insert on public.market_listing_images for each row execute procedure public.market_images_limit();
revoke execute on function public.market_images_limit() from public, anon, authenticated;
-- La fonction enforce_market_moderation_transition() a aussi été mise à jour : elle refuse soumise/validee/publiee avec moins de 3 photos.
