// Edge Function DulyAgrivia — notchpay-create (V4-1 partie 2)
// Crée un paiement Notch Pay pour l'abonnement PRO. Le MONTANT est lu côté serveur dans pricing_config
// (jamais envoyé par le navigateur). Les clés Notch Pay ne vivent que dans les secrets de la fonction.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SITE = 'https://agrivia.corsonservices.com';
const NOTCH = 'https://api.notchpay.co';

// Notch Pay : la clé PUBLIQUE (pk_...) va dans l'en-tête Authorization ; la clé privée (sk_...) n'est utilisée que pour X-Grant.
function notchKey(): string {
  const pub = Deno.env.get('NOTCHPAY_PUBLIC_KEY') || '';
  if (pub) return pub;
  for (const n of ['NOTCHPAY_KEY', 'NOTCHPAY_SECRET_KEY']) { const v = Deno.env.get(n) || ''; if (v.startsWith('pk_')) return v; }
  return '';
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

    const secret = notchKey();
    const body = await req.json().catch(() => ({}));

    const { data: prof } = await admin.from('profiles').select('role, full_name, phone').eq('id', u.user.id).maybeSingle();
    const { data: gw } = await admin.from('payment_gateway_config').select('live_enabled').eq('id', 1).maybeSingle();
    const isSuper = prof?.role === 'super_admin';
    if (body.action === 'status') return json({ ok: true, configured: !!(secret || Deno.env.get('NOTCHPAY_KEY') || Deno.env.get('NOTCHPAY_SECRET_KEY')), live_enabled: !!gw?.live_enabled, can_test: isSuper });
    // Vérification à la demande (au retour de Notch Pay, ou bouton « Vérifier mon paiement ») : filet de sécurité si le webhook tarde.
    if (body.action === 'verify') {
      if (!secret) return json({ error: 'Passerelle non configurée.' }, 503);
      const { data: it } = await admin.from('payment_intents').select('*').eq('user_id', u.user.id).eq('provider', 'notchpay').not('provider_reference', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!it) return json({ ok: true, state: 'none' });
      if (it.status === 'successful') return json({ ok: true, state: 'successful' });
      if (it.status !== 'pending') return json({ ok: true, state: it.status });
      const r = await fetch(`${NOTCH}/payments/${encodeURIComponent(it.provider_reference)}`, { headers: { Authorization: secret, Accept: 'application/json' } });
      const v: any = await r.json().catch(() => ({}));
      const t = v?.transaction || v;
      const st = String(t?.status || '').toLowerCase();
      if (!r.ok) { console.error('notchpay_verify_failed', r.status, JSON.stringify(v).slice(0, 300)); return json({ ok: true, state: 'pending' }); }
      if (['complete', 'completed', 'success', 'successful'].includes(st)) {
        const paid = Number(t?.amount ?? 0);
        if (paid && Math.abs(paid - Number(it.amount)) > 0.5) { await admin.from('audit_logs').insert({ user_id: u.user.id, action: 'notchpay_amount_mismatch', table_name: 'payment_intents', record_id: it.id, details: { expected: it.amount, got: paid } }); return json({ ok: true, state: 'pending' }); }
        const { error: ue } = await admin.from('payment_intents').update({ status: 'successful' }).eq('id', it.id).eq('status', 'pending');
        return json({ ok: true, state: ue ? 'pending' : 'successful' });
      }
      if (['failed', 'canceled', 'cancelled', 'expired'].includes(st)) {
        await admin.from('payment_intents').update({ status: st === 'failed' ? 'failed' : 'cancelled' }).eq('id', it.id).eq('status', 'pending');
        return json({ ok: true, state: st === 'failed' ? 'failed' : 'cancelled' });
      }
      return json({ ok: true, state: 'pending', notch_status: st });
    }
    // Tant que le paiement réel n'est pas ouvert au public, seul le super admin peut tester (clés sandbox).
    if (!gw?.live_enabled && !isSuper) return json({ error: 'Le paiement en ligne n’est pas encore ouvert.' }, 403);
    if (!secret) return json({ error: 'Passerelle non configurée : la clé PUBLIQUE Notch Pay (pk_…) est absente. Ajoutez le secret NOTCHPAY_PUBLIC_KEY.' }, 503);

    const period = body.period === 'annuel' ? 'annuel' : 'mensuel';
    const zone = body.zone === 'intl' ? 'intl' : 'local';
    const { data: pr } = await admin.from('pricing_config').select('*').eq('id', 1).single();
    if (!pr) return json({ error: 'Tarifs introuvables' }, 500);
    const amount = Number(zone === 'local' ? (period === 'mensuel' ? pr.monthly_amount : pr.annual_amount) : (period === 'mensuel' ? pr.monthly_amount_intl : pr.annual_amount_intl));
    const rawCur = String(zone === 'local' ? pr.currency : pr.currency_intl).toUpperCase();
    const currency = rawCur === 'FCFA' ? 'XAF' : rawCur;
    if (!(amount > 0)) return json({ error: 'Tarif invalide' }, 500);

    const { data: au } = await admin.auth.admin.getUserById(u.user.id);
    const email = au?.user?.email || '';
    const realEmail = email && !/@(ouvrier|producteur)\.(agrivia|dulyagrivia)\.app$/.test(email) ? email : `client.${u.user.id.slice(0, 8)}@corsonservices.com`;

    const { data: intent, error: ie } = await admin.from('payment_intents').insert({
      user_id: u.user.id, provider: 'notchpay', purpose: 'abonnement_pro', amount, currency: rawCur === 'FCFA' ? 'FCFA' : rawCur,
      status: 'pending', period, idempotency_key: crypto.randomUUID(),
    }).select('id').single();
    if (ie || !intent) return json({ error: ie?.message || 'Enregistrement impossible' }, 400);

    const resp = await fetch(`${NOTCH}/payments`, {
      method: 'POST',
      headers: { Authorization: secret, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        amount, currency, reference: intent.id, description: `Abonnement PRO Duly Agrivia (${period})`,
        callback: `${SITE}/?paiement=retour`,
        customer: { name: prof?.full_name || 'Client', email: realEmail, phone: prof?.phone || undefined },
      }),
    });
    const out: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      await admin.from('payment_intents').update({ status: 'failed' }).eq('id', intent.id);
      // Diagnostic (sans secret) : statut HTTP + message renvoyé par Notch Pay.
      console.error('notchpay_create_refused', resp.status, JSON.stringify(out).slice(0, 500));
      return json({ error: 'Notch Pay a refusé la création du paiement.', detail: `HTTP ${resp.status} — ${String(out?.message || out?.error || '').slice(0, 200)}` }, 502);
    }
    const ref = out?.transaction?.reference || out?.reference || null;
    await admin.from('payment_intents').update({ provider_reference: ref }).eq('id', intent.id);
    const link = out?.authorization_url || out?.transaction?.authorization_url || null;
    if (!link) return json({ error: 'Lien de paiement non reçu', detail: 'authorization_url absent' }, 502);
    return json({ ok: true, authorization_url: link, intent_id: intent.id });
  } catch (_e) {
    return json({ error: 'Erreur serveur' }, 500);
  }
});
