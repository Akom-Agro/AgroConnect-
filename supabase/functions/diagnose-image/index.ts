// Edge Function DulyAgrivia — diagnose-image (v3 : diagnostic lié à un champ)
// La clé ANTHROPIC_API_KEY ne vit JAMAIS dans le frontend : uniquement ici, en secret de cette fonction.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODEL = "claude-sonnet-4-6";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Connection": "keep-alive" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const user = userData.user;

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "not_configured", message: "Le service de diagnostic IA n'est pas encore activé sur ce serveur (clé API manquante)." }, 503);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_body" }, 400); }
  const { imageBase64, mediaType, sector, note, field_id } = body ?? {};
  if (!imageBase64 || !mediaType || !sector) return json({ error: "missing_fields" }, 400);
  if (!["image/jpeg", "image/png", "image/webp"].includes(mediaType)) return json({ error: "unsupported_media_type" }, 400);
  if (!["agriculture", "elevage"].includes(sector)) return json({ error: "invalid_sector" }, 400);

  const schemaDesc = "Réponds UNIQUEMENT en JSON valide, sans texte autour, avec exactement ces clés : " +
    "condition_label (nom court du problème probable, ou \"Aucune anomalie visible\" si tout semble sain), " +
    "confidence (\"faible\", \"moyenne\" ou \"elevee\"), " +
    "recommendation (2-3 phrases d'explication générale et de conseils de prévention, concrètes et actionnables), " +
    "treatment (un OBJET, jamais une simple chaîne, avec les sous-clés : product_type = type de produit/traitement recommandé en langage courant ; ou null si aucune anomalie n'est visible. dosage = indication GÉNÉRALE de dosage/fréquence en langage courant, sans jamais inventer un dosage chiffré précis pour une marque spécifique que tu ne connais pas réellement ; si incertain, dis-le explicitement. precautions = précautions d'usage et signaux qui imposent de consulter un professionnel), " +
    "disclaimer (rappel bref que c'est une estimation indicative, jamais un diagnostic certifié).";

  const systemPrompt = sector === "agriculture"
    ? `Tu es un assistant agronomique pour des producteurs au Cameroun/Afrique centrale (AgroDoctor DulyAgrivia). On te montre une photo de plante/culture. ${schemaDesc}`
    : `Tu es un assistant vétérinaire pour des éleveurs au Cameroun/Afrique centrale (VétoDoctor DulyAgrivia). On te montre une photo d'un animal d'élevage. ${schemaDesc}`;

  const userText = note ? `Note du producteur : ${note}` : "Analyse cette photo.";

  let aiJson: any;
  let rawText = "";
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 700, system: systemPrompt,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: userText },
        ] }],
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      return json({ error: "upstream_error", message: errBody.slice(0, 500) }, 502);
    }
    const data = await resp.json();
    rawText = (data.content || []).map((b: any) => b.text || "").join("\n");
    aiJson = JSON.parse(rawText.replace(/```json|```/g, "").trim());
  } catch (e) {
    return json({ error: "analysis_failed", message: String(e), raw: rawText.slice(0, 500) }, 502);
  }

  const confidence = ["faible", "moyenne", "elevee"].includes(aiJson.confidence) ? aiJson.confidence : "faible";
  const treatment = (aiJson.treatment && typeof aiJson.treatment === "object") ? aiJson.treatment : {};

  const { data: inserted, error: insertErr } = await supabase.from("ai_diagnoses").insert({
    user_id: user.id,
    sector,
    field_id: field_id ?? null,
    condition_label: aiJson.condition_label ?? null,
    confidence,
    recommendation: aiJson.recommendation ?? null,
    treatment_product: treatment.product_type ?? null,
    treatment_dosage: treatment.dosage ?? null,
    treatment_precautions: treatment.precautions ?? null,
    raw_response: aiJson,
    model: MODEL,
  }).select().single();

  if (insertErr) return json({ error: "save_failed", message: insertErr.message }, 500);
  return json({ result: inserted });
});
