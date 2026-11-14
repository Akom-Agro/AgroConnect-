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
    const fullName = String(body.full_name || '').trim().slice(0, 80);
    const phone = String(body.phone || '').replace(/[^0-9+]/g, '').slice(0, 20);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
    if (!/^[0-9a-f-]{36}$/.test(farmId)) return json({ error: 'Exploitation invalide' }, 400);
    if (!fullName) return json({ error: 'Le nom de l’ouvrier est obligatoire' }, 400);
    if (!email && phone.replace(/\D/g, '').length < 8) return json({ error: 'Indiquez un téléphone (8 chiffres min.) ou un e-mail' }, 400);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'E-mail invalide' }, 400);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: farm } = await admin.from('farms').select('id, owner_id').eq('id', farmId).maybeSingle();
    if (!farm) return json({ error: 'Exploitation introuvable' }, 404);
    const { data: prof } = await admin.from('profiles').select('role').eq('id', u.user.id).maybeSingle();
    const isAdm = prof && ['admin', 'super_admin'].includes(prof.role);
    if (farm.owner_id !== u.user.id && !isAdm) return json({ error: 'Accès refusé' }, 403);

    const login = email || `ouvrier.${phone.replace(/\D/g, '')}@ouvrier.agrivia.app`;
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const { data: inv, error: ie } = await admin.from('worker_invites').insert({ code, farm_id: farmId, full_name: fullName, phone: phone || null, created_by: u.user.id }).select('id').single();
    if (ie) return json({ error: ie.message }, 400);
    const password = genPassword();
    const { data: cu, error: ce } = await admin.auth.admin.createUser({ email: login, password, email_confirm: true, user_metadata: { invite_code: code, full_name: fullName, phone, must_change_password: true } });
    if (ce) {
      await admin.from('worker_invites').delete().eq('id', inv.id);
      const dup = /already|registered|exists/i.test(ce.message);
      return json({ error: dup ? 'Ce compte existe déjà (e-mail ou téléphone déjà utilisé)' : ce.message }, 400);
    }
    await admin.from('audit_logs').insert({ user_id: u.user.id, action: 'create_worker', table_name: 'workers', record_id: cu?.user?.id ?? null, details: { farm_id: farmId, name: fullName } });
    return json({ ok: true, login, password, name: fullName, invite_id: inv.id });
  } catch (_e) {
    return json({ error: 'Erreur serveur' }, 500);
  }
});
