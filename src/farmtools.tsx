import React, { useEffect, useState } from 'react';
import { compressImage } from './photos';
import { shopPlans, perPass, type ShopProduct, fertilizerPlan, perPlantPlan, plantsFromSpacing, gramsPerPlant, liquidPlan, weekOf, type FertNeed, type Compound, type LiquidUnit } from './agrocalc';

// Outils « Ma ferme » : journal des travaux, calculateurs, conseils par étape, santé liée au champ,
// panneau comité. Module AJOUTÉ à l'existant : aucune écriture ici ne contourne les règles serveur
// (RLS + triggers) ; les messages d'erreur du serveur sont affichés tels quels.

type DB = any;
type Rule = { id: string; rule_type: 'besoin_engrais' | 'dose_pied' | 'dose_foliaire' | 'dose_traitement'; crop_id: string; territory: string; payload: any; source: string; version: number; status: string; is_demo: boolean; crops?: { name: string } | null };
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
  const [tab, setTab] = useState<'journal' | 'calc' | 'conseils' | 'sante' | 'equipe'>('journal');
  const canManageTeam = role === 'producteur' || role === 'admin' || role === 'super_admin';
  const tabs: [typeof tab, string][] = [['journal', '📒 Travaux'], ['calc', '🧮 Calculateurs'], ['conseils', '🌿 Conseils'], ['sante', '🩺 Santé'], ...(canManageTeam ? [['equipe', '👥 Équipe'] as [typeof tab, string]] : [])];
  return <section className="section">
    <div className="sectionhead"><h2>Outils du champ</h2></div>
    <div className="toolstabs">
      {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'selected' : ''} onClick={() => setTab(k)}>{l}</button>)}
    </div>
    {tab === 'journal' && <Journal db={db} field={field} />}
    {tab === 'calc' && <Calculators db={db} field={field} />}
    {tab === 'conseils' && <CropAdvice db={db} field={field} />}
    {tab === 'sante' && <FieldHealth db={db} field={field} role={role} go={go} />}
    {tab === 'equipe' && canManageTeam && <TeamTab db={db} field={field} />}
  </section>;
}

// ---------- Journal ----------
function treatmentTypeFor(w: any): string {
  if (!w) return 'autre';
  if (w.product_family === 'engrais') return 'engrais';
  if (w.product_family === 'herbicide' || w.product_family === 'fongicide' || w.product_family === 'insecticide') return w.product_family;
  if (w.product_family) return 'pesticide';
  if (w.category === 'irrigation') return 'irrigation';
  if (w.name === 'Récolte') return 'récolte';
  if (w.name === 'Semis direct' || w.name === 'Semis en pépinière') return 'semis';
  if (w.name === 'Repiquage') return 'plantation';
  if (['Désherbage manuel', 'Sarclage', 'Binage'].includes(w.name)) return 'désherbage';
  return 'autre';
}
const modeLabel: Record<string, string> = { systemique: 'systémique', contact: 'contact', selectif: 'sélectif', non_selectif: 'non sélectif', preventif: 'préventif', curatif: 'curatif', autre: '' };
const catName: Record<string, string> = { herbicide: 'Herbicides', fongicide: 'Fongicides', insecticide: 'Insecticides', acaricide: 'Acaricides', nematicide: 'Nématicides', engrais_foliaire: 'Engrais foliaires' };
const wtCatLabel: Record<string, string> = { preparation: 'Préparation du terrain', pepiniere: 'Pépinière', entretien: 'Entretien de la culture', phyto: 'Traitements phytosanitaires', fertilisation: 'Fertilisation', irrigation: 'Irrigation', recolte: 'Récolte et post-récolte', elevage: 'Élevage', autre: 'Autres travaux' };

