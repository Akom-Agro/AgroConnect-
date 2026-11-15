// Edge Function DulyAgrivia — admin-manage-account (V4-4)
// Gestion des comptes par le SUPER ADMIN uniquement : liste, nouveau mot de passe, désactiver / réactiver,
// supprimer. Clé service_role : uniquement ici (jamais dans le frontend). Toute action est tracée (audit_logs).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

function genPassword() {
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const lower = 'abcdefghijkmnopqrstuvwxyz', upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', digits = '23456789', all = lower + upper + digits;
  const c = [pick(lower), pick(upper), pick(digits), pick('-_!#')];
  for (let i = 0; i < 8; i++) c.push(pick(all));
  for (let i = c.length - 1; i > 0; i--) { const k = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [c[i], c[k]] = [c[k], c[i]]; }
  return c.join('');
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
    const { data: me } = await admin.from('profiles').select('role').eq('id', u.user.id).maybeSingle();
    if (!me || me.role !== 'super_admin') return json({ error: 'Réservé au super administrateur' }, 403);

    const body = await req.json();
    const action = String(body.action || '');
    const log = (a: string, rec: string | null, details: unknown) => admin.from('audit_logs').insert({ user_id: u.user.id, action: a, table_name: 'profiles', record_id: rec, details });

    if (action === 'list') {
      const { data: profs } = await admin.from('profiles').select('id, full_name, phone, role, plan, created_at').order('created_at', { ascending: false }).limit(300);
      const { data: au } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const map = new Map((au?.users || []).map((x) => [x.id, x]));
      const users = (profs || []).map((p) => {
        const a = map.get(p.id);
        return { id: p.id, name: p.full_name || '', phone: p.phone || '', role: p.role, plan: p.plan, email: a?.email || '', created_by_admin: !!a?.user_metadata?.created_by_admin, disabled: !!(a?.banned_until && new Date(a.banned_until) > new Date()), last_sign_in: a?.last_sign_in_at || null };
      });
      return json({ ok: true, users });
    }

    const id = String(body.user_id || '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Paramètre invalide' }, 400);
    if (id === u.user.id) return json({ error: 'Vous ne pouvez pas agir sur votre propre compte ici.' }, 400);
    const { data: tp } = await admin.from('profiles').select('role, full_name').eq('id', id).maybeSingle();
    if (!tp) return json({ error: 'Compte introuvable' }, 404);
    if (['admin', 'super_admin'].includes(tp.role)) return json({ error: 'Un compte administrateur ne peut pas être géré depuis cet écran.' }, 403);
    const { data: tu } = await admin.auth.admin.getUserById(id);
    const login = tu?.user?.email || '';

    if (action === 'reset') {
      const password = genPassword();
      const { error } = await admin.auth.admin.updateUserById(id, { password, user_metadata: { ...(tu?.user?.user_metadata || {}), must_change_password: true } });
      if (error) return json({ error: error.message }, 400);
      await log('admin_reset_password', id, { name: tp.full_name });
      return json({ ok: true, login, password, name: tp.full_name });
    }

    if (action === 'disable' || action === 'enable') {
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: action === 'disable' ? '876000h' : 'none' });
      if (error) return json({ error: error.message }, 400);
      await log(action === 'disable' ? 'admin_disable_account' : 'admin_enable_account', id, { name: tp.full_name });
      return json({ ok: true });
    }

    if (action === 'delete') {
      // Garde-fou : on ne supprime jamais un compte qui possède des données de terrain (champs, troupeaux).
      const { data: farms } = await admin.from('farms').select('id').eq('owner_id', id);
      const farmIds = (farms || []).map((f) => f.id);
      if (farmIds.length) {
        const { count: nf } = await admin.from('fields').select('id', { count: 'exact', head: true }).in('farm_id', farmIds);
        const { count: nh } = await admin.from('herds').select('id', { count: 'exact', head: true }).in('farm_id', farmIds);
        if ((nf || 0) + (nh || 0) > 0) return json({ error: 'Ce compte possède des champs ou des troupeaux : suppression refusée pour ne pas perdre de données. Désactivez le compte à la place.' }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: 'Suppression impossible : ce compte a un historique (paiements, ventes, offres, PRO accordé…) qui doit être conservé. Désactivez-le à la place.' }, 400);
      await log('admin_delete_account', id, { name: tp.full_name, role: tp.role });
      return json({ ok: true });
    }
    return json({ error: 'Action inconnue' }, 400);
  } catch (_e) {
    return json({ error: 'Erreur serveur' }, 500);
  }
});
