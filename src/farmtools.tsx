import React, { useEffect, useState } from 'react';
import { fertilizerPlan, dosagePlan, weekOf, type FertNeed, type Compound } from './agrocalc';

// Outils « Ma ferme » : journal des travaux, calculateurs, conseils par étape, santé liée au champ,
// panneau comité. Module AJOUTÉ à l'existant : aucune écriture ici ne contourne les règles serveur
// (RLS + triggers) ; les messages d'erreur du serveur sont affichés tels quels.

type DB = any;
type Rule = { id: string; rule_type: 'besoin_engrais' | 'dose_traitement'; crop_id: string; territory: string; payload: any; source: string; version: number; status: string; is_demo: boolean; crops?: { name: string } | null };
type Advice = { id: string; crop_id: string; category: string; week_from: number; week_to: number; title: string; body: string; source: string; status: string; is_demo: boolean; crops?: { name: string } | null };
type Ingredient = { id: string; name: string; family: string; legal_status: string; toxicity_class: string | null; pre_harvest_interval_days: number | null; source: string | null; notes: string | null; is_demo: boolean };

const statusLabel: Record<string, string> = { brouillon: 'Brouillon', en_validation: 'En validation', validee: 'Validée', suspendue: 'Suspendue' };
const legalLabel: Record<string, string> = { homologue: 'Homologué', restreint: 'Restreint', interdit: '⛔ Interdit', non_verifie: 'Non vérifié' };
const catLabel: Record<string, string> = { choix_plants: 'Choix des plants', emplacement: 'Emplacement', preparation: 'Préparation du sol', plantation: 'Plantation', conduite: 'Conduite de la culture', desherbage: 'Désherbage', irrigation: 'Irrigation', fertilisation: 'Fertilisation', surveillance: 'Surveillance', recolte: 'Récolte' };
const typeLabel: Record<string, string> = { engrais: 'Engrais', pesticide: 'Pesticide', insecticide: 'Insecticide', fongicide: 'Fongicide', herbicide: 'Herbicide', irrigation: 'Irrigation', désherbage: 'Désherbage', semis: 'Semis', plantation: 'Plantation', récolte: 'Récolte', autre: 'Autre' };
const followLabel: Record<string, string> = { a_traiter: 'À traiter', traite: 'Traité', resolu: 'Résolu' };
const fmt = (d: string | null) => (d ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d + 'T00:00:00')) : '—');
const today = () => new Date().toISOString().slice(0, 10);

const DemoBadge = ({ rule }: { rule: { status: string; is_demo: boolean } }) =>
  rule.is_demo && rule.status !== 'validee'
    ? <span className="badge danger">DÉMO — non validé</span>
    : <span className={'badge ' + (rule.status === 'validee' ? 'green' : '')}>{statusLabel[rule.status] || rule.status}</span>;

// ---------- Outils d'un champ ----------
export function FieldTools({ db, field, role, go }: { db: DB; field: any; role: string; go: (s: any) => void }) {
  const [tab, setTab] = useState<'journal' | 'calc' | 'conseils' | 'sante'>('journal');
  const tabs: [typeof tab, string][] = [['journal', '📒 Travaux'], ['calc', '🧮 Calculateurs'], ['conseils', '🌿 Conseils'], ['sante', '🩺 Santé']];
  return <section className="section">
    <div className="sectionhead"><h2>Outils du champ</h2></div>
    <div className="sectorswitch" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
      {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'selected' : ''} style={{ flex: '1 1 120px', minHeight: 44 }} onClick={() => setTab(k)}>{l}</button>)}
    </div>
    {tab === 'journal' && <Journal db={db} field={field} />}
    {tab === 'calc' && <Calculators db={db} field={field} />}
    {tab === 'conseils' && <CropAdvice db={db} field={field} />}
    {tab === 'sante' && <FieldHealth db={db} field={field} role={role} go={go} />}
  </section>;
}

