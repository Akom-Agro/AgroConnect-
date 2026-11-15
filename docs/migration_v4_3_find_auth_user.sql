-- V4-3 (15/11/2026) : appliquée sous le nom v4_3_find_auth_user_for_worker_attach
create or replace function public.find_auth_user_id(p_login text)
 returns uuid language sql stable security definer set search_path to 'public', 'auth'
as $$ select id from auth.users where lower(email) = lower(p_login) limit 1 $$;
revoke execute on function public.find_auth_user_id(text) from public, anon, authenticated;
grant execute on function public.find_auth_user_id(text) to service_role;
