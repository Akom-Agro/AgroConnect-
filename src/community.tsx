import React, { useEffect, useState } from 'react';

type DB = any;
type Sector = 'agriculture' | 'elevage';
type Prof = { id: string; role: string; plan: string; pro_expires_at: string | null; full_name: string | null };
const isAdminRole = (r?: string | null) => r === 'admin' || r === 'super_admin';
const proActive = (p: Prof) => p.plan === 'pro' && (!p.pro_expires_at || new Date(p.pro_expires_at) > new Date());
const fmt = (d: string | null) => (d ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d.length === 10 ? d + 'T00:00:00' : d)) : '—');
const kindLabel: Record<string, string> = { conseil: '💡 Conseil', question: '❓ Question', information: 'ℹ️ Information' };

export function Cooperative({ db, profile, sector, setToast }: { db: DB; profile: Prof; sector: Sector; setToast: (s: string) => void }) {
  const [tab, setTab] = useState<'offres' | 'echanges'>('offres');
  return <>
    <div className="pageintro"><div><span className="eyebrow">ENTRAIDE</span><h1>Coopérative</h1><p>Regroupez vos volumes pour vendre ensemble, et échangez conseils et questions avec les autres producteurs.</p></div></div>
    <div className="toolstabs">
      <button className={tab === 'offres' ? 'selected' : ''} onClick={() => setTab('offres')}>Ventes groupées</button>
      <button className={tab === 'echanges' ? 'selected' : ''} onClick={() => setTab('echanges')}>Échanges</button>
    </div>
    {tab === 'offres' ? <CoopOffers db={db} profile={profile} sector={sector} setToast={setToast} /> : <CoopPosts db={db} profile={profile} sector={sector} setToast={setToast} />}
  </>;
}