// ---------- Journal ----------
function Journal({ db, field }: { db: DB; field: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ type: 'engrais', date: today(), ing: '', dose: '', unit: 'kg', area: String(field.area_ha || ''), notes: '' });
  async function load() {
    const [t, i] = await Promise.all([
      db.from('treatments').select('*, active_ingredients(name,legal_status)').eq('field_id', field.id).order('treatment_date', { ascending: false }).limit(50),
      db.from('active_ingredients').select('*').order('name'),
    ]);
    setRows(t.data || []); setIngs((i.data || []) as Ingredient[]); setLoading(false);
  }
  useEffect(() => { load(); }, [field.id]);
  const chosen = ings.find(i => i.id === f.ing);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('');
    const { error } = await db.from('treatments').insert({
      field_id: field.id, type: f.type, treatment_date: f.date,
      active_ingredient_id: f.ing || null, dose_value: f.dose ? Number(f.dose) : null, dose_unit: f.dose ? f.unit : null,
      area_ha: f.area ? Number(f.area) : null, notes: f.notes || null,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setF({ ...f, ing: '', dose: '', notes: '' }); setMsg('Travail enregistré.'); load();
  }
  const blocked = rows.filter(r => r.pre_harvest_until && r.pre_harvest_until >= today()).sort((a, b) => b.pre_harvest_until.localeCompare(a.pre_harvest_until))[0];
  return <>
    {blocked && <div className="notice">⏳ Ne pas récolter avant le <b>{fmt(blocked.pre_harvest_until)}</b> (délai avant récolte du dernier traitement).</div>}
    <form className="tender" onSubmit={save}>
      <div className="tendermain">
        <label>Type de travail<select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Date<input type="date" required value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
        <label>Matière active (si traitement)<select value={f.ing} onChange={e => setF({ ...f, ing: e.target.value })}><option value="">— aucune —</option>{ings.map(i => <option key={i.id} value={i.id}>{i.name}{i.legal_status === 'interdit' ? ' ⛔ INTERDIT' : ''}{i.is_demo ? ' (DÉMO)' : ''}</option>)}</select></label>
        {chosen?.legal_status === 'interdit' && <div className="notice">⛔ Matière interdite au Cameroun : l’enregistrement sera refusé. Source : {chosen.source}</div>}
        {chosen && chosen.legal_status === 'non_verifie' && <div className="notice">Statut légal non vérifié : confirmez auprès du comité ou d’un conseiller agréé.</div>}
        <div className="gpsrow"><label>Quantité utilisée<input type="number" min="0" step="any" value={f.dose} onChange={e => setF({ ...f, dose: e.target.value })} /></label><label>Unité<select value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}><option>kg</option><option>g</option><option>L</option><option>mL</option><option>sacs</option></select></label></div>
        <label>Surface traitée (ha)<input type="number" min="0" step="any" value={f.area} onChange={e => setF({ ...f, area: e.target.value })} /></label>
        <label>Remarque<input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
      </div>
      <button className="primary wide" style={{ minHeight: 48 }} disabled={busy}>{busy ? 'Enregistrement…' : '＋ Enregistrer ce travail'}</button>
    </form>
    {msg && <div className="notice">{msg}</div>}
    {loading ? <div className="loading">Chargement…</div> : rows.length ? <div className="adminlist" style={{ marginTop: 12 }}>{rows.map(r => <div key={r.id}><b>{typeLabel[r.type] || r.type}{r.active_ingredients?.name ? ` — ${r.active_ingredients.name}` : ''}{r.dose_value ? ` • ${r.dose_value} ${r.dose_unit}` : ''}</b><span className="badge">{fmt(r.treatment_date)}{r.pre_harvest_until ? ` • récolte après ${fmt(r.pre_harvest_until)}` : ''}</span></div>)}</div> : <div className="empty"><p>Aucun travail enregistré sur ce champ.</p></div>}
  </>;
}

// ---------- Calculateurs ----------
function pickRule(rules: Rule[], type: string): Rule | null {
  const list = rules.filter(r => r.rule_type === type);
  return list.find(r => r.status === 'validee') || list.find(r => r.is_demo) || null;
}

