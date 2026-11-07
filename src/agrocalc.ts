// Calculs agronomiques purs (sans réseau, testables). Les VALEURS (besoins, doses) ne sont JAMAIS
// codées ici : elles viennent de la table agro_rules (règles validées par le comité technique,
// ou règles DÉMO clairement signalées). Ici il n'y a que de l'arithmétique.

export type FertNeed = { n_kg_ha: number; p2o5_kg_ha: number; k2o_kg_ha: number };
export type Compound = { n: number; p2o5: number; k2o: number }; // % de l'engrais composé (ex. 20-10-10)
export type FertLine = { label: string; kg: number; sacks50: number };
export type FertResult = { lines: FertLine[]; supplied: { n: number; p2o5: number; k2o: number }; need: { n: number; p2o5: number; k2o: number } };

const r1 = (x: number) => Math.round(x * 10) / 10;
const pos = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

// Teneurs standard des engrais simples (valeurs chimiques, pas des recommandations agronomiques).
export const UREA_N = 46;      // % N
export const TSP_P2O5 = 46;    // % P2O5 (superphosphate triple)
export const MOP_K2O = 60;     // % K2O (chlorure de potassium)

export function fertilizerPlan(need: FertNeed, areaHa: number, compound?: Compound | null): FertResult {
  const area = pos(areaHa);
  const N = pos(need.n_kg_ha) * area, P = pos(need.p2o5_kg_ha) * area, K = pos(need.k2o_kg_ha) * area;
  const lines: FertLine[] = [];
  let nSup = 0, pSup = 0, kSup = 0;
  const hasCompound = compound && compound.p2o5 > 0;
  if (hasCompound && P > 0) {
    const kg = P / (compound!.p2o5 / 100);
    lines.push({ label: `Engrais composé NPK ${compound!.n}-${compound!.p2o5}-${compound!.k2o}`, kg: r1(kg), sacks50: r1(kg / 50) });
    nSup += kg * compound!.n / 100; pSup += kg * compound!.p2o5 / 100; kSup += kg * compound!.k2o / 100;
  } else if (P > 0) {
    const kg = P / (TSP_P2O5 / 100);
    lines.push({ label: 'Superphosphate triple (46 % P₂O₅)', kg: r1(kg), sacks50: r1(kg / 50) });
    pSup += P;
  }
  const remN = Math.max(0, N - nSup);
  if (remN > 0) { const kg = remN / (UREA_N / 100); lines.push({ label: 'Urée (46 % N)', kg: r1(kg), sacks50: r1(kg / 50) }); nSup += remN; }
  const remK = Math.max(0, K - kSup);
  if (remK > 0) { const kg = remK / (MOP_K2O / 100); lines.push({ label: 'Chlorure de potassium (60 % K₂O)', kg: r1(kg), sacks50: r1(kg / 50) }); kSup += remK; }
  return { lines, supplied: { n: r1(nSup), p2o5: r1(pSup), k2o: r1(kSup) }, need: { n: r1(N), p2o5: r1(P), k2o: r1(K) } };
}

export type DoseInput = { dosePerHa: number; areaHa: number; waterLPerHa: number; tankL: number };
export type DoseResult = { productTotal: number; waterTotal: number; dosePerTank: number; tanksExact: number; tanksToFill: number };

export function dosagePlan(i: DoseInput): DoseResult {
  const area = pos(i.areaHa), tank = pos(i.tankL), wHa = pos(i.waterLPerHa);
  const productTotal = pos(i.dosePerHa) * area;
  const waterTotal = wHa * area;
  const dosePerTank = wHa > 0 ? pos(i.dosePerHa) * tank / wHa : 0; // dose à mettre dans UN pulvérisateur plein
  const tanksExact = tank > 0 ? waterTotal / tank : 0;
  return { productTotal: Math.round(productTotal * 100) / 100, waterTotal: r1(waterTotal), dosePerTank: Math.round(dosePerTank * 100) / 100, tanksExact: Math.round(tanksExact * 100) / 100, tanksToFill: Math.ceil(tanksExact - 1e-9) };
}

