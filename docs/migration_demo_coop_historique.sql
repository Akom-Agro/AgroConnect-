-- DulyAgrivia — lot 7/11 : démonstration, coopérative (échanges), historique des diagnostics avec photos, réponse admin aux appels d'offres.
-- Additif : aucune table ou donnée existante n'est supprimée.

-- 1) Marqueur DÉMO sur les tables métier (les vraies données gardent is_demo = false)
alter table public.tenders              add column if not exists is_demo boolean not null default false;
alter table public.tender_responses     add column if not exists is_demo boolean not null default false;
alter table public.market_listings      add column if not exists is_demo boolean not null default false;
alter table public.cooperative_offers   add column if not exists is_demo boolean not null default false;
alter table public.commitments          add column if not exists is_demo boolean not null default false;
alter table public.input_products       add column if not exists is_demo boolean not null default false;
alter table public.funding_programs     add column if not exists is_demo boolean not null default false;
alter table public.ai_diagnoses         add column if not exists is_demo boolean not null default false;

-- 2) Diagnostic IA : photos conservées (bucket privé, un dossier par utilisateur)
alter table public.ai_diagnoses add column if not exists image_paths text[] not null default '{}';
create or replace function public.ai_diagnoses_guard() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if tg_op='INSERT' then
    if new.field_id is not null and not public.is_field_member(new.field_id) then
      raise exception 'Ce champ n''appartient pas à votre exploitation.';
    end if;
  elsif (to_jsonb(new) - 'follow_status' - 'image_paths') is distinct from (to_jsonb(old) - 'follow_status' - 'image_paths') then
    raise exception 'Le résultat d''un diagnostic ne peut pas être modifié, seul son suivi.';
  end if;
  return new;
end; $f$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diagnostic-photos', 'diagnostic-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists diag_photos_insert on storage.objects;
create policy diag_photos_insert on storage.objects for insert to authenticated with check (bucket_id='diagnostic-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists diag_photos_select on storage.objects;
create policy diag_photos_select on storage.objects for select to authenticated using (bucket_id='diagnostic-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists diag_photos_delete on storage.objects;
create policy diag_photos_delete on storage.objects for delete to authenticated using (bucket_id='diagnostic-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Appels d'offres : l'administrateur peut répondre avec ses propres champs (test et usage réel)
drop policy if exists responses_insert on public.tender_responses;
create policy responses_insert on public.tender_responses for insert to authenticated
  with check (producer_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role in ('producteur','admin','super_admin')));

-- 4) Coopérative : échanges entre producteurs (conseils, questions, informations)
create table if not exists public.coop_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text,
  sector text not null default 'agriculture' check (sector in ('agriculture','elevage')),
  kind text not null default 'conseil' check (kind in ('conseil','question','information')),
  crop_id uuid references public.crops(id) on delete set null,
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 2000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.coop_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.coop_posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text,
  body text not null check (char_length(body) between 1 and 1000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists coop_replies_post_idx on public.coop_replies(post_id, created_at);
create index if not exists coop_posts_created_idx on public.coop_posts(created_at desc);
create or replace function public.coop_set_author() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
    select coalesce(nullif(trim(full_name),''),'Producteur') into new.author_name from public.profiles where id = auth.uid();
  elsif new.author_name is null then
    select coalesce(nullif(trim(full_name),''),'Producteur') into new.author_name from public.profiles where id = new.author_id;
  end if;
  return new;
end; $f$;
drop trigger if exists coop_posts_author on public.coop_posts;
create trigger coop_posts_author before insert on public.coop_posts for each row execute function public.coop_set_author();
drop trigger if exists coop_replies_author on public.coop_replies;
create trigger coop_replies_author before insert on public.coop_replies for each row execute function public.coop_set_author();
alter table public.coop_posts enable row level security;
alter table public.coop_replies enable row level security;
drop policy if exists coop_posts_read on public.coop_posts;
create policy coop_posts_read on public.coop_posts for select to authenticated using (true);
drop policy if exists coop_posts_insert on public.coop_posts;
create policy coop_posts_insert on public.coop_posts for insert to authenticated with check (author_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role in ('producteur','admin','super_admin')));
drop policy if exists coop_posts_delete on public.coop_posts;
create policy coop_posts_delete on public.coop_posts for delete to authenticated using (author_id = auth.uid() or public.is_admin());
drop policy if exists coop_replies_read on public.coop_replies;
create policy coop_replies_read on public.coop_replies for select to authenticated using (true);
drop policy if exists coop_replies_insert on public.coop_replies;
create policy coop_replies_insert on public.coop_replies for insert to authenticated with check (author_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role in ('producteur','admin','super_admin')));
drop policy if exists coop_replies_delete on public.coop_replies;
create policy coop_replies_delete on public.coop_replies for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- 5) Démonstration : chargement et suppression (administrateur uniquement)
create or replace function public._seed_demo() returns text language plpgsql security definer set search_path to 'public' as $f$
declare
  v_buyer uuid; v_prod uuid; v_admin uuid;
  v_pfield uuid; v_pfarm uuid; v_afield uuid; v_afarm uuid; v_pfarm2 uuid;
  c_tom uuid; c_mais uuid; c_plan uuid; c_leg uuid; c_avo uuid; l_type uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; o1 uuid; o2 uuid; p1 uuid; p2 uuid; p3 uuid;