function Calculators({ db, field }: { db: DB; field: any }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState(String(field.area_ha || ''));
  const [useCompound, setUseCompound] = useState(false);
  const [comp, setComp] = useState({ n: '15', p2o5: '15', k2o: '15' });
  const [manual, setManual] = useState({ n: '', p: '', k: '' });
  const [dose, setDose] = useState({ perHa: '', water: '', tank: '16' });
  useEffect(() => { (async () => { if (!field.crop_id) { setLoading(false); return; } const { data } = await db.from('agro_rules').select('*').eq('crop_id', field.crop_id).neq('status', 'suspendue'); setRules((data || []) as Rule[]); setLoading(false); })(); }, [field.id]);
  const fRule = pickRule(rules, 'besoin_engrais');
  const dRule = pickRule(rules, 'dose_traitement');
  useEffect(() => { if (dRule) setDose(d => ({ ...d, perHa: String(dRule.payload.dose_per_ha ?? ''), water: String(dRule.payload.water_l_ha ?? '') })); }, [dRule?.id]);
  const manualOn = !fRule && (manual.n || manual.p || manual.k);
  const need: FertNeed | null = fRule ? fRule.payload : manualOn ? { n_kg_ha: Number(manual.n) || 0, p2o5_kg_ha: Number(manual.p) || 0, k2o_kg_ha: Number(manual.k) || 0 } : null;
  const cmp: Compound | null = useCompound ? { n: Number(comp.n) || 0, p2o5: Number(comp.p2o5) || 0, k2o: Number(comp.k2o) || 0 } : null;
  const fert = need ? fertilizerPlan(need, Number(area) || 0, cmp) : null;
  const dz = dosagePlan({ dosePerHa: Number(dose.perHa) || 0, areaHa: Number(area) || 0, waterLPerHa: Number(dose.water) || 0, tankL: Number(dose.tank) || 0 });
  if (loading) return <div className="loading">Chargement…</div>;
  return <>
    <label>Surface à traiter (ha)<input type="number" min="0" step="any" value={area} onChange={e => setArea(e.target.value)} /></label>
    <div className="tender" style={{ marginTop: 12 }}><div className="tendermain">
      <h3>Calculateur d’engrais — {field.crops?.name || 'culture'}</h3>
      {fRule ? <p><DemoBadge rule={fRule} /> Besoins : N {fRule.payload.n_kg_ha} • P₂O₅ {fRule.payload.p2o5_kg_ha} • K₂O {fRule.payload.k2o_kg_ha} kg/ha <span className="muted">({fRule.source})</span></p>
        : <><p className="muted">Aucune règle disponible pour cette culture : dose à confirmer. Vous pouvez saisir un besoin manuellement (résultat non validé).</p>
          <div className="gpsrow"><label>N kg/ha<input type="number" value={manual.n} onChange={e => setManual({ ...manual, n: e.target.value })} /></label><label>P₂O₅ kg/ha<input type="number" value={manual.p} onChange={e => setManual({ ...manual, p: e.target.value })} /></label><label>K₂O kg/ha<input type="number" value={manual.k} onChange={e => setManual({ ...manual, k: e.target.value })} /></label></div></>}
      <label style={{ flexDirection: 'row', gap: 8 }}><input type="checkbox" checked={useCompound} onChange={e => setUseCompound(e.target.checked)} /> J’utilise un engrais composé NPK</label>
      {useCompound && <div className="gpsrow"><label>% N<input type="number" value={comp.n} onChange={e => setComp({ ...comp, n: e.target.value })} /></label><label>% P₂O₅<input type="number" value={comp.p2o5} onChange={e => setComp({ ...comp, p2o5: e.target.value })} /></label><label>% K₂O<input type="number" value={comp.k2o} onChange={e => setComp({ ...comp, k2o: e.target.value })} /></label></div>}
      {fert ? <div className="adminlist">{fert.lines.map(l => <div key={l.label}><b>{l.label}</b><span className="badge green">{l.kg} kg • {l.sacks50} sac(s) de 50 kg</span></div>)}
        <p className="muted">Apport couvert : N {fert.supplied.n} • P₂O₅ {fert.supplied.p2o5} • K₂O {fert.supplied.k2o} kg (besoin : N {fert.need.n} • P₂O₅ {fert.need.p2o5} • K₂O {fert.need.k2o}). Une partie au-delà du besoin peut venir de l’engrais composé.</p></div> : null}
      {(fRule?.is_demo && fRule.status !== 'validee') || manualOn ? <div className="notice">⚠ Valeurs non validées par le comité technique : à utiliser comme exemple, pas comme recommandation.</div> : null}
    </div></div>
    <div className="tender" style={{ marginTop: 12 }}><div className="tendermain">
      <h3>Calculateur de dosage (traitement)</h3>
      {dRule ? <p><DemoBadge rule={dRule} /> {dRule.payload.ingredient_name || 'Produit'} <span className="muted">({dRule.source})</span></p> : <p className="muted">Aucune dose validée : dose à confirmer. Saisissez la dose de l’étiquette du produit.</p>}
      <div className="gpsrow"><label>Dose par ha (étiquette)<input type="number" min="0" step="any" value={dose.perHa} onChange={e => setDose({ ...dose, perHa: e.target.value })} /></label><label>Eau par ha (L)<input type="number" min="0" step="any" value={dose.water} onChange={e => setDose({ ...dose, water: e.target.value })} /></label><label>Pulvérisateur (L)<input type="number" min="1" step="any" value={dose.tank} onChange={e => setDose({ ...dose, tank: e.target.value })} /></label></div>
      {dz.productTotal > 0 && <div className="farmsummary"><div><span>Produit total</span><b>{dz.productTotal} {dRule?.payload.unit || 'unités'}</b></div><div><span>Par pulvérisateur plein</span><b>{dz.dosePerTank}</b></div><div><span>Remplissages</span><b>{dz.tanksToFill}</b></div><div><span>Eau totale</span><b>{dz.waterTotal} L</b></div></div>}
      <p className="muted">Respectez toujours l’étiquette du produit et les équipements de protection.</p>
    </div></div>
  </>;
}

