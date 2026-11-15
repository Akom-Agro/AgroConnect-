// Edge Function DulyAgrivia — admin-create-producer
// Permet à un Super Admin / Admin de créer directement un compte Producteur (pour les
// producteurs qui ne passent pas eux-mêmes par le mobile), et optionnellement de lui
// accorder le PRO avec motif et traçabilité (pro_grants). Utilise la clé service_role,
// qui ne vit JAMAIS dans le frontend — uniquement ici, injectée automatiquement par
// Supabase dans l'environnement de la fonction.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// V4-3 : le navigateur envoie une requête de vérification (OPTIONS) avant l'appel : sans réponse CORS, l'appel était bloqué
// (« Failed to send a request to the Edge Function »). Même réglage que les autres fonctions de la plateforme.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Connection": "keep-alive" } });
}

function randomPassword() {
  // V4-3 : la politique d'authentification exige minuscule + majuscule + chiffre + symbole. On les garantit.
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const lower = "abcdefghjkmnpqrstuvwxyz", upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", digits = "23456789", all = lower + upper + digits;
  const chars = [pick(lower), pick(upper), pick(digits), pick("-_!#")];
  for (let i = 0; i < 8; i++) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const k = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [chars[i], chars[k]] = [chars[k], chars[i]]; }
  return chars.join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 1) Vérifie que l'appelant est authentifié ET a bien un rôle admin/super_admin
  //    (vérifié côté serveur, jamais seulement côté interface).
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData?.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", callerData.user.id).single();
  if (!callerProfile || !["admin", "super_admin"].includes(callerProfile.role)) {
    return json({ error: "forbidden", message: "Seul un administrateur peut créer un compte producteur." }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_body" }, 400); }
  const { fullName, phone, email, grantPro, proReason, proDurationDays, proType } = body ?? {};
  if (!fullName || !String(fullName).trim()) return json({ error: "missing_fields", message: "Le nom complet est obligatoire." }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim())) return json({ error: "invalid_email", message: "Adresse e-mail invalide." }, 400);
  if (grantPro && (!proReason || !String(proReason).trim())) return json({ error: "missing_reason", message: "Un motif est obligatoire pour accorder un PRO manuellement." }, 400);

  // 2) Crée le compte. Si aucun e-mail n'est fourni (producteur sans e-mail), on génère
  //    une adresse technique unique à partir du numéro de téléphone, pour que le compte
  //    reste identifiable et que l'admin puisse communiquer les identifiants de vive voix.
  const tempPassword = randomPassword();
  const effectiveEmail = (email && String(email).trim()) || `${(phone || Date.now()).toString().replace(/[^0-9]/g, "")}@producteur.dulyagrivia.app`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: effectiveEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: String(fullName).trim().slice(0, 80), phone: phone || null, role: "producteur", created_by_admin: callerData.user.id, must_change_password: true },
  });
  if (createErr || !created?.user) {
    const dup = /already|registered|exists/i.test(createErr?.message || "");
    return json({ error: "create_failed", message: dup ? "Cette adresse e-mail ou ce numéro a déjà un compte." : (createErr?.message || "Création du compte impossible.") }, 400);
  }

  // 3) PRO offert/sponsorisé/exonéré, avec motif et traçabilité obligatoires.
  if (grantPro) {
    const days = Number(proDurationDays) > 0 ? Number(proDurationDays) : 30;
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    await admin.from("profiles").update({ plan: "pro", pro_expires_at: expiresAt }).eq("id", created.user.id);
    await admin.from("pro_grants").insert({
      user_id: created.user.id,
      granted_by: callerData.user.id,
      grant_type: ["offert", "sponsorise", "exonere", "paiement_manuel"].includes(proType) ? proType : "offert",
      reason: proReason,
      duration_days: days,
    });
  }

  await admin.from("audit_logs").insert({ user_id: callerData.user.id, action: "admin_create_producer", table_name: "profiles", record_id: created.user.id, details: { grantPro: !!grantPro } });

  return json({ result: { userId: created.user.id, email: effectiveEmail, temporaryPassword: tempPassword } });
});