// ---------- Ventes groupées ----------
function CoopOffers({ db, profile, sector, setToast }: { db: DB; profile: Prof; sector: Sector; setToast: (s: string) => void }) {
  const [offers, setOffers] = useState<any[]>([]);
  const [totals, setTotals] = useState<Record<string, { kg: number; n: number }>>({});
  const [farms, setFarms] = useState<any[]>([]);
  const [mine, setMine] = useState<Record<string, number>>({});
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ farm: '', item: '', target: '', price: '', date: '', terms: '' });
  const [commit, setCommit] = useState<{ offer: string; farm: string; volume: string } | null>(null);
  const canCreate = isAdminRole(profile.role) || (profile.role === 'producteur' && proActive(profile));
  const canCommit = profile.role === 'producteur' || isAdminRole(profile.role);

  async function load() {
    const [o, t, fa, it] = await Promise.all([
      db.from('cooperative_offers').select('*, crops(name), livestock_types(name)').order('created_at', { ascending: false }),
      db.rpc('coop_offer_totals'),
      db.from('farms').select('id,name,owner_id').eq('owner_id', profile.id).order('created_at'),
      sector === 'agriculture' ? db.from('crops').select('id,name').eq('active', true).order('name') : db.from('livestock_types').select('id,name').eq('active', true).order('name'),
    ]);
    setOffers(((o.data || []) as any[]).filter(x => (sector === 'agriculture' ? !!x.crop_id : !!x.livestock_type_id)));
    const tt: Record<string, { kg: number; n: number }> = {};
    ((t.data || []) as any[]).forEach(r => { tt[r.offer_id] = { kg: Number(r.committed_kg) || 0, n: Number(r.producers) || 0 }; });
    setTotals(tt);
    const myFarms = (fa.data || []) as any[];
    setFarms(myFarms);
    setItems((it.data || []) as any[]);
    if (myFarms.length) {
      const c = await db.from('commitments').select('offer_id,volume_kg,status').in('farm_id', myFarms.map(x => x.id));
      const m: Record<string, number> = {};
      ((c.data || []) as any[]).filter(x => x.status === 'actif').forEach(x => { m[x.offer_id] = (m[x.offer_id] || 0) + Number(x.volume_kg || 0); });
      setMine(m);
    } else setMine({});
    setLoading(false);
  }
  useEffect(() => { load(); }, [profile.id, sector]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const target = Number(f.target), price = f.price ? Number(f.price) : null;
    if (!f.farm || !f.item) { setToast('Choisissez une exploitation et un produit.'); return; }
    if (!(target > 0)) { setToast('Le volume cible doit être positif.'); return; }
    if (price !== null && !(price >= 0)) { setToast('Prix invalide.'); return; }
    setBusy(true);
    const payload: any = { farm_id: f.farm, target_volume_kg: target, price_per_kg: price, harvest_date: f.date || null, payment_terms: f.terms.trim() || null, status: 'ouvert' };
    if (sector === 'agriculture') payload.crop_id = f.item; else payload.livestock_type_id = f.item;
    const { error } = await db.from('cooperative_offers').insert(payload);
    setBusy(false);
    if (error) setToast(error.message); else { setToast('Offre groupée créée.'); setOpen(false); setF({ farm: '', item: '', target: '', price: '', date: '', terms: '' }); load(); }
  }
  async function sendCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!commit || busy) return;
    const v = Number(commit.volume);
    if (!commit.farm) { setToast('Choisissez une exploitation.'); return; }
    if (!(v > 0)) { setToast('Le volume doit être positif.'); return; }
    setBusy(true);
    const { error } = await db.from('commitments').insert({ offer_id: commit.offer, farm_id: commit.farm, volume_kg: v, status: 'actif' });
    setBusy(false);
    if (error) setToast(error.message); else { setToast('Engagement enregistré. Aucun paiement n’est effectué par l’application.'); setCommit(null); load(); }
  }
  async function cancelMine(offerId: string) {
    if (!window.confirm('Retirer votre engagement sur cette offre ?')) return;
    const { error } = await db.from('commitments').delete().eq('offer_id', offerId).in('farm_id', farms.map(x => x.id));
    setToast(error ? error.message : 'Engagement retiré.'); load();
  }
  async function closeOffer(id: string, status: 'validé' | 'annulé') {
    const { error } = await db.from('cooperative_offers').update({ status }).eq('id', id);
    setToast(error ? error.message : status === 'validé' ? 'Offre validée.' : 'Offre annulée.'); load();
  }
  const ownsOffer = (o: any) => farms.some(x => x.id === o.farm_id);

  if (loading) return <div className="loading">Chargement…</div>;
  return <>
    {canCreate ? <div className="quick" style={{ margin: '12px 0' }}><button className="primary" onClick={() => setOpen(true)} disabled={!farms.length}>＋ Créer une offre groupée</button>{!farms.length && <small className="muted">Créez d’abord une exploitation dans « Ma ferme ».</small>}</div>
      : <p className="muted">La création d’une offre groupée est réservée aux producteurs PRO. Vous pouvez vous engager sur les offres ouvertes.</p>}
    {offers.length ? <div className="tenderlist">{offers.map(o => {
      const label = o.crops?.name || o.livestock_types?.name || '—';
      const t = totals[o.id] || { kg: 0, n: 0 };
      const target = Number(o.target_volume_kg) || 0;
      const pct = target > 0 ? Math.min(100, Math.round((t.kg / target) * 100)) : 0;
      return <div className="tender" key={o.id}><div className="cropicon">🤝</div><div className="tendermain">
        <span className={'badge ' + (o.status === 'ouvert' ? 'green' : '')}>{o.status === 'ouvert' ? 'OUVERTE' : o.status.toUpperCase()}</span>{o.is_demo && <span className="badge"> DÉMO</span>}
        <h3>{label} • objectif {target.toLocaleString('fr-FR')} kg</h3>
        <p>{o.price_per_kg ? `${Number(o.price_per_kg).toLocaleString('fr-FR')} FCFA/kg • ` : ''}{o.payment_terms || 'Conditions à préciser'}{o.harvest_date ? ` • récolte ${fmt(o.harvest_date)}` : ''}</p>
        <div style={{ background: 'var(--line)', borderRadius: 8, height: 10, overflow: 'hidden', margin: '8px 0 4px' }}><div style={{ width: pct + '%', height: '100%', background: 'var(--green2)' }} /></div>
        <small className="muted">{t.kg.toLocaleString('fr-FR')} kg engagés sur {target.toLocaleString('fr-FR')} kg ({pct} %) • {t.n} engagement(s){mine[o.id] ? ` • dont vous : ${mine[o.id].toLocaleString('fr-FR')} kg` : ''}</small>
        <div className="quick" style={{ marginTop: 8 }}>
          {o.status === 'ouvert' && canCommit && farms.length > 0 && <button className="secondary" onClick={() => setCommit({ offer: o.id, farm: farms[0].id, volume: '' })}>S’engager</button>}
          {mine[o.id] > 0 && o.status === 'ouvert' && <button className="secondary" onClick={() => cancelMine(o.id)}>Retirer mon engagement</button>}
          {(ownsOffer(o) || isAdminRole(profile.role)) && o.status === 'ouvert' && <><button className="secondary" onClick={() => closeOffer(o.id, 'validé')}>Valider l’offre</button><button className="secondary" onClick={() => closeOffer(o.id, 'annulé')}>Annuler</button></>}
        </div>
      </div></div>;
    })}</div> : <div className="empty"><p>Aucune vente groupée pour le moment.</p></div>}
    <p className="muted">Aucune transaction financière n’est effectuée par l’application : un engagement est une promesse de volume entre producteurs.</p>

    {open && <div className="modal"><form className="modalcard" onSubmit={create}><div className="sectionhead"><h2>Créer une offre groupée</h2><button type="button" onClick={() => setOpen(false)}>✕</button></div>
      <label>Exploitation<select required value={f.farm} onChange={e => setF({ ...f, farm: e.target.value })}><option value="">Choisir…</option>{farms.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>{sector === 'agriculture' ? 'Culture' : 'Espèce'}<select required value={f.item} onChange={e => setF({ ...f, item: e.target.value })}><option value="">Choisir…</option>{items.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>Volume cible (kg)<input type="number" min="1" required value={f.target} onChange={e => setF({ ...f, target: e.target.value })} /></label>
      <label>Prix proposé (FCFA/kg)<input type="number" min="0" step="any" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
      <label>Date souhaitée<input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
      <label>Conditions<input maxLength={300} value={f.terms} onChange={e => setF({ ...f, terms: e.target.value })} /></label>
      <button className="primary wide" disabled={busy}>{busy ? 'Création…' : 'Publier l’offre groupée'}</button></form></div>}
    {commit && <div className="modal"><form className="modalcard" onSubmit={sendCommit}><div className="sectionhead"><h2>M’engager sur cette offre</h2><button type="button" onClick={() => setCommit(null)}>✕</button></div>
      <label>Exploitation<select value={commit.farm} onChange={e => setCommit({ ...commit, farm: e.target.value })}>{farms.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>Volume que je m’engage à fournir (kg)<input type="number" min="1" required value={commit.volume} onChange={e => setCommit({ ...commit, volume: e.target.value })} /></label>
      <button className="primary wide" disabled={busy}>{busy ? 'Envoi…' : 'Confirmer mon engagement'}</button></form></div>}
  </>;
}

// ---------- Échanges entre producteurs ----------
function CoopPosts({ db, profile, sector, setToast }: { db: DB; profile: Prof; sector: Sector; setToast: (s: string) => void }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [replies, setReplies] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [kind, setKind] = useState('tous');
  const [form, setForm] = useState({ kind: 'question', title: '', body: '' });
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const canWrite = profile.role === 'producteur' || isAdminRole(profile.role);

  async function load() {
    const { data } = await db.from('coop_posts').select('*').eq('sector', sector).order('created_at', { ascending: false }).limit(60);
    const list = (data || []) as any[];
    setPosts(list);
    if (list.length) {
      const r = await db.from('coop_replies').select('*').in('post_id', list.map(x => x.id)).order('created_at');
      const g: Record<string, any[]> = {};
      ((r.data || []) as any[]).forEach(x => { (g[x.post_id] = g[x.post_id] || []).push(x); });
      setReplies(g);
    } else setReplies({});
    setLoading(false);
  }
  useEffect(() => { setLoading(true); load(); }, [sector]);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const title = form.title.trim(), body = form.body.trim();
    if (title.length < 3 || body.length < 3) { setToast('Titre et message trop courts.'); return; }
    setBusy(true);
    const { error } = await db.from('coop_posts').insert({ sector, kind: form.kind, title, body });
    setBusy(false);
    if (error) setToast(error.message); else { setToast('Message publié.'); setForm({ kind: 'question', title: '', body: '' }); load(); }
  }
  async function sendReply(postId: string) {
    const body = reply.trim();
    if (!body || busy) return;
    setBusy(true);
    const { error } = await db.from('coop_replies').insert({ post_id: postId, body });
    setBusy(false);
    if (error) setToast(error.message); else { setReply(''); load(); }
  }
  async function del(table: 'coop_posts' | 'coop_replies', id: string) {
    if (!window.confirm('Supprimer ce message ?')) return;
    const { error } = await db.from(table).delete().eq('id', id);
    setToast(error ? error.message : 'Message supprimé.'); load();
  }
  const shown = posts.filter(p => kind === 'tous' || p.kind === kind);
  return <>
    {canWrite ? <form className="tender" style={{ marginTop: 12 }} onSubmit={publish}><div className="tendermain">
      <h3>Poser une question ou partager un conseil</h3>
      <label>Type<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{Object.entries(kindLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Titre<input required maxLength={120} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
      <label>Message<textarea required maxLength={2000} rows={3} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></label>
      <p className="muted">Les conseils échangés ici viennent d’autres producteurs : ce ne sont pas des recommandations validées par le comité technique.</p>
    </div><button className="primary" disabled={busy}>Publier</button></form> : <p className="muted">Seuls les producteurs peuvent écrire ici ; vous pouvez lire les échanges.</p>}
    <div className="toolstabs">{['tous', 'question', 'conseil', 'information'].map(k => <button key={k} className={kind === k ? 'selected' : ''} onClick={() => setKind(k)}>{k === 'tous' ? 'Tous' : kindLabel[k]}</button>)}</div>
    {loading ? <div className="loading">Chargement…</div> : shown.length ? <div className="tenderlist">{shown.map(p => {
      const rs = replies[p.id] || [];
      const isOpen = openId === p.id;
      return <div className="tender" key={p.id}><div className="tendermain">
        <span className="badge green">{kindLabel[p.kind] || p.kind}</span>{p.is_demo && <span className="badge"> DÉMO</span>}
        <h3>{p.title}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{p.body}</p>
        <small className="muted">{p.author_name || 'Producteur'} • {fmt(p.created_at)} • {rs.length} réponse(s)</small>
        <div className="quick" style={{ marginTop: 6 }}><button className="secondary" onClick={() => { setOpenId(isOpen ? null : p.id); setReply(''); }}>{isOpen ? 'Masquer' : 'Voir / répondre'}</button>{(p.author_id === profile.id || isAdminRole(profile.role)) && <button className="secondary" onClick={() => del('coop_posts', p.id)}>Supprimer</button>}</div>
        {isOpen && <div style={{ marginTop: 8 }}>
          {rs.map(r => <div key={r.id} className="notif"><span className="notificon">💬</span><div><b>{r.author_name || 'Producteur'}</b>{r.is_demo && <span className="badge"> DÉMO</span>}<p>{r.body}</p><small className="muted">{fmt(r.created_at)}</small>{(r.author_id === profile.id || isAdminRole(profile.role)) && <> <button className="linkbtn" onClick={() => del('coop_replies', r.id)}>Supprimer</button></>}</div></div>)}
          {canWrite && <div className="gpsrow"><label style={{ flex: 1 }}>Votre réponse<input maxLength={1000} value={reply} onChange={e => setReply(e.target.value)} /></label><button className="primary" disabled={busy || !reply.trim()} onClick={() => sendReply(p.id)}>Envoyer</button></div>}
        </div>}
      </div></div>;
    })}</div> : <div className="empty"><p>Aucun message pour le moment.</p></div>}
  </>;
}
