import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

function genPassword() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(r).map(x => a[x % a.length]).join('') + '-' + (10 + (r[0] % 89));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const auth = req.headers.get('Authorization') || '';
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: 'Non connecté' }, 401);
    const body = await req.json();
    const farmId = String(body.farm_id || '');
    const workerUserId = String(body.worker_user_id || '');
    if (!/^[0-9a-f-]{36}$/.test(farmId) || !/^[0-9a-f-]{36}$/.test(workerUserId)) return json({ error: 'Paramètres invalides' }, 400);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: farm } = await admin.from('farms').select('id, owner_id').eq('id', farmId).maybeSingle();
    if (!farm) return json({ error: 'Exploitation introuvable' }, 404);
    const { data: prof } = await admin.from('profiles').select('role').eq('id', u.user.id).maybeSingle();
    const isAdm = prof && ['admin', 'super_admin'].includes(prof.role);
    if (farm.owner_id !== u.user.id && !isAdm) return json({ error: 'Accès refusé' }, 403);
    const { data: w } = await admin.from('workers').select('id').eq('farm_id', farmId).eq('user_id', workerUserId).maybeSingle();
    if (!w) return json({ error: 'Cet ouvrier n’appartient pas à votre exploitation' }, 403);
    const { data: target } = await admin.auth.admin.getUserById(workerUserId);
    const login = target?.user?.email || '';
    const password = genPassword();
    const { error } = await admin.auth.admin.updateUserById(workerUserId, { password, user_metadata: { ...(target?.user?.user_metadata || {}), must_change_password: true } });
    if (error) return json({ error: error.message }, 400);
    await admin.from('audit_logs').insert({ user_id: u.user.id, action: 'reset_worker_password', table_name: 'workers', record_id: workerUserId, details: { farm_id: farmId } });
    return json({ ok: true, login, password });
  } catch (_e) {
    return json({ error: 'Erreur serveur' }, 500);
  }
});
