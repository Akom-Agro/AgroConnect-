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
