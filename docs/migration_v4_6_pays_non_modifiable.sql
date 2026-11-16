-- V4-6 : le pays du profil détermine la zone tarifaire du PRO ; l'utilisateur ne peut plus le modifier (appliquée le 16/11/2026).
revoke update (country) on public.profiles from authenticated;
