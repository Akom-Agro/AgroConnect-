-- V4-2 (15/11/2026) : appliquée sous le nom v4_2_transitions_paiement_interdites
-- Un paiement 'successful' ne peut passer qu'à 'refunded' ; 'refunded', 'failed', 'cancelled' sont définitifs.
create or replace function public.guard_payment_transition()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.status is distinct from old.status then
    if old.status = 'successful' and new.status <> 'refunded' then
      raise exception 'Un paiement réussi ne peut passer qu''à « remboursé »';
    end if;
    if old.status in ('refunded','failed','cancelled') then
      raise exception 'Ce paiement est clos (%) : créez une nouvelle demande', old.status;
    end if;
  end if;
  return new;
end; $function$;
revoke execute on function public.guard_payment_transition() from public, anon, authenticated;
drop trigger if exists a_guard_payment_transition on public.payment_intents;
create trigger a_guard_payment_transition before update on public.payment_intents
  for each row execute function public.guard_payment_transition();
