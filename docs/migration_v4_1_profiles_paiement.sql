-- V4-1 (15/11/2026) : appliquée sur Supabase sous le nom v4_1_profiles_plan_protege_et_journal_paiement
-- FAILLE CORRIGÉE : tout utilisateur connecté pouvait modifier plan / pro_expires_at / referral_code de son propre profil (PRO gratuit).
revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, phone, country, city) on public.profiles to authenticated;

-- Journal de paiement : acteur identifié ; le PRO n'est accordé qu'au PASSAGE vers 'successful' (pas de double prolongation si l'état est réécrit à l'identique).
create or replace function public.on_payment_status_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare delay_days int; rate numeric; commission numeric;
begin
  insert into public.payment_status_log(payment_intent_id, old_status, new_status, source, note)
  values (new.id, old.status, new.status,
          case when auth.uid() is null then 'system' else 'utilisateur' end,
          case when auth.uid() is null then null else 'acteur=' || auth.uid()::text end);

  if new.status = 'successful' and old.status is distinct from 'successful' and new.purpose = 'abonnement_pro' then
    update public.profiles set plan = 'pro',
      pro_expires_at = greatest(coalesce(pro_expires_at, now()), now()) + (case when new.period='annuel' then interval '1 year' else interval '1 month' end)
      where id = new.user_id;

    select validation_delay_days, rate_percent into delay_days, rate from public.referral_commission_config where id = 1;
    commission := round(coalesce(new.amount,0) * coalesce(rate,0) / 100.0, 2);
    update public.referrals set
      pro_conversion_at = now(),
      qualifying_payment_intent_id = new.id,
      commission_amount = commission,
      currency = new.currency,
      valid_after = now() + make_interval(days => coalesce(delay_days,14))
      where referred_user_id = new.user_id and pro_conversion_at is null and status = 'pending';
  end if;
  new.updated_at := now();
  return new;
end; $function$;
revoke execute on function public.on_payment_status_change() from public, anon, authenticated;