function WorkTypeSelect({ types, value, onChange, sector }: { types: any[]; value: string; onChange: (id: string) => void; sector?: string }) {
  const list = types.filter(t => !sector || t.sector === 'both' || t.sector === sector);
  const cats = Array.from(new Set(list.map(t => t.category)));
  return <select value={value} onChange={e => onChange(e.target.value)}>
    <option value="">— choisir un travail —</option>
    {cats.map(c => <optgroup key={c} label={wtCatLabel[c] || c}>{list.filter(t => t.category === c).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
  </select>;
}

// ---------- Mes produits et matériel (chaque exploitation saisit les siens : rien n'est imposé) ----------
const INPUT_CATS: [string, string, 'produit' | 'materiel'][] = [
  ['herbicide', 'Herbicide (désherbant)', 'produit'], ['fongicide', 'Fongicide (maladies)', 'produit'], ['insecticide', 'Insecticide (insectes)', 'produit'],
  ['acaricide', 'Acaricide (acariens)', 'produit'], ['nematicide', 'Nématicide (nématodes)', 'produit'], ['rodenticide', 'Raticide (dératisation)', 'produit'],
  ['molluscicide', 'Molluscicide (limaces, escargots)', 'produit'], ['engrais_sol', 'Engrais du sol (NPK, urée, granulés)', 'produit'], ['engrais_foliaire', 'Engrais foliaire', 'produit'],
  ['amendement', 'Amendement (chaux, fumier, compost)', 'produit'], ['semences', 'Semences et plants', 'produit'], ['traitement_semences', 'Traitement des semences', 'produit'],
  ['protection_arbres', 'Soin des arbres (cicatrisant, badigeon)', 'produit'], ['regulateur', 'Régulateur de croissance', 'produit'],
  ['vaccin', 'Vaccin (élevage)', 'produit'], ['vermifuge', 'Vermifuge (élevage)', 'produit'], ['soin_veto', 'Soin vétérinaire', 'produit'], ['aliment', 'Aliment / complément (élevage)', 'produit'],
  ['outil_manuel', 'Outil manuel (machette, houe, daba, râteau, sécateur…)', 'materiel'], ['engin', 'Engin / machine (tronçonneuse, tracteur, motoculteur, débroussailleuse…)', 'materiel'],
  ['pulverisateur', 'Pulvérisateur / épandeur', 'materiel'], ['irrigation_mat', 'Matériel d’arrosage (tuyaux, goutte-à-goutte, motopompe)', 'materiel'],
  ['recolte_mat', 'Matériel de récolte (cageots, sacs, balance)', 'materiel'], ['tuteurage_mat', 'Tuteurs, piquets, ficelle, grillage', 'materiel'],
  ['epi', 'Protection (gants, masque, bottes, combinaison)', 'materiel'],
];
const inputCatLabel = (c: string) => INPUT_CATS.find(x => x[0] === c)?.[1] || c;
// Catégories universelles proposées pour chaque travail (suggestion : l'exploitant peut toujours tout afficher).
function suggestCats(wt: any): string[] {
  if (!wt) return [];
  const n = String(wt.name || '').toLowerCase();
  const has = (...k: string[]) => k.some(x => n.includes(x));
  if (has('abattage')) return ['engin', 'outil_manuel', 'epi'];
  if (has('défrichage')) return ['outil_manuel', 'engin', 'herbicide', 'epi'];
  if (has('dessouchage', 'labour', 'billonnage', 'hersage')) return ['engin', 'outil_manuel'];
  if (has('piquetage', 'tuteurage', 'palissage', 'clôture')) return ['tuteurage_mat', 'outil_manuel'];
  if (has('désherbage chimique')) return ['herbicide', 'pulverisateur', 'epi'];
  if (has('fongicide')) return ['fongicide', 'pulverisateur', 'epi'];
  if (has('insecticide')) return ['insecticide', 'pulverisateur', 'epi'];
  if (has('nématicide')) return ['nematicide', 'pulverisateur', 'epi'];
  if (has('acaricide')) return ['acaricide', 'pulverisateur', 'epi'];
  if (has('dératisation')) return ['rodenticide', 'epi'];
  if (has('traitement des semences')) return ['traitement_semences', 'semences', 'epi'];
  if (has('fumure', 'fertilisation')) return ['engrais_sol', 'engrais_foliaire', 'amendement', 'pulverisateur', 'outil_manuel', 'epi'];
  if (has('pépinière')) return ['semences', 'outil_manuel', 'irrigation_mat', 'traitement_semences'];
  if (has('semis', 'repiquage', 'regarnissage')) return ['semences', 'outil_manuel', 'traitement_semences'];
  if (has('taille', 'éclaircissage', 'soin des arbres')) return ['outil_manuel', 'protection_arbres', 'epi'];
  if (has('désherbage manuel', 'sarclage', 'binage', 'buttage', 'paillage')) return ['outil_manuel', 'amendement'];
  if (has('irrigation')) return ['irrigation_mat', 'engrais_foliaire'];
  if (has('récolte', 'tri ', 'séchage', 'stockage', 'transport')) return ['recolte_mat', 'outil_manuel', 'engin', 'rodenticide'];
  if (has('alimentation', 'abreuvement')) return ['aliment', 'outil_manuel'];
  if (has('vaccination')) return ['vaccin', 'soin_veto', 'epi'];
  if (has('vermifugation')) return ['vermifuge', 'epi'];
  if (has('soins vétérinaires')) return ['soin_veto', 'vaccin', 'vermifuge'];
  if (has('nettoyage')) return ['outil_manuel', 'epi'];
  if (has('surveillance')) return ['outil_manuel', 'rodenticide'];
  return ['outil_manuel'];
}
type PickedItem = { id: string; name: string; kind: string; category: string; dose: string };

function useFarmInputs(db: DB, farmId: string) {
  const [inputs, setInputs] = useState<any[]>([]);
  async function reload() { if (!farmId) return; const { data } = await db.from('farm_inputs').select('*').eq('farm_id', farmId).order('name'); setInputs(data || []); }
  useEffect(() => { reload(); }, [farmId]);
  return { inputs, reload };
}

function FarmInputsManager({ db, farmId, inputs, reload }: { db: DB; farmId: string; inputs: any[]; reload: () => void }) {
  const [f, setF] = useState({ category: 'herbicide', name: '', ai: '', dose: '', notes: '' });
  const [msg, setMsg] = useState('');
  const [banned, setBanned] = useState<string[]>([]);
  useEffect(() => { (async () => { const { data } = await db.from('active_ingredients').select('name').eq('legal_status', 'interdit'); setBanned((data || []).map((x: any) => String(x.name).toLowerCase())); })(); }, []);
  const kind = INPUT_CATS.find(c => c[0] === f.category)?.[2] || 'produit';
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const txt = (f.name + ' ' + f.ai).toLowerCase();
    const hit = banned.find(b => b.length > 3 && txt.includes(b));
    if (hit) { setMsg(`⛔ « ${hit} » est une matière active interdite au Cameroun : enregistrement refusé.`); return; }
    const { data: u } = await db.auth.getUser();
    const { error } = await db.from('farm_inputs').insert({ farm_id: farmId, created_by: u.user?.id, kind, category: f.category, name: f.name.trim(), active_ingredient: f.ai.trim() || null, default_dose: f.dose.trim() || null, notes: f.notes.trim() || null });
    if (error) { setMsg(error.message.includes('duplicate') ? 'Ce nom existe déjà dans votre liste.' : error.message); return; }
    setF({ ...f, name: '', ai: '', dose: '', notes: '' }); setMsg('Ajouté à votre liste.'); reload();
  }
  async function del(id: string) { if (!window.confirm('Retirer cet élément de votre liste ?')) return; const { error } = await db.from('farm_inputs').delete().eq('id', id); setMsg(error ? error.message : ''); reload(); }
  const cats = Array.from(new Set(inputs.map(i => i.category)));
  return <div>
    <p className="muted">Ajoutez ici les produits et le matériel que <b>vous</b> achetez et utilisez dans votre exploitation. La plateforme n’impose aucun produit : vous choisissez selon ce que vous trouvez sur votre marché. Ils seront proposés quand vous assignez un travail.</p>
    <form className="tender" onSubmit={add}><div className="tendermain">
      <label>Catégorie<select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}><optgroup label="Produits">{INPUT_CATS.filter(c => c[2] === 'produit').map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}</optgroup><optgroup label="Matériel et outils">{INPUT_CATS.filter(c => c[2] === 'materiel').map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}</optgroup></select></label>
      <label>{kind === 'produit' ? 'Nom du produit (comme sur l’emballage)' : 'Nom du matériel'}<input required minLength={2} maxLength={80} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      {kind === 'produit' && <label>Matière active (facultatif, lue sur l’emballage)<input maxLength={80} value={f.ai} onChange={e => setF({ ...f, ai: e.target.value })} /></label>}
      <label>{kind === 'produit' ? 'Dosage habituel (ex. 30 mL par pulvérisateur de 15 L)' : 'Précision (facultatif)'}<input maxLength={120} value={f.dose} onChange={e => setF({ ...f, dose: e.target.value })} /></label>
      <label>Remarque (facultatif)<input maxLength={300} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
    </div><button className="primary wide" style={{ minHeight: 44 }}>＋ Ajouter à ma liste</button></form>
    {msg && <div className="notice">{msg}</div>}
    {inputs.length ? cats.map(c => <div key={c} style={{ marginTop: 10 }}><b>{inputCatLabel(c)}</b><div className="adminlist">{inputs.filter(i => i.category === c).map(i => <div key={i.id}><b>{i.name}{i.active_ingredient ? ` (${i.active_ingredient})` : ''}<br /><small className="muted">{i.default_dose || ''}</small></b><button type="button" className="secondary" onClick={() => del(i.id)}>Retirer</button></div>)}</div></div>) : <div className="empty"><p>Votre liste est vide.</p></div>}
  </div>;
}

function ItemsPicker({ inputs, wt, picked, setPicked }: { inputs: any[]; wt: any; picked: PickedItem[]; setPicked: (p: PickedItem[]) => void }) {
  const [all, setAll] = useState(false);
  if (!wt) return null;
  const sug = suggestCats(wt);
  const list = inputs.filter(i => all || sug.includes(i.category));
  const cats = Array.from(new Set(list.map(i => i.category)));
  const isPicked = (id: string) => picked.find(p => p.id === id);
  function toggle(i: any) { setPicked(isPicked(i.id) ? picked.filter(p => p.id !== i.id) : [...picked, { id: i.id, name: i.name, kind: i.kind, category: i.category, dose: i.default_dose || '' }]); }
  return <div style={{ marginTop: 8 }}>
    <b>Produits et matériel à utiliser pour ce travail</b>
    <p className="muted">Catégories habituelles : {sug.map(inputCatLabel).join(' • ')}</p>
    {list.length ? cats.map(c => <div key={c}><small><b>{inputCatLabel(c)}</b></small>{list.filter(i => i.category === c).map(i => {
      const p = isPicked(i.id);
      return <div key={i.id} style={{ margin: '4px 0' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!p} onChange={() => toggle(i)} style={{ width: 20, height: 20 }} /> {i.name}{i.active_ingredient ? ` (${i.active_ingredient})` : ''}</label>
        {p && <input style={{ marginLeft: 28, width: 'calc(100% - 28px)' }} placeholder="Dosage / consigne pour l’ouvrier" maxLength={120} value={p.dose} onChange={e => setPicked(picked.map(x => x.id === i.id ? { ...x, dose: e.target.value } : x))} />}
      </div>;
    })}</div>) : <div className="notice">Rien dans votre liste pour ce travail. Ajoutez vos produits / matériel dans « Mes produits et matériel » puis revenez ici.</div>}
    <button type="button" className="ghost" onClick={() => setAll(a => !a)}>{all ? 'Voir seulement les catégories habituelles' : 'Voir tous mes produits et matériel'}</button>
  </div>;
}
const itemsText = (items: any[]) => (items || []).map(i => `${i.name}${i.dose ? ' — ' + i.dose : ''}`).join(' ; ');

function Journal({ db, field }: { db: DB; field: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const { inputs, reload: reloadInputs } = useFarmInputs(db, field.farm_id);
  const [f, setF] = useState({ wt: '', date: today(), dose: '', unit: 'kg', area: String(field.area_ha || ''), rec: '', notes: '' });
  async function load() {
    const [t, w] = await Promise.all([
      db.from('treatments').select('*, work_types(name)').eq('field_id', field.id).order('treatment_date', { ascending: false }).limit(50),
      db.from('work_types').select('*').eq('active', true).order('name'),
    ]);
    setRows(t.data || []); setTypes(w.data || []); setLoading(false);
  }
  useEffect(() => { load(); }, [field.id]);
  const wt = types.find(t => t.id === f.wt);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (!wt) { setMsg('Choisissez le travail réalisé.'); return; }
    setBusy(true);
    const { error } = await db.from('treatments').insert({
      field_id: field.id, type: treatmentTypeFor(wt), work_type_id: wt.id, treatment_date: f.date,
      product: picked.length ? itemsText(picked).slice(0, 200) : null, items: picked,
      dose_value: f.dose ? Number(f.dose) : null, dose_unit: f.dose ? f.unit : null,
      area_ha: f.area ? Number(f.area) : null, recurrence_days: f.rec ? Number(f.rec) : null, notes: f.notes || null,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setPicked([]); setF({ ...f, dose: '', notes: '' }); setMsg('Travail enregistré.'); load();
  }
  const blocked = rows.filter(r => r.pre_harvest_until && r.pre_harvest_until >= today()).sort((a, b) => b.pre_harvest_until.localeCompare(a.pre_harvest_until))[0];
  const addDays = (d: string, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const upcoming = rows.filter(r => r.recurrence_days).map(r => ({ r, next: addDays(r.treatment_date, r.recurrence_days) })).filter(x => x.next >= today()).sort((a, b) => a.next.localeCompare(b.next))[0];
  return <>
    {blocked && <div className="notice">⏳ Ne pas récolter avant le <b>{fmt(blocked.pre_harvest_until)}</b> (délai avant récolte du dernier traitement).</div>}
    {upcoming && <div className="notice">🔁 Prochain travail récurrent : <b>{upcoming.r.work_types?.name || typeLabel[upcoming.r.type]}</b> le <b>{fmt(upcoming.next)}</b>.</div>}
    <details style={{ marginBottom: 12 }}><summary><b>Mes produits et matériel ({inputs.length})</b></summary><FarmInputsManager db={db} farmId={field.farm_id} inputs={inputs} reload={reloadInputs} /></details>
    <form className="tender" onSubmit={save}>
      <div className="tendermain">
        <label>Travail réalisé<WorkTypeSelect types={types} value={f.wt} onChange={id => { setF({ ...f, wt: id }); setPicked([]); }} /></label>
        <label>Date<input type="date" required value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
        <ItemsPicker inputs={inputs} wt={wt} picked={picked} setPicked={setPicked} />
        {wt && <div className="gpsrow"><label>Quantité totale utilisée (facultatif)<input type="number" min="0" step="any" value={f.dose} onChange={e => setF({ ...f, dose: e.target.value })} /></label><label>Unité<select value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}><option>kg</option><option>g</option><option>L</option><option>mL</option><option>sacs</option></select></label></div>}
        <label>Surface concernée (ha)<input type="number" min="0" step="any" value={f.area} onChange={e => setF({ ...f, area: e.target.value })} /></label>
        {(wt?.recurring_hint || wt?.product_family) && <label>À répéter tous les … jours (facultatif)<input type="number" min="1" max="365" value={f.rec} onChange={e => setF({ ...f, rec: e.target.value })} placeholder="ex. 7" /></label>}
        <label>Remarque<input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
      </div>
      <button className="primary wide" style={{ minHeight: 48 }} disabled={busy}>{busy ? 'Enregistrement…' : '＋ Enregistrer ce travail'}</button>
    </form>
    {msg && <div className="notice">{msg}</div>}
    {loading ? <div className="loading">Chargement…</div> : rows.length ? <div className="adminlist" style={{ marginTop: 12 }}>{rows.map(r => <div key={r.id}><b>{r.work_types?.name || typeLabel[r.type] || r.type}{r.dose_value ? ` • ${r.dose_value} ${r.dose_unit}` : ''}{Array.isArray(r.items) && r.items.length ? <><br /><small className="muted">{itemsText(r.items)}</small></> : r.product ? <><br /><small className="muted">{r.product}</small></> : null}</b><span className="badge">{fmt(r.treatment_date)}{r.recurrence_days ? ` • tous les ${r.recurrence_days} j` : ''}{r.pre_harvest_until ? ` • récolte après ${fmt(r.pre_harvest_until)}` : ''}</span></div>)}</div> : <div className="empty"><p>Aucun travail enregistré sur ce champ.</p></div>}
  </>;
}

// ---------- Calculateurs ----------
// Deux familles, comme sur le terrain :
//  • GRANULÉ (engrais) : on le jette au pied de la plante → grammes par pied (validé par le comité).
//  • LIQUIDE (engrais foliaire, insecticide, fongicide, herbicide) : on le dilue dans le pulvérisateur → mL / cL par pulvérisateur.
function pickRule(rules: Rule[], type: string, family?: string): Rule | null {
  const list = rules.filter(r => r.rule_type === type && (!family || !r.payload?.family || r.payload.family === family));
  return list.find(r => r.status === 'validee') || list.find(r => r.is_demo) || null;
}

function Calculators({ db, field }: { db: DB; field: any }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'granule' | 'commerce' | 'liquide'>('granule');
  const [area, setArea] = useState(String(field.area_ha || ''));
  useEffect(() => { (async () => { if (!field.crop_id) { setLoading(false); return; } const { data } = await db.from('agro_rules').select('*').eq('crop_id', field.crop_id).neq('status', 'suspendue'); setRules((data || []) as Rule[]); setLoading(false); })(); }, [field.id]);
  if (loading) return <div className="loading">Chargement…</div>;
  return <>
    <div className="quick" style={{ marginBottom: 10 }}>
      <Quick label="🌾 Engrais granulé (au pied)" on={mode === 'granule'} onClick={() => setMode('granule')} />
      <Quick label="🛒 Engrais du commerce (sacs)" on={mode === 'commerce'} onClick={() => setMode('commerce')} />
      <Quick label="💧 Liquide (pulvérisateur)" on={mode === 'liquide'} onClick={() => setMode('liquide')} />
    </div>
    <label>Surface du champ (ha)<input type="number" min="0" step="any" value={area} onChange={e => setArea(e.target.value)} /></label>
    {mode === 'granule' ? <GranuleCalc field={field} rules={rules} area={Number(area) || 0} /> : mode === 'commerce' ? <ShopCalc db={db} field={field} rules={rules} area={Number(area) || 0} /> : <LiquidCalc field={field} rules={rules} area={Number(area) || 0} />}
  </>;
}

function GranuleCalc({ field, rules, area }: { field: any; rules: Rule[]; area: number }) {
  const pRule = pickRule(rules, 'dose_pied');
  const fRule = pickRule(rules, 'besoin_engrais');
  const [sp, setSp] = useState({ row: '', plant: '', plants: '' });
  const [useCompound, setUseCompound] = useState(false);
  const [comp, setComp] = useState({ n: '15', p2o5: '15', k2o: '15' });
  const [manual, setManual] = useState({ n: '', p: '', k: '' });
  useEffect(() => { if (pRule) setSp(s => ({ ...s, row: s.row || String(pRule.payload.spacing_row_m ?? ''), plant: s.plant || String(pRule.payload.spacing_plant_m ?? '') })); }, [pRule?.id]);
  const plants = Number(sp.plants) || plantsFromSpacing(area, Number(sp.row) || 0, Number(sp.plant) || 0);
  const manualOn = !fRule && (manual.n || manual.p || manual.k);
  const need: FertNeed | null = fRule ? fRule.payload : manualOn ? { n_kg_ha: Number(manual.n) || 0, p2o5_kg_ha: Number(manual.p) || 0, k2o_kg_ha: Number(manual.k) || 0 } : null;
  const cmp: Compound | null = useCompound ? { n: Number(comp.n) || 0, p2o5: Number(comp.p2o5) || 0, k2o: Number(comp.k2o) || 0 } : null;
  const fert = need ? fertilizerPlan(need, area, cmp) : null;
  const pp = pRule ? perPlantPlan(Number(pRule.payload.grams_per_plant) || 0, plants) : null;
  return <div className="tender" style={{ marginTop: 12 }}><div className="tendermain">
    <h3>Engrais granulé — {field.crops?.name || 'culture'}</h3>
    <p className="muted">Se répand au pied de la plante (jamais dans le pulvérisateur). Indiquez l’écartement pour connaître le nombre de pieds.</p>
    <div className="gpsrow"><label>Entre les lignes (m)<input type="number" min="0" step="any" value={sp.row} onChange={e => setSp({ ...sp, row: e.target.value, plants: '' })} /></label><label>Entre les pieds (m)<input type="number" min="0" step="any" value={sp.plant} onChange={e => setSp({ ...sp, plant: e.target.value, plants: '' })} /></label><label>ou nombre de pieds<input type="number" min="0" value={sp.plants} onChange={e => setSp({ ...sp, plants: e.target.value })} /></label></div>
    <div className="farmsummary"><div><span>Pieds estimés</span><b>{plants ? plants.toLocaleString('fr-FR') : '—'}</b></div></div>

    <h3 style={{ marginTop: 14 }}>Grammage par pied</h3>
    {pRule ? <>
      <p><DemoBadge rule={pRule} /> {pRule.payload.product_name || 'Engrais'} : <b>{pRule.payload.grams_per_plant} g par pied</b> <span className="muted">({pRule.source})</span></p>
      {pp && plants > 0 && <div className="farmsummary"><div><span>À jeter au pied</span><b>{pRule.payload.grams_per_plant} g / pied</b></div><div><span>Total à acheter</span><b>{pp.totalKg} kg</b></div><div><span>Sacs de 50 kg</span><b>{pp.sacks50}</b></div></div>}
      {pRule.is_demo && pRule.status !== 'validee' && <div className="notice">⚠ Grammage DÉMO, non validé par le comité technique : exemple seulement.</div>}
    </> : <p className="muted">Grammage par pied non encore validé pour cette culture : <b>dose à confirmer</b>. Le tableau ci-dessous donne seulement un calcul indicatif.</p>}

    <h3 style={{ marginTop: 14 }}>Besoin en éléments nutritifs (kg/ha)</h3>
    {fRule ? <p><DemoBadge rule={fRule} /> N {fRule.payload.n_kg_ha} • P₂O₅ {fRule.payload.p2o5_kg_ha} • K₂O {fRule.payload.k2o_kg_ha} <span className="muted">({fRule.source})</span></p>
      : <><p className="muted">Aucune règle : saisie manuelle possible (résultat non validé).</p><div className="gpsrow"><label>N<input type="number" value={manual.n} onChange={e => setManual({ ...manual, n: e.target.value })} /></label><label>P₂O₅<input type="number" value={manual.p} onChange={e => setManual({ ...manual, p: e.target.value })} /></label><label>K₂O<input type="number" value={manual.k} onChange={e => setManual({ ...manual, k: e.target.value })} /></label></div></>}
    <label style={{ flexDirection: 'row', gap: 8 }}><input type="checkbox" checked={useCompound} onChange={e => setUseCompound(e.target.checked)} /> J’utilise un engrais composé NPK</label>
    {useCompound && <div className="gpsrow"><label>% N<input type="number" value={comp.n} onChange={e => setComp({ ...comp, n: e.target.value })} /></label><label>% P₂O₅<input type="number" value={comp.p2o5} onChange={e => setComp({ ...comp, p2o5: e.target.value })} /></label><label>% K₂O<input type="number" value={comp.k2o} onChange={e => setComp({ ...comp, k2o: e.target.value })} /></label></div>}
    {fert && <div className="adminlist">{fert.lines.map(l => <div key={l.label}><b>{l.label}</b><span className="badge green">{l.kg} kg • {l.sacks50} sac(s){plants ? ` • ${gramsPerPlant(l.kg, plants)} g/pied` : ''}</span></div>)}
      <p className="muted">Apport couvert : N {fert.supplied.n} • P₂O₅ {fert.supplied.p2o5} • K₂O {fert.supplied.k2o} kg (besoin : N {fert.need.n} • P₂O₅ {fert.need.p2o5} • K₂O {fert.need.k2o}). Les « g/pied » se répartissent souvent en plusieurs passages sur la saison.</p></div>}
    {((fRule?.is_demo && fRule.status !== 'validee') || manualOn) && <div className="notice">⚠ Besoins non validés par le comité technique : exemple, pas une recommandation.</div>}
  </div></div>;
}

const liquidKinds: [string, string][] = [['foliaire', 'Engrais foliaire'], ['insecticide', 'Insecticide'], ['fongicide', 'Fongicide'], ['herbicide', 'Herbicide'], ['autre', 'Autre pesticide']];

function LiquidCalc({ field, rules, area }: { field: any; rules: Rule[]; area: number }) {
  const [kind, setKind] = useState('foliaire');
  const rule = kind === 'foliaire' ? pickRule(rules, 'dose_foliaire') : pickRule(rules, 'dose_traitement', kind);
  const [d, setD] = useState({ dose: '', unit: 'mL' as LiquidUnit, basis: 'ha' as 'ha' | 'pompe', water: '', tank: '16' });
  useEffect(() => { setD(x => rule ? { ...x, dose: String(rule.payload.dose_per_ha ?? ''), unit: (rule.payload.unit as LiquidUnit) || 'mL', basis: 'ha', water: String(rule.payload.water_l_ha ?? '') } : { ...x, dose: '', water: '' }); }, [rule?.id, kind]);
  const r = liquidPlan({ dose: Number(d.dose) || 0, unit: d.unit, basis: d.basis, areaHa: area, waterLPerHa: Number(d.water) || 0, tankL: Number(d.tank) || 0 });
  const bu = r.solid ? 'g' : 'mL';
  const show = (v: number) => (r.solid ? (v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR')} kg` : `${v} g`) : (v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR')} L` : `${v} mL`));
  return <div className="tender" style={{ marginTop: 12 }}><div className="tendermain">
    <h3>Produit liquide / pulvérisateur</h3>
    <p className="muted">Se dilue dans l’eau du pulvérisateur : engrais foliaire, insecticide, fongicide, herbicide.</p>
    <label>Type de produit<select value={kind} onChange={e => setKind(e.target.value)}>{liquidKinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    {rule ? <p><DemoBadge rule={rule} /> {rule.payload.product_name || rule.payload.ingredient_name || 'Produit'} <span className="muted">({rule.source})</span></p> : <p className="muted">Aucune dose validée pour ce type et cette culture : <b>dose à confirmer</b>. Saisissez la dose de l’étiquette du produit.</p>}
    <div className="gpsrow"><label>La dose indiquée est…<select value={d.basis} onChange={e => setD({ ...d, basis: e.target.value as any })}><option value="ha">par hectare</option><option value="pompe">par pulvérisateur</option></select></label><label>Dose<input type="number" min="0" step="any" value={d.dose} onChange={e => setD({ ...d, dose: e.target.value })} /></label><label>Unité<select value={d.unit} onChange={e => setD({ ...d, unit: e.target.value as LiquidUnit })}><option>mL</option><option>L</option><option>g</option><option>kg</option></select></label></div>
    <div className="gpsrow"><label>Eau par hectare (L)<input type="number" min="0" step="any" value={d.water} onChange={e => setD({ ...d, water: e.target.value })} /></label><label>Pulvérisateur (L)<select value={d.tank} onChange={e => setD({ ...d, tank: e.target.value })}>{['5', '10', '15', '16', '20'].map(x => <option key={x}>{x}</option>)}</select></label></div>
    {r.perTankBase > 0 && <div className="farmsummary">
      <div><span>Dans chaque pulvérisateur de {d.tank} L</span><b>{show(r.perTankBase)}{!r.solid ? ` (${r.perTankCl} cL)` : ''}</b></div>
      <div><span>Par litre d’eau</span><b>{r.perLitreBase} {bu}</b></div>
      <div><span>Produit total</span><b>{show(r.totalBase)}</b></div>
      <div><span>Pulvérisateurs à remplir</span><b>{r.tanksToFill}</b></div>
      <div><span>Eau totale</span><b>{r.waterTotal} L</b></div></div>}
    {rule?.is_demo && rule.status !== 'validee' && <div className="notice">⚠ Dose DÉMO, non validée par le comité technique : exemple seulement.</div>}
    <p className="muted">Respectez toujours l’étiquette du produit, le délai avant récolte et les équipements de protection.</p>
  </div></div>;
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
  const [tab, setTab] = useState<'regles' | 'matieres' | 'engrais' | 'conseils' | 'membres'>('regles');
  const tabs: [typeof tab, string][] = [['regles', 'Règles'], ['matieres', 'Matières actives'], ['engrais', 'Engrais'], ['conseils', 'Conseils'], ...(isAdmin ? [['membres', 'Membres'] as [typeof tab, string]] : [])];
  return <>
    <div className="pageintro"><div><span className="eyebrow">GOUVERNANCE</span><h1>Comité technique</h1><p>Seuls les membres du comité valident. Une règle validée est figée : toute correction crée une nouvelle version.{!isCommittee && ' (Vous êtes administrateur : vous préparez, le comité valide.)'}</p></div></div>
    <div className="toolstabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'selected' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'regles' && <RulesAdmin db={db} isCommittee={isCommittee} />}
    {tab === 'matieres' && <IngredientsAdmin db={db} />}
    {tab === 'engrais' && <FertilizerAdmin db={db} isAdmin={isAdmin} />}
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

const ruleName: Record<string, string> = { besoin_engrais: 'Besoin N-P-K', dose_pied: 'Granulé : g/pied', dose_foliaire: 'Engrais foliaire', dose_traitement: 'Pesticide/insecticide/fongicide' };
function RulesAdmin({ db, isCommittee }: { db: DB; isCommittee: boolean }) {
  const crops = useCrops(db);
  const [rows, setRows] = useState<Rule[]>([]);
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ type: 'besoin_engrais', crop: '', source: '', n: '', p: '', k: '', ing: '', dose: '', unit: 'mL', water: '', family: 'fongicide', gpp: '', row: '', plant: '' });
  async function load() { const { data } = await db.from('agro_rules').select('*, crops(name)').order('created_at', { ascending: false }); setRows((data || []) as Rule[]); }
  useEffect(() => { load(); }, []);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const liquid = { product_name: f.ing, dose_per_ha: Number(f.dose), unit: f.unit, water_l_ha: Number(f.water) };
    const payload = f.type === 'besoin_engrais' ? { n_kg_ha: Number(f.n), p2o5_kg_ha: Number(f.p), k2o_kg_ha: Number(f.k) }
      : f.type === 'dose_pied' ? { product_name: f.ing, grams_per_plant: Number(f.gpp), spacing_row_m: Number(f.row) || null, spacing_plant_m: Number(f.plant) || null }
      : f.type === 'dose_foliaire' ? liquid : { ...liquid, ingredient_name: f.ing, family: f.family };
    const { error } = await db.from('agro_rules').insert({ rule_type: f.type, crop_id: f.crop, payload, source: f.source });
    setMsg(error ? error.message : 'Règle créée en brouillon.'); load();
  }
  return <>
    <form className="tender" onSubmit={add}><div className="tendermain">
      <label>Type<select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="besoin_engrais">Besoin en éléments (N-P-K kg/ha)</option><option value="dose_pied">Engrais granulé : grammage par pied</option><option value="dose_foliaire">Engrais foliaire (pulvérisateur)</option><option value="dose_traitement">Pesticide / insecticide / fongicide / herbicide</option></select></label>
      <label>Culture<select required value={f.crop} onChange={e => setF({ ...f, crop: e.target.value })}><option value="">Choisir…</option>{crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {f.type === 'besoin_engrais' && <div className="gpsrow"><label>N kg/ha<input required type="number" value={f.n} onChange={e => setF({ ...f, n: e.target.value })} /></label><label>P₂O₅ kg/ha<input required type="number" value={f.p} onChange={e => setF({ ...f, p: e.target.value })} /></label><label>K₂O kg/ha<input required type="number" value={f.k} onChange={e => setF({ ...f, k: e.target.value })} /></label></div>}
      {f.type === 'dose_pied' && <><label>Produit / engrais granulé<input required value={f.ing} onChange={e => setF({ ...f, ing: e.target.value })} /></label><div className="gpsrow"><label>Grammes par pied<input required type="number" step="any" value={f.gpp} onChange={e => setF({ ...f, gpp: e.target.value })} /></label><label>Entre lignes (m)<input type="number" step="any" value={f.row} onChange={e => setF({ ...f, row: e.target.value })} /></label><label>Entre pieds (m)<input type="number" step="any" value={f.plant} onChange={e => setF({ ...f, plant: e.target.value })} /></label></div></>}
      {(f.type === 'dose_foliaire' || f.type === 'dose_traitement') && <><label>Produit / matière active<input required value={f.ing} onChange={e => setF({ ...f, ing: e.target.value })} /></label>{f.type === 'dose_traitement' && <label>Famille<select value={f.family} onChange={e => setF({ ...f, family: e.target.value })}><option value="insecticide">Insecticide</option><option value="fongicide">Fongicide</option><option value="herbicide">Herbicide</option><option value="autre">Autre</option></select></label>}<div className="gpsrow"><label>Dose par hectare<input required type="number" step="any" value={f.dose} onChange={e => setF({ ...f, dose: e.target.value })} /></label><label>Unité<select value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}><option>mL</option><option>L</option><option>g</option><option>kg</option></select></label><label>Eau L/ha<input required type="number" value={f.water} onChange={e => setF({ ...f, water: e.target.value })} /></label></div></>}
      <label>Source (obligatoire)<input required value={f.source} onChange={e => setF({ ...f, source: e.target.value })} placeholder="Ex : fiche technique, arrêté, institut…" /></label>
    </div><button className="primary">Créer en brouillon</button></form>
    {msg && <div className="notice">{msg}</div>}
    <div className="adminlist" style={{ marginTop: 12 }}>{rows.map(r => <div key={r.id}><b>{r.crops?.name} — {ruleName[r.rule_type]} v{r.version}<br /><small className="muted">{r.source}</small></b><span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><DemoBadge rule={r} /><StatusButtons table="agro_rules" row={r} db={db} isCommittee={isCommittee} reload={load} setMsg={setMsg} /></span></div>)}</div>
  </>;
}


// ---------- Engrais du commerce : calcul en sacs réels ----------
type FertProduct = { id: string; name: string; brand: string | null; n_pct: number; p2o5_pct: number; k2o_pct: number; bag_kg: number; verified: boolean; source: string | null; notes: string | null; label_photos: string[]; active: boolean };
const fmtAnalysis = (p: { n_pct: number; p2o5_pct: number; k2o_pct: number }) => `${Number(p.n_pct)}-${Number(p.p2o5_pct)}-${Number(p.k2o_pct)}`;

function ShopCalc({ db, field, rules, area }: { db: DB; field: any; rules: Rule[]; area: number }) {
  const [products, setProducts] = useState<FertProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [passes, setPasses] = useState('3');
  const [sp, setSp] = useState({ row: '', plant: '' });
  const [manual, setManual] = useState({ n: '', p: '', k: '' });
  const fRule = pickRule(rules, 'besoin_engrais');
  const pRule = pickRule(rules, 'dose_pied');
  useEffect(() => { (async () => { const { data } = await db.from('fertilizer_products').select('*').eq('active', true).order('name'); const list = ((data || []) as any[]).map(x => ({ ...x, n_pct: Number(x.n_pct), p2o5_pct: Number(x.p2o5_pct), k2o_pct: Number(x.k2o_pct), bag_kg: Number(x.bag_kg), label_photos: x.label_photos || [] })) as FertProduct[]; setProducts(list); setLoading(false); })(); }, []);
  useEffect(() => { if (pRule) setSp(s => ({ row: s.row || String(pRule.payload.spacing_row_m ?? ''), plant: s.plant || String(pRule.payload.spacing_plant_m ?? '') })); }, [pRule?.id]);
  const manualOn = !fRule && (manual.n || manual.p || manual.k);
  const need: FertNeed | null = fRule ? fRule.payload : manualOn ? { n_kg_ha: Number(manual.n) || 0, p2o5_kg_ha: Number(manual.p) || 0, k2o_kg_ha: Number(manual.k) || 0 } : null;
  const chosen: ShopProduct[] = products.filter(p => picked[p.id]).map(p => ({ id: p.id, name: p.name, n: p.n_pct, p2o5: p.p2o5_pct, k2o: p.k2o_pct, bagKg: p.bag_kg, verified: p.verified }));
  const np = Math.min(12, Math.max(1, Math.floor(Number(passes)) || 1));
  const plans = need && area > 0 && chosen.length ? shopPlans(need, area, chosen, np) : [];
  const plants = plantsFromSpacing(area, Number(sp.row) || 0, Number(sp.plant) || 0);
  if (loading) return <div className="loading">Chargement…</div>;
  return <div className="tender" style={{ marginTop: 12 }}><div className="tendermain">
    <h3>Engrais du commerce — {field.crops?.name || 'culture'}</h3>
    <p className="muted">Cochez les engrais que vous trouvez chez vous. Le calcul donne le nombre de sacs et la dose par passage.</p>
    {products.length ? <div className="adminlist">{products.map(p => <div key={p.id}><label style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!picked[p.id]} onChange={e => setPicked({ ...picked, [p.id]: e.target.checked })} /> <b>{p.name}{p.brand ? ` (${p.brand})` : ''}</b></label><span className={'badge ' + (p.verified ? 'green' : '')}>{fmtAnalysis(p)} • sac {p.bag_kg} kg{p.verified ? '' : ' • à vérifier'}</span></div>)}</div> : <p className="muted">Aucun engrais dans le catalogue pour l’instant.</p>}
    <h3 style={{ marginTop: 14 }}>Besoin de la culture (kg/ha)</h3>
    {fRule ? <p><DemoBadge rule={fRule} /> N {fRule.payload.n_kg_ha} • P₂O₅ {fRule.payload.p2o5_kg_ha} • K₂O {fRule.payload.k2o_kg_ha} <span className="muted">({fRule.source})</span></p>
      : <><p className="muted">Aucune règle validée : saisie manuelle possible (résultat non validé).</p><div className="gpsrow"><label>N<input type="number" min="0" value={manual.n} onChange={e => setManual({ ...manual, n: e.target.value })} /></label><label>P₂O₅<input type="number" min="0" value={manual.p} onChange={e => setManual({ ...manual, p: e.target.value })} /></label><label>K₂O<input type="number" min="0" value={manual.k} onChange={e => setManual({ ...manual, k: e.target.value })} /></label></div></>}
    <div className="gpsrow"><label>Nombre de passages<input type="number" min="1" max="12" value={passes} onChange={e => setPasses(e.target.value)} /></label><label>Entre lignes (m)<input type="number" min="0" step="any" value={sp.row} onChange={e => setSp({ ...sp, row: e.target.value })} /></label><label>Entre pieds (m)<input type="number" min="0" step="any" value={sp.plant} onChange={e => setSp({ ...sp, plant: e.target.value })} /></label></div>
    {!need && <p className="muted">Pas de besoin connu pour cette culture : saisissez-le ci-dessus ou attendez la règle du comité.</p>}
    {need && chosen.length === 0 && <p className="muted">Cochez au moins un engrais.</p>}
    {need && chosen.length > 0 && area > 0 && plans.length === 0 && <div className="notice">Avec ces produits, aucun calcul possible (il manque par exemple un engrais azoté, phosphaté ou potassique). Cochez-en d’autres.</div>}
    {plans.map((pl, i) => <div key={i} style={{ marginTop: 12 }}>
      <h3>{i === 0 ? 'Meilleure combinaison' : `Autre combinaison ${i + 1}`} — {pl.totalKg} kg au total</h3>
      <div className="adminlist">{pl.lines.map(l => { const pp = perPass(l, plants); return <div key={l.productId}><b>{l.name}{l.verified ? '' : ' ⚠'}<br /><small className="muted">{l.kg} kg • {l.bags} sac(s) de {l.bagKg} kg → acheter {l.bagsRounded}</small><br /><small className="muted">{l.passes.length === 1 ? 'En 1 passage (fond)' : `${l.passes.length} passages de ${pp.kg} kg`}{plants ? ` • ${pp.gPerPlant} g/pied/passage` : ''}</small></b><span className="badge green">{l.bagsRounded} sac(s)</span></div>; })}</div>
      <p className="muted">Apport : N {pl.supplied.n} • P₂O₅ {pl.supplied.p2o5} • K₂O {pl.supplied.k2o} kg (besoin : N {pl.need.n} • P₂O₅ {pl.need.p2o5} • K₂O {pl.need.k2o}).{(pl.missing.n + pl.missing.p2o5 + pl.missing.k2o) > 0 ? ` Non couvert : N ${pl.missing.n} • P₂O₅ ${pl.missing.p2o5} • K₂O ${pl.missing.k2o}.` : ''}{(pl.excess.n + pl.excess.p2o5 + pl.excess.k2o) > 0 ? ` Surplus : N ${pl.excess.n} • P₂O₅ ${pl.excess.p2o5} • K₂O ${pl.excess.k2o}.` : ''}</p>
    </div>)}
    {plans.length > 0 && <div className="notice">Le phosphore est placé au fond (1er passage), le reste est réparti également sur les passages : répartition indicative, à adapter selon les conseils du comité. Les produits marqués ⚠ ont une analyse non vérifiée : lisez l’étiquette du sac.</div>}
    {((fRule?.is_demo && fRule.status !== 'validee') || manualOn) && <div className="notice">⚠ Besoins non validés par le comité technique : exemple, pas une recommandation.</div>}
  </div></div>;
}

// ---------- Catalogue des engrais (administrateur) ----------
function FertilizerAdmin({ db, isAdmin }: { db: DB; isAdmin: boolean }) {
  const [rows, setRows] = useState<FertProduct[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const empty = { id: '', name: '', brand: '', n: '', p: '', k: '', bag: '50', verified: false, source: '', notes: '' };
  const [f, setF] = useState(empty);
  const [files, setFiles] = useState<File[]>([]);
  async function load() { const { data } = await db.from('fertilizer_products').select('*').order('name'); setRows(((data || []) as any[]).map(x => ({ ...x, n_pct: Number(x.n_pct), p2o5_pct: Number(x.p2o5_pct), k2o_pct: Number(x.k2o_pct), bag_kg: Number(x.bag_kg), label_photos: x.label_photos || [] })) as FertProduct[]); }
  useEffect(() => { load(); }, []);
  if (!isAdmin) return <div className="empty"><p>Seul l’administrateur gère le catalogue des engrais.</p></div>;
  const n = Number(f.n) || 0, p = Number(f.p) || 0, k = Number(f.k) || 0, bag = Number(f.bag) || 0;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (n < 0 || p < 0 || k < 0 || n + p + k <= 0 || n + p + k > 100) { setMsg('Analyse invalide : la somme N + P₂O₅ + K₂O doit être entre 1 et 100 %.'); return; }
    if (bag <= 0 || bag > 1000) { setMsg('Poids du sac invalide.'); return; }
    if (files.length > 3) { setMsg('3 photos maximum.'); return; }
    setBusy(true); setMsg('');
    try {
      const existing = rows.find(r => r.id === f.id);
      const photos: string[] = [...(existing?.label_photos || [])];
      for (const file of files) {
        if (photos.length >= 3) break;
        const blob = await compressImage(file, 1280, 0.82);
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const up = await db.storage.from('product-labels').upload(path, blob, { contentType: 'image/jpeg' });
        if (up.error) throw new Error(up.error.message);
        photos.push(path);
      }
      const payload = { name: f.name.trim(), brand: f.brand.trim() || null, n_pct: n, p2o5_pct: p, k2o_pct: k, bag_kg: bag, verified: f.verified, source: f.source.trim() || null, notes: f.notes.trim() || null, label_photos: photos };
      const { error } = f.id ? await db.from('fertilizer_products').update(payload).eq('id', f.id) : await db.from('fertilizer_products').insert(payload);
      setMsg(error ? error.message : f.id ? 'Engrais modifié.' : 'Engrais ajouté.');
      if (!error) { setF(empty); setFiles([]); }
      load();
    } catch (err: any) { setMsg(err?.message || 'Erreur'); }
    setBusy(false);
  }
  async function toggle(r: FertProduct) { const { error } = await db.from('fertilizer_products').update({ active: !r.active }).eq('id', r.id); setMsg(error ? error.message : r.active ? 'Engrais masqué.' : 'Engrais réactivé.'); load(); }
  function edit(r: FertProduct) { setF({ id: r.id, name: r.name, brand: r.brand || '', n: String(r.n_pct), p: String(r.p2o5_pct), k: String(r.k2o_pct), bag: String(r.bag_kg), verified: r.verified, source: r.source || '', notes: r.notes || '' }); setFiles([]); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  return <>
    <form className="tender" onSubmit={save}><div className="tendermain">
      <h3>{f.id ? 'Modifier un engrais' : 'Ajouter un engrais du commerce'}</h3>
      <p className="muted">Recopiez l’analyse imprimée sur le sac (ex. 20-10-10 = N 20 %, P₂O₅ 10 %, K₂O 10 %). Le comité n’a pas à l’homologuer : c’est la donnée du fabricant.</p>
      <label>Nom<input required maxLength={100} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <label>Marque / fournisseur (facultatif)<input maxLength={100} value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} /></label>
      <div className="gpsrow"><label>% N<input type="number" min="0" max="100" step="any" value={f.n} onChange={e => setF({ ...f, n: e.target.value })} /></label><label>% P₂O₅<input type="number" min="0" max="100" step="any" value={f.p} onChange={e => setF({ ...f, p: e.target.value })} /></label><label>% K₂O<input type="number" min="0" max="100" step="any" value={f.k} onChange={e => setF({ ...f, k: e.target.value })} /></label><label>Sac (kg)<input type="number" min="1" max="1000" step="any" value={f.bag} onChange={e => setF({ ...f, bag: e.target.value })} /></label></div>
      <label style={{ flexDirection: 'row', gap: 8 }}><input type="checkbox" checked={f.verified} onChange={e => setF({ ...f, verified: e.target.checked })} /> Analyse vérifiée sur l’étiquette du sac</label>
      <label>Source (facultatif)<input maxLength={300} value={f.source} onChange={e => setF({ ...f, source: e.target.value })} /></label>
      <label>Notes (facultatif)<input maxLength={1000} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
      <label>Photos de l’étiquette (1 à 3)<input type="file" accept="image/*" multiple onChange={e => setFiles(Array.from(e.target.files || []).slice(0, 3))} /></label>
      {files.length > 0 && <p className="muted">{files.length} photo(s) choisie(s).</p>}
    </div><button className="primary" disabled={busy}>{busy ? 'Enregistrement…' : f.id ? 'Enregistrer les modifications' : 'Ajouter'}</button>{f.id && <button type="button" onClick={() => { setF(empty); setFiles([]); }}>Annuler</button>}</form>
    {msg && <div className="notice">{msg}</div>}
    <div className="adminlist" style={{ marginTop: 12 }}>{rows.map(r => <div key={r.id} style={r.active ? undefined : { opacity: .55 }}><b>{r.name}{r.brand ? ` (${r.brand})` : ''}<br /><small className="muted">{fmtAnalysis(r)} • sac {r.bag_kg} kg • {r.verified ? 'analyse vérifiée' : 'à vérifier sur le sac'} • {r.label_photos.length} photo(s)</small>{r.label_photos.length > 0 && <><br />{r.label_photos.map(ph => <a key={ph} href={db.storage.from('product-labels').getPublicUrl(ph).data.publicUrl} target="_blank" rel="noreferrer noopener"><img alt="étiquette" src={db.storage.from('product-labels').getPublicUrl(ph).data.publicUrl} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, marginRight: 4 }} /></a>)}</>}</b><span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button type="button" onClick={() => edit(r)}>Modifier</button><button type="button" onClick={() => toggle(r)}>{r.active ? 'Masquer' : 'Réactiver'}</button></span></div>)}</div>
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

// ---------- Équipe du champ : inviter un ouvrier, lui assigner des tâches sur CE champ ----------
const taskStatusLabel: Record<string, string> = { pending: 'À faire', in_progress: 'En cours', completed: 'Terminée (à valider)', cancelled: 'Annulée' };
const prioLabel: Record<string, string> = { low: 'Basse', normal: 'Normale', high: 'Haute', urgent: 'Urgente' };
const taskPresets = ['Désherbage', 'Arrosage', 'Épandage d’engrais', 'Traitement phytosanitaire', 'Tuteurage / taille', 'Récolte', 'Surveillance du champ'];

const waPhone = (ph: string) => { const d = String(ph || '').replace(/\D/g, ''); return d.length === 9 ? '237' + d : d; };
function credMessage(name: string, login: string, password: string) {
  const id = login.endsWith('@ouvrier.agrivia.app') ? login.replace('ouvrier.', '').replace('@ouvrier.agrivia.app', '') : login;
  const url = typeof location !== 'undefined' ? location.origin : '';
  return `Bonjour ${name}, votre compte DulyAgrivia est prêt.\nSite : ${url}\nAppuyez sur « Se connecter » puis sur l’onglet « Ouvrier / employé ».\nIdentifiant : ${id}\nMot de passe provisoire : ${password}\nChangez-le dans Profil après votre première connexion.`;
}
function ShareCred({ cred }: { cred: { name: string; login: string; password: string; phone?: string } }) {
  const text = credMessage(cred.name, cred.login, cred.password);
  const ph = waPhone(cred.phone || '');
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
    {ph.length >= 8 && <a className="secondary" style={{ padding: '10px 14px', borderRadius: 12 }} target="_blank" rel="noopener noreferrer" href={`https://wa.me/${ph}?text=${encodeURIComponent(text)}`}>📲 Envoyer par WhatsApp</a>}
    {ph.length >= 8 && <a className="secondary" style={{ padding: '10px 14px', borderRadius: 12 }} href={`sms:+${ph}?&body=${encodeURIComponent(text)}`}>✉️ Envoyer par SMS</a>}
    <button type="button" className="secondary" onClick={copy}>{copied ? '✓ Copié' : '📋 Copier le message'}</button>
  </div>;
}

function TeamTab({ db, field }: { db: DB; field: any }) {
  const [invites, setInvites] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [inv, setInv] = useState({ name: '', phone: '' });
  const [t, setT] = useState({ title: taskPresets[0], wt: '', prod: '', rec: '', custom: '', desc: '', assigned: '', prio: 'normal', due: '' });
  const [wts, setWts] = useState<any[]>([]);
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const { inputs, reload: reloadInputs } = useFarmInputs(db, field.farm_id);
  const [nw, setNw] = useState({ name: '', phone: '', email: '' });
  const [fl, setFl] = useState({ from: '', to: '', worker: '', status: '' });
  const [cred, setCred] = useState<{ login: string; password: string; name: string; phone?: string; reset?: boolean } | null>(null);
  async function load() {
    const [i, w, k] = await Promise.all([
      db.from('worker_invites').select('*').eq('farm_id', field.farm_id).order('created_at', { ascending: false }),
      db.from('workers').select('*').eq('farm_id', field.farm_id),
      db.from('tasks').select('*').eq('field_id', field.id).order('created_at', { ascending: false }).limit(30),
    ]);
    setInvites(i.data || []); setWorkers(w.data || []); setTasks(k.data || []);
    const a = await db.from('work_types').select('*').eq('active', true).order('name');
    setWts(a.data || []); setLoading(false);
  }
  useEffect(() => { load(); }, [field.id]);
  const twt = wts.find(x => x.id === t.wt);
  async function createWorker(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(''); setCred(null);
    const { data, error } = await db.functions.invoke('create-worker', { body: { farm_id: field.farm_id, full_name: nw.name, phone: nw.phone, email: nw.email } });
    setBusy(false);
    if (error || !data?.ok) { let m = data?.error || 'Création impossible.'; try { const j = await (error as any)?.context?.json?.(); if (j?.error) m = j.error; } catch { /* ignore */ } setMsg(m); return; }
    setCred({ login: data.login, password: data.password, name: data.name, phone: nw.phone }); setNw({ name: '', phone: '', email: '' }); load();
  }
  const nameOf = (userId: string | null) => {
    if (!userId) return 'Non assignée';
    const i = invites.find(x => x.used_by === userId); const w = workers.find(x => x.user_id === userId);
    return (i && (i.full_name || i.phone)) || (w && w.phone) || 'Ouvrier';
  };
  const inviteName = (inviteId: string | null) => { const i = invites.find(x => x.id === inviteId); return i ? `${i.full_name || i.phone || i.code} (pas encore inscrit)` : 'Ouvrier invité'; };
  const taskWho = (k: any) => k.assigned_to ? nameOf(k.assigned_to) : k.assigned_invite ? inviteName(k.assigned_invite) : 'Non assignée';
  async function createInvite(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('');
    const { data: u } = await db.auth.getUser();
    if (!u?.user) { setBusy(false); setMsg('Session expirée : reconnectez-vous.'); return; }
    const code = Math.random().toString(36).slice(2, 6).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    const { error } = await db.from('worker_invites').insert({ code, farm_id: field.farm_id, full_name: inv.name.trim() || null, phone: inv.phone.trim() || null, created_by: u.user.id });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setInv({ name: '', phone: '' }); setMsg(`Code créé : ${code}. Donnez-le à l’ouvrier : il le saisit à son inscription pour être rattaché à votre exploitation.`); load();
  }
  async function addTask(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const title = (twt ? twt.name : t.title === '__autre' ? t.custom : t.title).trim();
    if (!title) { setMsg('Indiquez le nom de la tâche.'); return; }
    setBusy(true);
    const { error } = await db.from('tasks').insert({ farm_id: field.farm_id, field_id: field.id, assigned_to: t.assigned && !t.assigned.startsWith('inv:') ? t.assigned : null, assigned_invite: t.assigned && t.assigned.startsWith('inv:') ? t.assigned.slice(4) : null, title, description: t.desc.trim() || null, priority: t.prio, due_date: t.due || null, work_type_id: twt?.id || null, items: picked, recurrence_days: t.rec ? Number(t.rec) : null });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setT({ ...t, wt: '', prod: '', rec: '', custom: '', desc: '', due: '' }); setPicked([]); setMsg('Tâche créée.'); load();
  }
  async function resetPw(w: any) {
    if (!confirm(`Générer un nouveau mot de passe pour ${nameOf(w.user_id)} ? L’ancien ne fonctionnera plus.`)) return;
    setBusy(true); setMsg(''); setCred(null);
    const { data, error } = await db.functions.invoke('reset-worker-password', { body: { farm_id: field.farm_id, worker_user_id: w.user_id } });
    setBusy(false);
    if (error || !data?.ok) { let m = data?.error || 'Réinitialisation impossible.'; try { const j = await (error as any)?.context?.json?.(); if (j?.error) m = j.error; } catch { /* ignore */ } setMsg(m); return; }
    setCred({ login: data.login, password: data.password, name: nameOf(w.user_id), phone: w.phone || '', reset: true });
  }
  async function validate(id: string) {
    const { data: u } = await db.auth.getUser();
    const { error } = await db.from('tasks').update({ validated_at: new Date().toISOString(), validated_by: u?.user?.id || null }).eq('id', id);
    setMsg(error ? error.message : ''); load();
  }
  async function cancel(id: string) { const { error } = await db.from('tasks').update({ status: 'cancelled' }).eq('id', id); setMsg(error ? error.message : ''); load(); }
  if (loading) return <div className="loading">Chargement…</div>;
  return <>
    <h3>Ouvriers de cette exploitation ({workers.length})</h3>
    {workers.length ? <div className="adminlist">{workers.map(w => <div key={w.id}><b>{nameOf(w.user_id)}{w.phone ? <><br /><small className="muted">{w.phone}</small></> : null}</b><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span className="badge green">Rattaché</span><button type="button" className="secondary" disabled={busy} onClick={() => resetPw(w)}>🔑 Nouveau mot de passe</button></span></div>)}</div> : <div className="empty"><p>Aucun ouvrier rattaché pour le moment. Créez un code d’invitation ci-dessous.</p></div>}

    <h3 style={{ marginTop: 16 }}>Créer le compte d’un ouvrier</h3>
    <p className="muted">Vous créez vous-même le compte : l’ouvrier se connecte ensuite avec l’identifiant et le mot de passe que vous lui remettez.</p>
    <form className="tender" onSubmit={createWorker}><div className="tendermain">
      <label>Nom complet<input required maxLength={80} value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} /></label>
      <label>Téléphone<input inputMode="tel" value={nw.phone} onChange={e => setNw({ ...nw, phone: e.target.value })} placeholder="6xx xx xx xx" /></label>
      <label>E-mail (facultatif)<input type="email" value={nw.email} onChange={e => setNw({ ...nw, email: e.target.value })} /></label>
    </div><button className="primary wide" style={{ minHeight: 48 }} disabled={busy}>＋ Créer le compte</button></form>
    {cred && <div className="notice">✅ {cred.reset ? 'Nouveau mot de passe pour' : 'Compte créé pour'} <b>{cred.name}</b>.<br />Identifiant : <b>{cred.login.endsWith('@ouvrier.agrivia.app') ? cred.login.replace('ouvrier.', '').replace('@ouvrier.agrivia.app', '') + ' (son numéro de téléphone)' : cred.login}</b><br />Mot de passe provisoire : <b>{cred.password}</b><br /><small>Notez-le maintenant : il ne sera plus affiché. L’envoi n’est pas automatique : les boutons ci-dessous ouvrent WhatsApp ou vos SMS avec le message déjà écrit, vous n’avez plus qu’à appuyer sur « Envoyer ».</small><ShareCred cred={cred} /></div>}

    <h3 style={{ marginTop: 16 }}>Ou inviter par code (l’ouvrier s’inscrit lui-même)</h3>
    <form className="tender" onSubmit={createInvite}><div className="tendermain">
      <label>Nom de l’ouvrier<input value={inv.name} onChange={e => setInv({ ...inv, name: e.target.value })} placeholder="Ex : Jean Fotso" /></label>
      <label>Téléphone<input inputMode="tel" value={inv.phone} onChange={e => setInv({ ...inv, phone: e.target.value })} placeholder="Ex : 6xx xx xx xx" /></label>
    </div><button className="primary" disabled={busy}>Générer le code</button></form>
    {invites.filter(i => !i.used).length > 0 && <div className="adminlist" style={{ marginTop: 10 }}>{invites.filter(i => !i.used).map(i => <div key={i.id}><b>{i.code}{i.full_name ? ` — ${i.full_name}` : ''}</b><span className="badge">En attente d’inscription</span></div>)}</div>}

    <details style={{ marginTop: 16 }}><summary><b>Mes produits et matériel ({inputs.length})</b></summary><FarmInputsManager db={db} farmId={field.farm_id} inputs={inputs} reload={reloadInputs} /></details>

    <h3 style={{ marginTop: 16 }}>Assigner une tâche sur ce champ</h3>
    <form className="tender" onSubmit={addTask}><div className="tendermain">
      <label>Travail à faire<WorkTypeSelect types={wts} value={t.wt} onChange={id => { setT({ ...t, wt: id, prod: '' }); setPicked([]); }} /></label>
      <ItemsPicker inputs={inputs} wt={twt} picked={picked} setPicked={setPicked} />
      {(twt?.recurring_hint || twt?.product_family) && <label>À répéter tous les … jours (facultatif)<input type="number" min="1" max="365" value={t.rec} onChange={e => setT({ ...t, rec: e.target.value })} placeholder="ex. 7" /></label>}
      {!twt && <label>Ou autre tâche (texte libre)<select value={t.title} onChange={e => setT({ ...t, title: e.target.value })}>{taskPresets.map(p => <option key={p}>{p}</option>)}<option value="__autre">Autre…</option></select></label>}
      {!twt && t.title === '__autre' && <label>Nom de la tâche<input required value={t.custom} onChange={e => setT({ ...t, custom: e.target.value })} /></label>}
      <label>Assigner à<select value={t.assigned} onChange={e => setT({ ...t, assigned: e.target.value })}><option value="">— Pas encore assignée —</option>{workers.length > 0 && <optgroup label="Ouvriers inscrits">{workers.map(w => <option key={w.id} value={w.user_id}>{nameOf(w.user_id)}</option>)}</optgroup>}{invites.filter(i => !i.used).length > 0 && <optgroup label="Invités (pas encore inscrits)">{invites.filter(i => !i.used).map(i => <option key={i.id} value={'inv:' + i.id}>{(i.full_name || i.phone || i.code) + ' — code ' + i.code}</option>)}</optgroup>}</select></label>{workers.length === 0 && invites.filter(i => !i.used).length === 0 && <p className="muted">Créez d’abord un code d’invitation ci-dessus : vous pourrez ensuite assigner la tâche à l’ouvrier, même avant son inscription.</p>}{workers.length === 0 && invites.filter(i => !i.used).length > 0 && <p className="muted">Aucun ouvrier n’est encore inscrit. La tâche assignée à un invité lui sera transmise dès qu’il s’inscrira avec son code.</p>}
      <div className="gpsrow"><label>Priorité<select value={t.prio} onChange={e => setT({ ...t, prio: e.target.value })}>{Object.entries(prioLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>Échéance<input type="date" value={t.due} onChange={e => setT({ ...t, due: e.target.value })} /></label></div>
      <label>Consigne (facultatif)<input value={t.desc} onChange={e => setT({ ...t, desc: e.target.value })} placeholder="Ex : rangées 1 à 10, 20 g d’engrais par pied" /></label>
    </div><button className="primary wide" style={{ minHeight: 48 }} disabled={busy}>＋ Créer la tâche</button></form>
    {msg && <div className="notice">{msg}</div>}
    <h3 style={{ marginTop: 16 }}>Journal des tâches du champ</h3>
    <p className="muted">Qui a fait quoi, et quand. Quand l’ouvrier termine une tâche, vous la validez ici.</p>
    <div className="gpsrow"><label>Du<input type="date" value={fl.from} onChange={e => setFl({ ...fl, from: e.target.value })} /></label><label>Au<input type="date" value={fl.to} onChange={e => setFl({ ...fl, to: e.target.value })} /></label></div>
    <div className="gpsrow"><label>Ouvrier<select value={fl.worker} onChange={e => setFl({ ...fl, worker: e.target.value })}><option value="">Tous</option>{workers.map(w => <option key={w.id} value={w.user_id}>{nameOf(w.user_id)}</option>)}</select></label><label>État<select value={fl.status} onChange={e => setFl({ ...fl, status: e.target.value })}><option value="">Tous</option><option value="pending">À faire</option><option value="in_progress">En cours</option><option value="completed">Terminée à valider</option><option value="validated">Validée</option><option value="cancelled">Annulée</option></select></label></div>
    {(() => {
      const day = (k: any) => String(k.completed_at || k.created_at || '').slice(0, 10);
      const state = (k: any) => k.validated_at ? 'validated' : k.status;
      const list = tasks.filter(k => (!fl.from || day(k) >= fl.from) && (!fl.to || day(k) <= fl.to) && (!fl.worker || k.assigned_to === fl.worker) && (!fl.status || state(k) === fl.status));
      return list.length ? <div className="adminlist" style={{ marginTop: 8 }}>{list.map(k => <div key={k.id}><b>{k.title}<br /><small className="muted">{taskWho(k)}{k.due_date ? ` • échéance ${fmt(k.due_date)}` : ''} • {prioLabel[k.priority]}{Array.isArray(k.items) && k.items.length ? ` • ${itemsText(k.items)}` : ''}</small>{k.completed_at && <><br /><small className="muted">Terminée le {new Date(k.completed_at).toLocaleString('fr-FR')}{k.completion_note ? ` — « ${k.completion_note} »` : ''}</small></>}{k.validated_at && <><br /><small className="muted">Validée le {new Date(k.validated_at).toLocaleString('fr-FR')}</small></>}</b><span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><span className={'badge ' + (k.validated_at || k.status === 'completed' ? 'green' : '')}>{k.validated_at ? 'Validée ✓' : taskStatusLabel[k.status] || k.status}</span>{k.status === 'completed' && !k.validated_at && <button type="button" className="primary" onClick={() => validate(k.id)}>✓ Valider</button>}{(k.status === 'pending' || k.status === 'in_progress') && <button className="secondary" onClick={() => cancel(k.id)}>Annuler</button>}</span></div>)}</div> : <div className="empty"><p>Aucune tâche pour ces critères.</p></div>;
    })()}
  </>;
}

// ---------- Étape de culture (affichage des champs) : calculée à partir de la date de plantation et du cycle de la culture ----------
export function fieldStage(f: { planting_date: string | null; crops?: { cycle_days?: number } | null }): { label: string; tone: string; pct: number; day: number | null; total: number | null } {
  const total = f.crops?.cycle_days ? Number(f.crops.cycle_days) : null;
  if (!f.planting_date) return { label: 'DATE À RENSEIGNER', tone: '', pct: 0, day: null, total };
  const day = Math.floor((Date.now() - new Date(f.planting_date + 'T00:00:00').getTime()) / 86400000);
  if (day < 0) return { label: 'PLANTATION PRÉVUE', tone: '', pct: 0, day, total };
  if (!total) return { label: 'EN CULTURE', tone: 'green', pct: 0, day, total };
  const pct = Math.max(0, Math.min(100, Math.round((day / total) * 100)));
  if (day > total) return { label: 'CYCLE ÉCOULÉ', tone: 'danger', pct: 100, day, total };
  if (total - day <= 14) return { label: 'RÉCOLTE PROCHE', tone: 'danger', pct, day, total };
  return { label: 'EN CROISSANCE', tone: 'green', pct, day, total };
}
