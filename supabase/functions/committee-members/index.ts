import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const MAX = 15;

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
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: 'Non connecté' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: prof } = await admin.from('profiles').select('role').eq('id', u.user.id).maybeSingle();
    if (!prof || !['admin', 'super_admin'].includes(prof.role)) return json({ error: 'Réservé à l’administrateur' }, 403);

    const body = await req.json();
    const action = String(body.action || '');
    const log = (a: string, rec: string | null, details: unknown) => admin.from('audit_logs').insert({ user_id: u.user.id, action: a, table_name: 'committee_members', record_id: rec, details });

    const listMembers = async () => {
      const { data: rows } = await admin.from('committee_members').select('user_id, created_at').order('created_at');
      const out = [];
      for (const r of rows || []) {
        const { data: pu } = await admin.from('profiles').select('full_name, phone').eq('id', r.user_id).maybeSingle();
        const { data: au } = await admin.auth.admin.getUserById(r.user_id);
        out.push({ user_id: r.user_id, name: pu?.full_name || '', phone: pu?.phone || '', email: au?.user?.email || '', created_at: r.created_at });
      }
      return out;
    };

    if (action === 'list') return json({ ok: true, members: await listMembers(), max: MAX });

    if (action === 'create') {
      const fullName = String(body.full_name || '').trim().slice(0, 80);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
      const phone = String(body.phone || '').replace(/[^0-9+]/g, '').slice(0, 20);
      if (!fullName) return json({ error: 'Le nom est obligatoire' }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Une adresse e-mail valide est obligatoire (c’est l’identifiant de connexion)' }, 400);
      const { count } = await admin.from('committee_members').select('user_id', { count: 'exact', head: true });
      if ((count || 0) >= MAX) return json({ error: `Le comité est limité à ${MAX} membres. Retirez un membre avant d’en ajouter.` }, 400);
      const password = genPassword();
      const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, phone: phone || null, role: 'producteur', created_by_admin: u.user.id, must_change_password: true } });
      if (ce || !created?.user) {
        const dup = /already|registered|exists/i.test(ce?.message || '');
        return json({ error: dup ? 'Cette adresse e-mail a déjà un compte. Utilisez un autre e-mail.' : (ce?.message || 'Création impossible') }, 400);
      }
      const { error: me } = await admin.from('committee_members').insert({ user_id: created.user.id, added_by: u.user.id });
      if (me) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: me.message }, 400); }
      await log('committee_add', created.user.id, { name: fullName });
      return json({ ok: true, login: email, password, name: fullName });
    }

    if (action === 'reset') {
      const id = String(body.user_id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Paramètre invalide' }, 400);
      const { data: m } = await admin.from('committee_members').select('user_id').eq('user_id', id).maybeSingle();
      if (!m) return json({ error: 'Ce compte n’est pas membre du comité' }, 403);
      const password = genPassword();
      const { data: tu } = await admin.auth.admin.getUserById(id);
      const { error } = await admin.auth.admin.updateUserById(id, { password, user_metadata: { ...(tu?.user?.user_metadata || {}), must_change_password: true } });
      if (error) return json({ error: error.message }, 400);
      await log('committee_reset_password', id, null);
      return json({ ok: true, login: tu?.user?.email || '', password });
    }

    if (action === 'remove') {
      const id = String(body.user_id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Paramètre invalide' }, 400);
      const { error } = await admin.from('committee_members').delete().eq('user_id', id);
      if (error) return json({ error: error.message }, 400);
      await log('committee_remove', id, null);
      return json({ ok: true });
    }
    return json({ error: 'Action inconnue' }, 400);
  } catch (_e) {
    return json({ error: 'Erreur serveur' }, 500);
  }
});