export const weekOf = (planting: string | null, today = new Date()): number | null => {
  if (!planting) return null;
  const d = new Date(planting + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return Math.floor((today.getTime() - d.getTime()) / 86400000 / 7);
};

// ---------- Engrais GRANULÉ : épandu au pied, en grammes par plant ----------
export const plantsFromSpacing = (areaHa: number, rowM: number, plantM: number): number =>
  rowM > 0 && plantM > 0 && areaHa > 0 ? Math.floor((areaHa * 10000) / (rowM * plantM)) : 0;

// g par pied = total (kg) × 1000 / nombre de plants
export const gramsPerPlant = (totalKg: number, plants: number): number => (plants > 0 ? Math.round((totalKg * 1000 / plants) * 10) / 10 : 0);

// Règle validée « grammage par pied » : total à acheter pour N plants
export function perPlantPlan(gPerPlant: number, plants: number) {
  const kg = (pos(gPerPlant) * pos(plants)) / 1000;
  return { totalKg: r1(kg), sacks50: r1(kg / 50) };
}

// ---------- Produit LIQUIDE (engrais foliaire, insecticide, fongicide, herbicide) : dans le pulvérisateur ----------
export type LiquidUnit = 'mL' | 'L' | 'g' | 'kg';
export type LiquidInput = { dose: number; unit: LiquidUnit; basis: 'ha' | 'pompe'; areaHa: number; waterLPerHa: number; tankL: number };
export type LiquidResult = {
  solid: boolean;             // g/kg → produit en poudre
  totalBase: number;          // produit total en mL (liquide) ou g (solide)
  perTankBase: number;        // dose à mettre dans UN pulvérisateur plein, en mL ou g
  perTankCl: number;          // idem en cL (liquide)
  perLitreBase: number;       // par litre d'eau
  waterTotal: number; tanksExact: number; tanksToFill: number;
};
const toBase = (v: number, u: LiquidUnit) => (u === 'L' || u === 'kg' ? v * 1000 : v);

export function liquidPlan(i: LiquidInput): LiquidResult {
  const solid = i.unit === 'g' || i.unit === 'kg';
  const area = pos(i.areaHa), tank = pos(i.tankL), wHa = pos(i.waterLPerHa);
  const d = toBase(pos(i.dose), i.unit);
  const waterTotal = wHa * area;
  const tanksExact = tank > 0 ? waterTotal / tank : 0;
  let perTank: number, total: number;
  if (i.basis === 'pompe') { perTank = d; total = d * tanksExact; }         // dose donnée « par pulvérisateur »
  else { total = d * area; perTank = wHa > 0 ? d * tank / wHa : 0; }        // dose donnée « par hectare »
  const rd = (x: number) => Math.round(x * 100) / 100;
  return { solid, totalBase: rd(total), perTankBase: rd(perTank), perTankCl: rd(perTank / 10), perLitreBase: tank > 0 ? rd(perTank / tank) : 0,
    waterTotal: r1(waterTotal), tanksExact: rd(tanksExact), tanksToFill: Math.ceil(tanksExact - 1e-9) };
}

// ---------- Engrais DU COMMERCE : sacs réels (analyse N-P2O5-K2O du fabricant), nombre de sacs et de passages ----------
// Aucune valeur agronomique ici : le besoin (kg/ha) vient d'agro_rules, les analyses viennent du catalogue.
export type ShopProduct = { id: string; name: string; n: number; p2o5: number; k2o: number; bagKg: number; verified?: boolean };
export type ShopLine = { productId: string; name: string; kg: number; bags: number; bagsRounded: number; bagKg: number; verified: boolean; passes: number[] };
export type ShopPlan = {
  lines: ShopLine[];
  supplied: { n: number; p2o5: number; k2o: number };
  need: { n: number; p2o5: number; k2o: number };
  missing: { n: number; p2o5: number; k2o: number };   // besoin non couvert (kg d'élément)
  excess: { n: number; p2o5: number; k2o: number };    // surplus (kg d'élément)
  totalKg: number;
  score: number;
};
type Rem = { n: number; p: number; k: number };
const EPS = 1e-6;
const r2 = (x: number) => Math.round(x * 100) / 100;
const valid = (p: ShopProduct) => p.bagKg > 0 && p.n >= 0 && p.p2o5 >= 0 && p.k2o >= 0 && p.n + p.p2o5 + p.k2o > 0 && p.n + p.p2o5 + p.k2o <= 100;

function applyQty(qty: Map<string, number>, rem: Rem, p: ShopProduct, kg: number) {
  if (!(kg > EPS)) return;
  qty.set(p.id, (qty.get(p.id) || 0) + kg);
  rem.n -= kg * p.n / 100; rem.p -= kg * p.p2o5 / 100; rem.k -= kg * p.k2o / 100;
}

function buildPlan(need: { n: number; p: number; k: number }, products: ShopProduct[], base: ShopProduct | null, passes: number): ShopPlan {
  const rem: Rem = { ...need };
  const qty = new Map<string, number>();
  if (base) {
    const ratios: number[] = [];
    if (base.n > 0 && need.n > 0) ratios.push(need.n / (base.n / 100));
    if (base.p2o5 > 0 && need.p > 0) ratios.push(need.p / (base.p2o5 / 100));
    if (base.k2o > 0 && need.k > 0) ratios.push(need.k / (base.k2o / 100));
    if (ratios.length) applyQty(qty, rem, base, Math.min(...ratios));
  }
  const order: ('p' | 'k' | 'n')[] = ['p', 'k', 'n'];
  for (let it = 0; it < 8; it++) {
    let progressed = false;
    for (const el of order) {
      if (rem[el] <= EPS) continue;
      const pct = (p: ShopProduct) => (el === 'p' ? p.p2o5 : el === 'k' ? p.k2o : p.n);
      let best: { p: ShopProduct; use: number } | null = null;
      for (const c of products) {
        if (pct(c) <= 0) continue;
        const full = rem[el] / (pct(c) / 100);
        let cap = full;
        // ne pas dépasser le besoin des AUTRES éléments contenus dans ce produit
        for (const o of ['n', 'p', 'k'] as const) {
          if (o === el) continue;
          const po = o === 'n' ? c.n : o === 'p' ? c.p2o5 : c.k2o;
          if (po > 0) cap = Math.min(cap, Math.max(0, rem[o]) / (po / 100));
        }
        const use = Math.min(full, cap);
        if (use <= EPS) continue;
        const purity = pct(c) / (c.n + c.p2o5 + c.k2o);
        if (!best || use * pct(c) > best.use * pct(best.p) + EPS || (Math.abs(use * pct(c) - best.use * pct(best.p)) <= EPS && purity > pct(best.p) / (best.p.n + best.p.p2o5 + best.p.k2o))) best = { p: c, use };
      }
      if (best) { applyQty(qty, rem, best.p, best.use); progressed = true; }
    }
    if (!progressed) break;
  }
  const sup = { n: 0, p2o5: 0, k2o: 0 };
  const lines: ShopLine[] = [];
  const np = Math.max(1, Math.floor(passes) || 1);
  for (const p of products) {
    const kg = qty.get(p.id);
    if (!kg || kg <= EPS) continue;
    sup.n += kg * p.n / 100; sup.p2o5 += kg * p.p2o5 / 100; sup.k2o += kg * p.k2o / 100;
    // le phosphore se met au fond (1er passage) ; le reste se répartit également sur les passages
    const passList = p.p2o5 > 0 ? [1] : Array.from({ length: np }, (_, i) => i + 1);
    lines.push({ productId: p.id, name: p.name, kg: r1(kg), bags: r1(kg / p.bagKg), bagsRounded: Math.ceil(kg / p.bagKg - 1e-9), bagKg: p.bagKg, verified: !!p.verified, passes: passList });
  }
  const missing = { n: r1(Math.max(0, need.n - sup.n)), p2o5: r1(Math.max(0, need.p - sup.p2o5)), k2o: r1(Math.max(0, need.k - sup.k2o)) };
  const excess = { n: r1(Math.max(0, sup.n - need.n)), p2o5: r1(Math.max(0, sup.p2o5 - need.p)), k2o: r1(Math.max(0, sup.k2o - need.k)) };
  const totalKg = r1(lines.reduce((s, l) => s + l.kg, 0));
  const score = (missing.n + missing.p2o5 + missing.k2o) * 10 + (excess.n + excess.p2o5 + excess.k2o) * 2 + totalKg * 0.01;
  return { lines, supplied: { n: r1(sup.n), p2o5: r1(sup.p2o5), k2o: r1(sup.k2o) }, need: { n: r1(need.n), p2o5: r1(need.p), k2o: r1(need.k) }, missing, excess, totalKg, score };
}

// Propose jusqu'à 3 combinaisons avec les produits cochés (les meilleures d'abord).
export function shopPlans(need: FertNeed, areaHa: number, products: ShopProduct[], passes: number): ShopPlan[] {
  const area = pos(areaHa);
  const nd = { n: pos(need.n_kg_ha) * area, p: pos(need.p2o5_kg_ha) * area, k: pos(need.k2o_kg_ha) * area };
  const list = products.filter(valid);
  if (!list.length || nd.n + nd.p + nd.k <= 0) return [];
  const cands: (ShopProduct | null)[] = [null, ...list.filter(p => [p.n, p.p2o5, p.k2o].filter(x => x > 0).length >= 2)];
  const plans = cands.map(b => buildPlan(nd, list, b, passes)).filter(p => p.lines.length > 0);
  plans.sort((a, b) => a.score - b.score);
  const seen = new Set<string>(); const out: ShopPlan[] = [];
  for (const p of plans) { const key = p.lines.map(l => `${l.productId}:${l.kg}`).sort().join('|'); if (!seen.has(key)) { seen.add(key); out.push(p); } if (out.length >= 3) break; }
  return out;
}

// Quantité d'une ligne pour UN passage (kg, sacs, g par pied)
export function perPass(line: ShopLine, plants: number) {
  const kg = line.kg / line.passes.length;
  return { kg: r1(kg), bags: r2(kg / line.bagKg), gPerPlant: gramsPerPlant(kg, plants) };
}
