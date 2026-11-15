// Edge Function DulyAgrivia — notchpay-webhook (V4-1 partie 2)
// Appelée par Notch Pay (sans JWT utilisateur) : l'authenticité repose sur la signature HMAC-SHA256 (x-notch-signature)
// ET sur une revérification du paiement auprès de l'API Notch Pay. Idempotente : un paiement final n'est jamais rejoué.
import { createClient } from 'npm:@supabase/supabase-js@2';

const NOTCH = 'https://api.notchpay.co';

// Notch Pay : la clé PUBLIQUE (pk_...) va dans l'en-tête Authorization ; la clé privée (sk_...) n'est utilisée que pour X-Grant.
function notchKey(): string {
  const pub = Deno.env.get('NOTCHPAY_PUBLIC_KEY') || '';
  if (pub) return pub;
  for (const n of ['NOTCHPAY_KEY', 'NOTCHPAY_SECRET_KEY']) { const v = Deno.env.get(n) || ''; if (v.startsWith('pk_')) return v; }
  return '';
}
const ok = (b: unknown = { ok: true }, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

async function hmacHex(key: string, data: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEq(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'method' }, 405);
  const raw = await req.text();
  const hash = Deno.env.get('NOTCHPAY_HASH') || Deno.env.get('NOTCHPAY_HASH_KEY') || '';
  const secret = notchKey();
  if (!hash || !secret) return ok({ error: 'not_configured' }, 503);
  const got = (req.headers.get('x-notch-signature') || '').trim().toLowerCase();
  const exp = await hmacHex(hash, raw);
  if (!got || !safeEq(got, exp)) return ok({ error: 'bad_signature' }, 401);

  let evt: any; try { evt = JSON.parse(raw); } catch { return ok({ error: 'bad_json' }, 400); }
  const type = String(evt?.event || evt?.type || '');
  const tx = evt?.data?.transaction || evt?.data || {};
  const merchantRef = String(tx.merchant_reference || tx.reference_merchant || evt?.data?.merchant_reference || '');
  const notchRef = String(tx.reference || evt?.data?.reference || '');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let intent: any = null;
  if (/^[0-9a-f-]{36}$/.test(merchantRef)) intent = (await admin.from('payment_intents').select('*').eq('id', merchantRef).maybeSingle()).data;
  if (!intent && notchRef) intent = (await admin.from('payment_intents').select('*').eq('provider_reference', notchRef).maybeSingle()).data;
  if (!intent) return ok({ ok: true, ignored: 'unknown_payment' });
  if (['successful', 'refunded', 'failed', 'cancelled'].includes(intent.status)) return ok({ ok: true, ignored: 'already_final' });

  if (type === 'payment.complete') {
    // Revérification auprès de Notch Pay : on ne se fie pas au seul contenu du message.
    const ref = intent.provider_reference || notchRef;
    const r = await fetch(`${NOTCH}/payments/${encodeURIComponent(ref)}`, { headers: { Authorization: secret, Accept: 'application/json' } });
    const v: any = await r.json().catch(() => ({}));
    const t = v?.transaction || v;
    const status = String(t?.status || '').toLowerCase();
    const paid = Number(t?.amount ?? t?.amount_total ?? 0);
    if (!r.ok || !['complete', 'completed', 'success', 'successful'].includes(status)) return ok({ ok: true, ignored: 'not_verified' }, 202);
    if (paid && Math.abs(paid - Number(intent.amount)) > 0.5) {
      await admin.from('audit_logs').insert({ user_id: null, action: 'notchpay_amount_mismatch', table_name: 'payment_intents', record_id: intent.id, details: { expected: intent.amount, got: paid } });
      return ok({ ok: true, ignored: 'amount_mismatch' }, 202);
    }
    const { error } = await admin.from('payment_intents').update({ status: 'successful' }).eq('id', intent.id).eq('status', 'pending');
    if (error) return ok({ error: 'update_failed' }, 500);
    return ok();
  }
  if (['payment.failed', 'payment.canceled', 'payment.expired'].includes(type)) {
    await admin.from('payment_intents').update({ status: type === 'payment.failed' ? 'failed' : 'cancelled' }).eq('id', intent.id).eq('status', 'pending');
    return ok();
  }
  return ok({ ok: true, ignored: type });
});