// ---------- Conseils ----------
function CropAdvice({ db, field }: { db: DB; field: any }) {
  const [rows, setRows] = useState<Advice[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'etape' | 'tache'>('etape');
  useEffect(() => { (async () => { if (!field.crop_id) { setLoading(false); return; } const { data } = await db.from('crop_advice').select('*').eq('crop_id', field.crop_id).neq('status', 'suspendue').order('week_from'); setRows((data || []) as Advice[]); setLoading(false); })(); }, [field.id]);
  const week = weekOf(field.planting_date);
  if (loading) return <div className="loading">Chargement…</div>;
  if (!rows.length) return <div className="empty"><p>Aucun conseil disponible pour cette culture pour le moment.</p></div>;
  const card = (a: Advice) => <div className="notif" key={a.id}><span className="notificon">🌿</span><div><b>{a.title}</b> <DemoBadge rule={a} /><p>{a.body}</p><small>Semaines {a.week_from}–{a.week_to} • {catLabel[a.category]}</small></div></div>;
  const now = week === null ? [] : rows.filter(a => a.week_from <= week && week <= a.week_to);
  const groups = Object.keys(catLabel).map(c => [c, rows.filter(a => a.category === c)] as [string, Advice[]]).filter(g => g[1].length);
  return <>
    <div className="quick"><Quick label="Par étape" on={mode === 'etape'} onClick={() => setMode('etape')} /><Quick label="Par tâche" on={mode === 'tache'} onClick={() => setMode('tache')} /></div>
    {mode === 'etape' ? <>
      {week === null ? <div className="notice">Ajoutez la date de plantation du champ pour voir les conseils de la semaine en cours.</div> : <><h3 style={{ marginTop: 12 }}>Semaine {week} après plantation</h3>{now.length ? <div className="notifications">{now.map(card)}</div> : <div className="empty"><p>Aucun conseil prévu pour cette semaine.</p></div>}</>}
    </> : groups.map(([c, list]) => <div key={c}><h3 style={{ marginTop: 12 }}>{catLabel[c]}</h3><div className="notifications">{list.map(card)}</div></div>)}
  </>;
}
const Quick = ({ label, on, onClick }: { label: string; on?: boolean; onClick: () => void }) => <button className={'quickbtn' + (on ? ' selected' : '')} onClick={onClick}><b>{label}</b></button>;

// ---------- Santé liée au champ ----------
function FieldHealth({ db, field, go }: { db: DB; field: any; role: string; go: (s: any) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  async function load() { const { data } = await db.from('ai_diagnoses').select('*').eq('field_id', field.id).order('created_at', { ascending: false }).limit(20); setRows(data || []); setLoading(false); }
  useEffect(() => { load(); }, [field.id]);
  async function setFollow(id: string, s: string) { const { error } = await db.from('ai_diagnoses').update({ follow_status: s }).eq('id', id); setMsg(error ? error.message : ''); load(); }
  return <>
    <div className="quick"><button className="quickbtn" onClick={() => { try { sessionStorage.setItem('duly_ai_field', field.id); } catch { /* ignore */ } go('ai'); }}><span>✦</span><b>Diagnostiquer une plante de ce champ</b><span>→</span></button></div>
    {msg && <div className="notice">{msg}</div>}
    {loading ? <div className="loading">Chargement…</div> : rows.length ? <div className="adminlist" style={{ marginTop: 12 }}>{rows.map(r => <div key={r.id}><b>{r.condition_label || '—'}</b><span><select value={r.follow_status} onChange={e => setFollow(r.id, e.target.value)}>{Object.entries(followLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></span></div>)}</div> : <div className="empty"><p>Aucun diagnostic lié à ce champ.</p></div>}
    <p className="muted">Estimation indicative : ne remplace pas un agronome.</p>
  </>;
}

// ---------- Panneau comité technique ----------
export function CommitteePanel({ db, isAdmin, isCommittee }: { db: DB; isAdmin: boolean; isCommittee: boolean }) {
  const [tab, setTab] = useState<'regles' | 'matieres' | 'conseils' | 'membres'>('regles');
  const tabs: [typeof tab, string][] = [['regles', 'Règles'], ['matieres', 'Matières actives'], ['conseils', 'Conseils'], ...(isAdmin ? [['membres', 'Membres'] as [typeof tab, string]] : [])];
  return <>
    <div className="pageintro"><div><span className="eyebrow">GOUVERNANCE</span><h1>Comité technique</h1><p>Seuls les membres du comité valident. Une règle validée est figée : toute correction crée une nouvelle version.{!isCommittee && ' (Vous êtes administrateur : vous préparez, le comité valide.)'}</p></div></div>
    <div className="sectorswitch" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'selected' : ''} style={{ flex: '1 1 110px', minHeight: 44 }} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'regles' && <RulesAdmin db={db} isCommittee={isCommittee} />}
    {tab === 'matieres' && <IngredientsAdmin db={db} />}
    {tab === 'conseils' && <AdviceAdmin db={db} isCommittee={isCommittee} />}
    {tab === 'membres' && isAdmin && <MembersAdmin db={db} />}
    <DemoPurge db={db} />
  </>;
}

function StatusButtons({ table, row, db, isCommittee, reload, setMsg }: { table: string; row: { id: string; status: string }; db: DB; isCommittee: boolean; reload: () => void; setMsg: (s: string) => void }) {
  async function set(s: string) { const { error } = await db.from(table).update({ status: s }).eq('id', row.id); setMsg(error ? error.message : ''); reload(); }
  return <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {row.status === 'brouillon' && <button className="secondary" onClick={() => set('en_validation')}>Soumettre</button>}
    {row.status === 'en_validation' && isCommittee && <button className="primary" onClick={() => set('validee')}>Valider</button>}
    {row.status === 'validee' && isCommittee && <button className="secondary" onClick={() => set('suspendue')}>Suspendre</button>}
  </span>;
}

function useCrops(db: DB) { const [c, setC] = useState<any[]>([]); useEffect(() => { db.from('crops').select('id,name').order('name').then((r: any) => setC(r.data || [])); }, []); return c; }

function RulesAdmin({ db, isCommittee }: { db: DB; isCommittee: boolean }) {
  const crops = useCrops(db);
  const [rows, setRows] = useState<Rule[]>([]);
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ type: 'besoin_engrais', crop: '', source: '', n: '', p: '', k: '', ing: '', dose: '', unit: 'kg', water: '' });
  async function load() { const { data } = await db.from('agro_rules').select('*, crops(name)').order('created_at', { ascending: false }); setRows((data || []) as Rule[]); }
  useEffect(() => { load(); }, []);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const payload = f.type === 'besoin_engrais' ? { n_kg_ha: Number(f.n), p2o5_kg_ha: Number(f.p), k2o_kg_ha: Number(f.k) } : { ingredient_name: f.ing, dose_per_ha: Number(f.dose), unit: f.unit, water_l_ha: Number(f.water) };
    const { error } = await db.from('agro_rules').insert({ rule_type: f.type, crop_id: f.crop, payload, source: f.source });
    setMsg(error ? error.message : 'Règle créée en brouillon.'); load();
  }
  return <>
    <form className="tender" onSubmit={add}><div className="tendermain">
      <label>Type<select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="besoin_engrais">Besoin en engrais</option><option value="dose_traitement">Dose de traitement</option></select></label>
      <label>Culture<select required value={f.crop} onChange={e => setF({ ...f, crop: e.target.value })}><option value="">Choisir…</option>{crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {f.type === 'besoin_engrais' ? <div className="gpsrow"><label>N kg/ha<input required type="number" value={f.n} onChange={e => setF({ ...f, n: e.target.value })} /></label><label>P₂O₅ kg/ha<input required type="number" value={f.p} onChange={e => setF({ ...f, p: e.target.value })} /></label><label>K₂O kg/ha<input required type="number" value={f.k} onChange={e => setF({ ...f, k: e.target.value })} /></label></div>
        : <><label>Matière active / produit<input required value={f.ing} onChange={e => setF({ ...f, ing: e.target.value })} /></label><div className="gpsrow"><label>Dose/ha<input required type="number" step="any" value={f.dose} onChange={e => setF({ ...f, dose: e.target.value })} /></label><label>Unité<select value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}><option>kg</option><option>g</option><option>L</option><option>mL</option></select></label><label>Eau L/ha<input required type="number" value={f.water} onChange={e => setF({ ...f, water: e.target.value })} /></label></div></>}
      <label>Source (obligatoire)<input required value={f.source} onChange={e => setF({ ...f, source: e.target.value })} placeholder="Ex : fiche technique, arrêté, institut…" /></label>
    </div><button className="primary">Créer en brouillon</button></form>
    {msg && <div className="notice">{msg}</div>}
    <div className="adminlist" style={{ marginTop: 12 }}>{rows.map(r => <div key={r.id}><b>{r.crops?.name} — {r.rule_type === 'besoin_engrais' ? 'Besoin engrais' : 'Dose traitement'} v{r.version}<br /><small className="muted">{r.source}</small></b><span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><DemoBadge rule={r} /><StatusButtons table="agro_rules" row={r} db={db} isCommittee={isCommittee} reload={load} setMsg={setMsg} /></span></div>)}</div>
  </>;
}

