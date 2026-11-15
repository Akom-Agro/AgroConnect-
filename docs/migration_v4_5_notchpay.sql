-- V4-1 partie 2 : autoriser le fournisseur Notch Pay (additif)
alter table public.payment_intents drop constraint if exists payment_intents_provider_check;
alter table public.payment_intents add constraint payment_intents_provider_check
  check (provider = any (array['orange_money','mtn_momo','stripe','notchpay']));