begin
  if exists (select 1 from public.tenders where is_demo) then return 'La démonstration est déjà chargée.'; end if;
  select id into v_buyer from public.profiles where role='acheteur' order by created_at limit 1;
  select id into v_prod  from public.profiles where role='producteur' order by created_at limit 1;
  select id into v_admin from public.profiles where role='super_admin' order by created_at limit 1;
  if v_admin is null then select id into v_admin from public.profiles where role='admin' order by created_at limit 1; end if;
  if v_buyer is null then v_buyer := v_admin; end if;
  if v_prod  is null then v_prod  := v_admin; end if;
  select id into c_tom  from public.crops where name='Tomate'   limit 1;
  select id into c_mais from public.crops where name='Maïs'     limit 1;
  select id into c_plan from public.crops where name='Plantain' limit 1;
  select id into c_leg  from public.crops where name='Légumes'  limit 1;
  select id into c_avo  from public.crops where name='Avocat'   limit 1;
  select id into l_type from public.livestock_types where active order by name limit 1;
  select fa.id, f.id into v_pfarm, v_pfield from public.farms fa join public.fields f on f.farm_id=fa.id where fa.owner_id=v_prod order by f.created_at limit 1;
  select fa.id, f.id into v_afarm, v_afield from public.farms fa join public.fields f on f.farm_id=fa.id where fa.owner_id=v_admin and f.crop_id=c_tom order by f.created_at limit 1;
  if v_afield is null then select fa.id, f.id into v_afarm, v_afield from public.farms fa join public.fields f on f.farm_id=fa.id where fa.owner_id=v_admin order by f.created_at limit 1; end if;
  select id into v_pfarm2 from public.farms where owner_id=v_prod order by created_at limit 1;

  -- Appels d'offres (acheteur)
  insert into public.tenders(buyer_id,crop_id,volume_kg,delivery_from,delivery_to,tolerance_days,price_note,delivery_zone,is_demo) values (v_buyer,c_tom,2000,current_date+45,current_date+75,15,'DÉMO — 300 à 350 FCFA/kg selon qualité','Bafoussam',true) returning id into t1;
  insert into public.tenders(buyer_id,crop_id,volume_kg,delivery_from,delivery_to,tolerance_days,price_note,delivery_zone,is_demo) values (v_buyer,c_mais,5000,current_date+60,current_date+100,20,'DÉMO — prix à négocier','Douala',true) returning id into t2;
  insert into public.tenders(buyer_id,crop_id,volume_kg,delivery_from,delivery_to,tolerance_days,price_note,delivery_zone,is_demo) values (v_buyer,coalesce(c_leg,c_plan),800,current_date+30,current_date+50,10,'DÉMO — livraison hebdomadaire','Yaoundé',true) returning id into t3;
  if l_type is not null then insert into public.tenders(buyer_id,livestock_type_id,volume_kg,delivery_from,delivery_to,tolerance_days,price_note,delivery_zone,is_demo) values (v_buyer,l_type,600,current_date+40,current_date+60,10,'DÉMO — à discuter','Bafoussam',true) returning id into t4; end if;
  -- Réponses
  if v_pfield is not null then insert into public.tender_responses(tender_id,producer_id,field_id,offered_volume_kg,estimated_harvest_date,note,status,is_demo) values (t3,v_prod,v_pfield,500,current_date+40,'DÉMO — proposition du producteur','pending',true); end if;
  if v_afield is not null then
    insert into public.tender_responses(tender_id,producer_id,field_id,offered_volume_kg,estimated_harvest_date,note,status,is_demo) values (t1,v_admin,v_afield,1200,current_date+55,'DÉMO — proposition de l''administrateur','accepted',true);
    insert into public.tender_responses(tender_id,producer_id,field_id,offered_volume_kg,estimated_harvest_date,note,status,is_demo) values (t2,v_admin,v_afield,2000,current_date+70,'DÉMO — exemple refusé','rejected',true);
  end if;

  -- Marché (le déclencheur de modération exige 3 photos : désactivé le temps de la démo, les offres démo n'ont pas de photo)
  alter table public.market_listings disable trigger enforce_market_moderation_transition;
  insert into public.market_listings(seller_id,farm_id,crop_id,volume_kg,price_per_kg,currency,status,available_from,note,active,moderation_status,is_demo) values
    (v_prod,v_pfarm,c_tom ,1200,350,'FCFA','disponible_maintenant',current_date,'DÉMO — tomates fraîches',true,'publiee',true),
    (v_prod,v_pfarm,c_mais,3000,250,'FCFA','prochainement',current_date+30,'DÉMO — maïs grain',true,'publiee',true),
    (v_prod,v_pfarm,c_plan, 800,200,'FCFA','programmee',current_date+60,'DÉMO — plantain',true,'publiee',true),
    (v_prod,v_pfarm,c_avo , 600,400,'FCFA','disponible_maintenant',current_date,'DÉMO — avocats',true,'publiee',true);
  alter table public.market_listings enable trigger enforce_market_moderation_transition;

  -- Coopérative : offres groupées + engagements
  if v_pfarm2 is not null then
    insert into public.cooperative_offers(farm_id,crop_id,target_volume_kg,price_per_kg,harvest_date,payment_terms,status,is_demo) values (v_pfarm2,c_tom,5000,330,current_date+60,'DÉMO — paiement à la livraison','ouvert',true) returning id into o1;
    insert into public.cooperative_offers(farm_id,crop_id,target_volume_kg,price_per_kg,harvest_date,payment_terms,status,is_demo) values (v_pfarm2,c_mais,10000,240,current_date+90,'DÉMO — 50 % à la commande','ouvert',true) returning id into o2;
    insert into public.commitments(offer_id,farm_id,volume_kg,status,is_demo) values (o1,v_pfarm2,1000,'actif',true),(o2,v_pfarm2,2500,'actif',true);
    if v_afarm is not null then insert into public.commitments(offer_id,farm_id,volume_kg,status,is_demo) values (o1,v_afarm,1500,'actif',true); end if;
  end if;

  -- Échanges entre agriculteurs
  insert into public.coop_posts(author_id,sector,kind,crop_id,title,body,is_demo) values (v_prod,'agriculture','question',c_tom,'Taches brunes sur les feuilles de tomate','DÉMO — Depuis la saison des pluies, mes feuilles de tomate ont des taches brunes. Quelqu''un a déjà vu cela ? Comment avez-vous réagi ?',true) returning id into p1;
  insert into public.coop_replies(post_id,author_id,body,is_demo) values (p1,v_admin,'DÉMO — Retirez les feuilles atteintes, évitez d''arroser sur le feuillage et faites diagnostiquer une photo dans AgroDoctor IA.',true);
  insert into public.coop_posts(author_id,sector,kind,crop_id,title,body,is_demo) values (v_admin,'agriculture','conseil',c_mais,'Espacer les lignes pour mieux aérer','DÉMO — Un bon espacement limite l''humidité entre les plants et facilite le passage pour l''entretien. Partagez vos écartements habituels.',true) returning id into p2;
  insert into public.coop_replies(post_id,author_id,body,is_demo) values (p2,v_prod,'DÉMO — Merci, je teste cela sur ma prochaine parcelle.',true);
  insert into public.coop_posts(author_id,sector,kind,title,body,is_demo) values (v_prod,'agriculture','information','Regroupons nos volumes de tomate','DÉMO — Une offre groupée de tomates est ouverte dans l''onglet Ventes groupées : engagez-vous avec votre volume.',true) returning id into p3;
  if l_type is not null then insert into public.coop_posts(author_id,sector,kind,title,body,is_demo) values (v_admin,'elevage','question','Vaccination : à quel rythme ?','DÉMO — Comment organisez-vous le calendrier de vaccination de votre cheptel ? Demandez toujours l''avis d''un vétérinaire.',true); end if;

  -- Intrants et financement (exemples fictifs)
  insert into public.input_products(sector,category,name,supplier_name,price_note,region,description,active,is_demo) values
   ('agriculture','Semences','Semences de tomate (exemple)','Fournisseur démo A','Prix indicatif démo','Ouest','DÉMO — exemple de fiche semences.',true,true),
   ('agriculture','Engrais','Engrais NPK (exemple)','Fournisseur démo B','Prix indicatif démo','Ouest','DÉMO — voir le catalogue Engrais pour les analyses.',true,true),
   ('agriculture','Phytosanitaire','Fongicide (exemple)','Fournisseur démo C','Prix sur demande','Centre','DÉMO — vérifier l''homologation avant usage.',true,true),
   ('agriculture','Matériel','Pulvérisateur 16 L (exemple)','Fournisseur démo D','Prix indicatif démo','Littoral','DÉMO — matériel de traitement.',true,true),
   ('agriculture','Irrigation','Kit goutte-à-goutte (exemple)','Fournisseur démo E','Prix sur demande','Ouest','DÉMO — irrigation.',true,true),
   ('elevage','Aliment','Aliment volaille (exemple)','Fournisseur démo F','Prix indicatif démo','Ouest','DÉMO — aliment démarrage.',true,true),
   ('elevage','Santé','Vaccin (exemple)','Fournisseur démo G','Sur ordonnance','Centre','DÉMO — sur avis vétérinaire.',true,true);
  insert into public.funding_programs(name,organization,sector,region,description,active,is_demo) values
   ('Programme jeunes agriculteurs (exemple)','Organisme démo 1','agriculture','National','DÉMO — fiche fictive pour tester l''affichage.',true,true),
   ('Microcrédit campagne (exemple)','Organisme démo 2','both','Ouest','DÉMO — fiche fictive.',true,true),
   ('Appui à l''élevage (exemple)','Organisme démo 3','elevage','National','DÉMO — fiche fictive.',true,true);

  -- Historique des diagnostics (exemples sans photo)
  insert into public.ai_diagnoses(user_id,sector,condition_label,confidence,recommendation,treatment_product,treatment_dosage,treatment_precautions,raw_response,model,is_demo) values
   (v_admin,'agriculture','DÉMO — Mildiou possible (exemple)','moyenne','Exemple : retirer les feuilles atteintes, aérer la culture, éviter l''arrosage sur le feuillage.','Fongicide adapté (à confirmer)','À confirmer sur l''étiquette du produit','Consulter un agronome en cas de doute','{"demo":true,"disclaimer":"Exemple de démonstration, pas un vrai diagnostic."}'::jsonb,'demo',true),
   (v_admin,'agriculture','DÉMO — Aucune anomalie visible (exemple)','elevee','Exemple : la plante semble saine, continuer la surveillance.',null,null,null,'{"demo":true,"disclaimer":"Exemple de démonstration, pas un vrai diagnostic."}'::jsonb,'demo',true);
  return 'Démonstration chargée.';
end; $f$;

create or replace function public.seed_demo_data() returns text language plpgsql security definer set search_path to 'public' as $f$
begin
  if not public.is_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  return public._seed_demo();
end; $f$;

create or replace function public.purge_demo_data() returns text language plpgsql security definer set search_path to 'public' as $f$
declare n1 int; n2 int; n3 int; n4 int; n5 int; n6 int; n7 int; n8 int;
begin
  if not public.is_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  delete from public.coop_replies where is_demo or post_id in (select id from public.coop_posts where is_demo);
  delete from public.coop_posts where is_demo; get diagnostics n1 = row_count;
  delete from public.commitments where is_demo or offer_id in (select id from public.cooperative_offers where is_demo);
  delete from public.cooperative_offers where is_demo; get diagnostics n2 = row_count;
  delete from public.tender_responses where is_demo or tender_id in (select id from public.tenders where is_demo);
  delete from public.tenders where is_demo; get diagnostics n3 = row_count;
  delete from public.market_listings where is_demo; get diagnostics n4 = row_count;
  delete from public.input_products where is_demo; get diagnostics n5 = row_count;
  delete from public.funding_programs where is_demo; get diagnostics n6 = row_count;
  delete from public.ai_diagnoses where is_demo; get diagnostics n7 = row_count;
  return format('Supprimé : %s échanges, %s offres groupées, %s appels d''offres, %s offres du marché, %s intrants, %s financements, %s diagnostics.', n1,n2,n3,n4,n5,n6,n7);
end; $f$;

revoke all on function public._seed_demo() from public, anon, authenticated;
revoke all on function public.seed_demo_data() from public, anon;
revoke all on function public.purge_demo_data() from public, anon;
grant execute on function public.seed_demo_data() to authenticated;
grant execute on function public.purge_demo_data() to authenticated;

select public._seed_demo();