function IngredientsAdmin({ db }: { db: DB }) {
  const [rows, setRows] = useState<Ingredient[]>([]);
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ name: '', family: 'insecticide', status: 'non_verifie', phi: '', source: '' });
  async function load() { const { data } = await db.from('active_ingredients').select('*').order('name'); setRows((data || []) as Ingredient[]); }
  useEffect(() => { load(); }, []);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await db.from('active_ingredients').insert({ name: f.name, family: f.family, legal_status: f.status, pre_harvest_interval_days: f.phi ? Number(f.phi) : null, source: f.source || null });
    setMsg(error ? error.message : 'Matière active ajoutée.'); load();
  }
  return <>
    <form className="tender" onSubmit={add}><div className="tendermain">
      <label>Nom<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <div className="gpsrow"><label>Famille<select value={f.family} onChange={e => setF({ ...f, family: e.target.value })}>{['insecticide', 'fongicide', 'herbicide', 'acaricide', 'nematicide', 'autre'].map(x => <option key={x}>{x}</option>)}</select></label><label>Statut légal<select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{Object.entries(legalLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>Délai avant récolte (jours)<input type="number" min="0" value={f.phi} onChange={e => setF({ ...f, phi: e.target.value })} /></label></div>
      <label>Source (obligatoire sauf « non vérifié »)<input value={f.source} onChange={e => setF({ ...f, source: e.target.value })} /></label>
    </div><button className="primary">Ajouter</button></form>
    {msg && <div className="notice">{msg}</div>}
    <div className="adminlist" style={{ marginTop: 12 }}>{rows.map(r => <div key={r.id}><b>{r.name} <small className="muted">({r.family})</small><br /><small className="muted">{r.source || 'source à renseigner'}</small></b><span className={'badge ' + (r.legal_status === 'interdit' ? 'danger' : r.legal_status === 'homologue' ? 'green' : '')}>{r.is_demo ? 'DÉMO — ' : ''}{legalLabel[r.legal_status]}{r.pre_harvest_interval_days != null ? ` • DAR ${r.pre_harvest_interval_days} j` : ''}</span></div>)}</div>
  </>;
}

function AdviceAdmin({ db, isCommittee }: { db: DB; isCommittee: boolean }) {
  const crops = useCrops(db);
  const [rows, setRows] = useState<Advice[]>([]);
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ crop: '', cat: 'conduite', from: '0', to: '1', title: '', body: '', source: '' });
  async function load() { const { data } = await db.from('crop_advice').select('*, crops(name)').order('week_from'); setRows((data || []) as Advice[]); }
  useEffect(() => { load(); }, []);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await db.from('crop_advice').insert({ crop_id: f.crop, category: f.cat, week_from: Number(f.from), week_to: Number(f.to), title: f.title, body: f.body, source: f.source || 'à renseigner par le comité' });
    setMsg(error ? error.message : 'Conseil créé en brouillon.'); load();
  }
  return <>
    <form className="tender" onSubmit={add}><div className="tendermain">
      <div className="gpsrow"><label>Culture<select required value={f.crop} onChange={e => setF({ ...f, crop: e.target.value })}><option value="">Choisir…</option>{crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Catégorie<select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}>{Object.entries(catLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
      <div className="gpsrow"><label>Semaine début<input type="number" min="0" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label><label>Semaine fin<input type="number" min="0" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></label></div>
      <label>Titre<input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
      <label>Conseil<input required value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></label>
      <label>Source<input value={f.source} onChange={e => setF({ ...f, source: e.target.value })} /></label>
    </div><button className="primary">Créer en brouillon</button></form>
    {msg && <div className="notice">{msg}</div>}
    <div className="adminlist" style={{ marginTop: 12 }}>{rows.map(r => <div key={r.id}><b>{r.crops?.name} • sem. {r.week_from}–{r.week_to} • {r.title}</b><span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><DemoBadge rule={r} /><StatusButtons table="crop_advice" row={r} db={db} isCommittee={isCommittee} reload={load} setMsg={setMsg} /></span></div>)}</div>
  </>;
}

function MembersAdmin({ db }: { db: DB }) {
  const [members, setMembers] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [pick, setPick] = useState('');
  const [msg, setMsg] = useState('');
  async function load() {
    const [m, p] = await Promise.all([db.from('committee_members').select('user_id, profiles!committee_members_user_id_fkey(full_name)'), db.from('profiles').select('id, full_name, role')]);
    setMembers(m.data || []); setProfiles(p.data || []);
  }
  useEffect(() => { load(); }, []);
  async function add() { if (!pick) return; const { error } = await db.from('committee_members').insert({ user_id: pick }); setMsg(error ? error.message : 'Membre ajouté.'); setPick(''); load(); }
  async function remove(id: string) { const { error } = await db.from('committee_members').delete().eq('user_id', id); setMsg(error ? error.message : 'Membre retiré.'); load(); }
  const ids = new Set(members.map(m => m.user_id));
  return <>
    <div className="tender"><div className="tendermain"><label>Ajouter un membre du comité<select value={pick} onChange={e => setPick(e.target.value)}><option value="">Choisir un utilisateur…</option>{profiles.filter(p => !ids.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)} ({p.role})</option>)}</select></label></div><button className="primary" onClick={add}>Ajouter</button></div>
    {msg && <div className="notice">{msg}</div>}
    {members.length ? <div className="adminlist" style={{ marginTop: 12 }}>{members.map(m => <div key={m.user_id}><b>{m.profiles?.full_name || m.user_id.slice(0, 8)}</b><button className="secondary" onClick={() => remove(m.user_id)}>Retirer</button></div>)}</div> : <div className="empty"><p>Aucun membre du comité pour le moment : personne ne peut encore valider de règle.</p></div>}
  </>;
}

function DemoPurge({ db }: { db: DB }) {
  const [msg, setMsg] = useState('');
  async function purge() {
    if (!window.confirm('Supprimer toutes les données DÉMO (règles, conseils, matières) ?')) return;
    const a = await db.from('crop_advice').delete().eq('is_demo', true);
    const b = await db.from('agro_rules').delete().eq('is_demo', true);
    const c = await db.from('active_ingredients').delete().eq('is_demo', true);
    const err = a.error || b.error || c.error;
    setMsg(err ? err.message : 'Données DÉMO supprimées.');
  }
  return <section className="section"><div className="sectionhead"><h2>Données de démonstration</h2></div><p className="muted">Les lignes « DÉMO — non validé » sont des exemples. Supprimez-les quand le comité a saisi ses vraies règles.</p><button className="secondary" onClick={purge}>Supprimer toutes les données DÉMO</button>{msg && <div className="notice">{msg}</div>}</section>;
}
