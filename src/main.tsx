import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, type Session, type User } from '@supabase/supabase-js';
import './styles.css';
import { FieldTools, CommitteePanel, fieldStage } from './farmtools';
import { Cooperative } from './community';
import { FieldMap } from './fieldmap';
import { MIN_PHOTOS, MAX_PHOTOS, photoUrl, uploadListingPhotos, loadPhotosByListing, compressImage } from './photos';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

type Role = 'producteur' | 'acheteur' | 'ouvrier' | 'admin' | 'super_admin';
const isAdminRole=(r?:Role|null)=>r==='admin'||r==='super_admin';
type Sector = 'agriculture' | 'elevage';
type Screen = 'home'|'farm'|'field'|'herds'|'herd'|'market'|'tenders'|'map'|'ai'|'financement'|'intrants'|'tasks'|'team'|'notifications'|'profile'|'admin'|'pro'|'sales'|'committee'|'coop';
// Écrans qui n'ont de sens que dans un seul secteur : on redirige vers l'accueil si on change de secteur dessus.
const sectorOnlyScreens: Screen[] = ['field','herd'];

type Plan = 'gratuit'|'pro';
type Profile = { id:string; full_name:string|null; phone:string|null; role:Role; country:string|null; plan:Plan; pro_expires_at:string|null; referral_code:string|null };
type PricingConfig = { region:string; monthly_amount:number; annual_amount:number; currency:string; monthly_amount_intl:number; annual_amount_intl:number; currency_intl:string };
type CommissionConfig = { rate_percent:number };
type Sale = { id:string; seller_id:string; buyer_id:string|null; crop_id:string|null; livestock_type_id:string|null; volume_kg:number; gross_amount:number; commission_rate_applied:number; commission_amount:number; net_amount:number; currency:string; status:string; created_at:string; crops?:Crop|null; livestock_types?:LivestockType|null };
// Un compte est PRO uniquement si le plan est 'pro' ET (pas d'expiration, ou expiration future).
// Reflète côté client la même logique que la fonction serveur is_pro() : l'accès réel est toujours
// tranché par les policies RLS, ceci ne sert qu'à adapter l'affichage.
const isProActive=(p?:Profile|null)=>!!p && p.plan==='pro' && (!p.pro_expires_at || new Date(p.pro_expires_at)>new Date());
type ReferencePrice = { id:string; crop_id:string|null; livestock_type_id:string|null; price_per_kg:number; currency:string };
type ListingStatus = 'disponible_maintenant'|'prochainement'|'programmee'|'appel_offres';
type MarketListing = { id:string; seller_id:string; farm_id:string|null; crop_id:string|null; livestock_type_id:string|null; volume_kg:number; price_per_kg:number; currency:string; status:ListingStatus; available_from:string|null; note:string|null; created_at:string; product_name?:string|null; sale_unit?:string|null; units_available?:number|null; unit_weight_kg?:number|null; crops?:Crop|null; livestock_types?:LivestockType|null };
const listingStatusLabel:Record<ListingStatus,string>={disponible_maintenant:'Disponible maintenant',prochainement:'Prochainement',programmee:'Vente programmée',appel_offres:'Appel d’offres'};
type ReferralRow = { id:string; referred_user_id:string; referred_signup_at:string; pro_conversion_at:string|null; commission_amount:number|null; currency:string|null; status:'pending'|'approved'|'paid'|'cancelled' };
const referralStatusLabel:Record<string,string>={pending:'En attente',approved:'Validée',paid:'Payée',cancelled:'Annulée'};
type Crop = { id:string; name:string; icon:string|null; cycle_days:number };
type LivestockType = { id:string; name:string; icon:string|null; cycle_days:number };
type Farm = { id:string; name:string; area_ha:number; region:string|null };
type Field = { id:string; farm_id:string; crop_id:string|null; name:string; area_ha:number; planting_date:string|null; latitude:number|null; longitude:number|null; boundary:{lat:number;lng:number}[]|null; boundary_area_ha:number|null; crops?:Crop|null };
type Herd = { id:string; farm_id:string; livestock_type_id:string|null; name:string; headcount:number; region:string|null; livestock_types?:LivestockType|null };
type HealthRecord = { id:string; herd_id:string; record_date:string; type:string; note:string|null; urgency:string };
type Forecast = { id:string; field_id:string; estimated_date:string|null; estimated_volume_kg:number|null; status:string };
type Tender = { id:string; buyer_id:string; crop_id:string|null; livestock_type_id:string|null; volume_kg:number; delivery_from:string|null; delivery_to:string|null; tolerance_days:number; price_note:string|null; delivery_zone:string|null; status:string; description?:string|null; preferred_unit?:string|null; crops?:Crop|null; livestock_types?:LivestockType|null };
type TenderResponse = { id:string; tender_id:string; producer_id:string; field_id:string|null; herd_id:string|null; offered_volume_kg:number; estimated_harvest_date:string|null; note:string|null; status:string; fields?:{name:string}|null; herds?:{name:string}|null; profiles?:{full_name:string|null}|null };
type Notification = { id:string; title:string; body:string|null; type:string; read_at:string|null; created_at:string };
type InputProduct = { id:string; sector:Sector; category:string; name:string; supplier_name:string|null; price_note:string|null; region:string|null; description:string|null; price_fcfa?:number|null; sale_unit?:string|null; photo_paths?:string[]|null; is_demo?:boolean };
type FundingProgram = { id:string; name:string; organization:string; sector:'agriculture'|'elevage'|'both'; region:string|null; description:string|null; contact_url:string|null };
type Task = { id:string; farm_id:string; field_id:string|null; herd_id:string|null; assigned_to:string|null; title:string; description:string|null; priority:string; status:string; due_date:string|null };
type WorkerInvite = { id:string; code:string; farm_id:string; full_name:string|null; phone:string|null; used:boolean; used_by:string|null; created_at:string; used_at:string|null };

const cropEmoji:Record<string,string>={Tomate:'🍅',Maïs:'🌽',Pastèque:'🍉',Légumes:'🥬',Plantain:'🍌',Avocat:'🥑',Café:'☕',Cacao:'🍫'};
const livestockEmoji:Record<string,string>={Bovins:'🐄',Volaille:'🐔',Caprins:'🐐',Porcins:'🐖',Aquaculture:'🐟',Ovins:'🐑'};
const fmtDate=(d:string|null)=>d?new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short'}).format(new Date(d+'T00:00:00')):'—';

const SALE_UNITS=['kg','tonne','sac','cageot','carton','fût','litre','pièce','régime','botte'];
const unitSummary=(l:any)=>{const u=l.sale_unit||'kg';const n=Number(l.units_available);const kg=Number(l.volume_kg);const f=(x:number)=>x.toLocaleString('fr-FR');if(u==='kg'||!n)return `${f(kg)} kg`;if(u==='tonne')return `${f(n)} tonne(s) (${f(kg)} kg)`;const w=Number(l.unit_weight_kg);return `${f(n)} ${u}(s)${w?` de ${f(w)} kg`:''} (≈ ${f(kg)} kg)`};
const pricePerUnit=(l:any):number|null=>{const u=l.sale_unit||'kg';if(u==='kg')return null;const w=u==='tonne'?1000:Number(l.unit_weight_kg);return w>0?Math.round(Number(l.price_per_kg)*w):null};
function InputCard({p,action,actionText}:{p:any;action?:()=>void;actionText?:string}){
 const ph=(p.photo_paths||[])[0];const url=ph&&supabase?supabase.storage.from('product-labels').getPublicUrl(ph).data.publicUrl:null;
 return <div className="marketcard"><div className="marketvisual">{url?<img className="marketphoto" src={url} alt={p.name} loading="lazy"/>:'📦'}<span className="badge green">{p.category}</span></div><div className="marketbody"><span className="eyebrow">{p.supplier_name||'Fournisseur'}{p.is_demo?' • DÉMO':''}</span><h2>{p.name}</h2>{p.description&&<p>{p.description}</p>}<p><b>{p.price_fcfa!=null?`${Number(p.price_fcfa).toLocaleString('fr-FR')} FCFA${p.sale_unit?` / ${p.sale_unit}`:''}`:(p.price_note||'Prix sur demande')}</b></p>{p.price_fcfa!=null&&p.price_note&&<p className="muted">{p.price_note}</p>}<div className="row muted"><span>📍 {p.region||'Zone non définie'}</span></div>{action&&<button className="secondary" onClick={action}>{actionText||'Contacter'}</button>}</div></div>;
}
// Liens saisis par un administrateur : seuls http(s) sont acceptés (bloque javascript: et data:).
const safeUrl=(u:string|null|undefined)=>{try{const x=new URL(String(u||''));return x.protocol==='https:'||x.protocol==='http:'?x.toString():'#'}catch{return '#'}};
const daysBetween=(a:Date,b:Date)=>Math.ceil((b.getTime()-a.getTime())/86400000);

function App(){
 const [session,setSession]=useState<Session|null>(null);
 const [profile,setProfile]=useState<Profile|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [recovery,setRecovery]=useState(false);
 // Navigation mémorisée : sur Android, l'appli Appareil photo peut recharger la page ; on revient alors au même écran et au même champ.
 const savedNav=useMemo<any>(()=>{try{const raw=sessionStorage.getItem('duly_nav');return raw?JSON.parse(raw):{}}catch{return {}}},[]);
 const [screen,setScreen]=useState<Screen>(()=>(typeof savedNav.screen==='string'?savedNav.screen:'home') as Screen);
 const [sector,setSector]=useState<Sector>(savedNav.sector==='elevage'?'elevage':'agriculture');
 const [selectedField,setSelectedField]=useState<string|null>(typeof savedNav.field==='string'?savedNav.field:null);
 const [selectedHerd,setSelectedHerd]=useState<string|null>(typeof savedNav.herd==='string'?savedNav.herd:null);
 useEffect(()=>{try{sessionStorage.setItem('duly_nav',JSON.stringify({screen,sector,field:selectedField,herd:selectedHerd}))}catch{}},[screen,sector,selectedField,selectedHerd]);
 const [toast,setToast]=useState('');
 // Portail Super Administrateur : accessible uniquement via ?admin, jamais depuis le parcours public.
 const adminMode=useMemo(()=>new URLSearchParams(window.location.search).has('admin'),[]);

 useEffect(()=>{
   if(!supabase){setLoading(false);return;}
   supabase.auth.getSession().then(({data})=>{setSession(data.session); if(!data.session) setLoading(false);});
   const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{
     if(event==='PASSWORD_RECOVERY')setRecovery(true);
     setSession(s);
   });
   return ()=>subscription.unsubscribe();
 },[]);
 useEffect(()=>{ if(session?.user) loadProfile(session.user); else setProfile(null); },[session]);
 async function loadProfile(user:User){
   if(!supabase)return;
   const {data,error}=await supabase.from('profiles').select('*').eq('id',user.id).single();
   if(error){setError(error.message);setLoading(false);return;}
   setProfile(data as Profile);setLoading(false);
 }
 async function signOut(){await supabase?.auth.signOut();setScreen('home');setSelectedField(null);setSelectedHerd(null);try{sessionStorage.removeItem('duly_nav')}catch{}}
 // Change de secteur : on quitte tout écran qui n'a de sens que dans l'autre secteur.
 function changeSector(s:Sector){setSector(s);setScreen(cur=>sectorOnlyScreens.includes(cur)?'home':cur)}
 if(!supabase) return <ConfigScreen/>;
 if(loading) return <Splash/>;
 if(recovery) return <UpdatePassword onDone={()=>{setRecovery(false);signOut();}}/>;
 if(adminMode){
   if(!session) return <AdminLogin/>;
   if(!profile || !isAdminRole(profile.role)) return <AdminDenied error={error} signOut={signOut}/>;
   return <Shell profile={profile} session={session} screen={screen} setScreen={setScreen} sector={sector} setSector={changeSector} selectedField={selectedField} setSelectedField={setSelectedField} selectedHerd={selectedHerd} setSelectedHerd={setSelectedHerd} toast={toast} setToast={setToast} signOut={signOut}/>;
 }
 if(!session) return <PublicGate/>;
 if(!profile) return <div className="authpage"><div className="authcard"><div className="logoMark">D</div><h1>Connexion impossible</h1><p>Votre compte a bien été authentifié, mais son profil DulyAgrivia n’a pas pu être chargé.{error?` (${error})`:''} Veuillez contacter l’administrateur.</p><button className="secondary wide" onClick={signOut}>Se déconnecter</button></div></div>;
 return <Shell profile={profile} session={session} screen={screen} setScreen={setScreen} sector={sector} setSector={changeSector} selectedField={selectedField} setSelectedField={setSelectedField} selectedHerd={selectedHerd} setSelectedHerd={setSelectedHerd} toast={toast} setToast={setToast} signOut={signOut}/>;
}

function Splash(){return <div className="splash"><div className="logoMark">D</div><h1>DulyAgrivia</h1><p>L’agriculture et l’élevage connectés au marché.</p></div>}
function ConfigScreen(){return <div className="authpage"><div className="authcard"><div className="logoMark">D</div><h1>DulyAgrivia</h1><h2>Configuration requise</h2><p>Ajoutez <b>VITE_SUPABASE_URL</b> et <b>VITE_SUPABASE_ANON_KEY</b> dans les variables d’environnement avant de lancer la version de production.</p><code>.env.local</code><div className="notice">Aucune donnée de démonstration n’est utilisée en production.</div></div></div>}

function Auth({onDone,initialMode}:{onDone:()=>void;initialMode?:'login'|'signup'}){
 const [mode,setMode]=useState<'login'|'signup'|'forgot'|'invite'>(initialMode||'login'); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [name,setName]=useState(''); const [role,setRole]=useState<'producteur'|'acheteur'>('producteur'); const [phone,setPhone]=useState(''); const [inviteCode,setInviteCode]=useState(''); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setMsg('');
  if(!supabase)return;
  // Le rôle choisi ici n'est qu'une indication côté client : la table profiles est
  // remplie par le trigger serveur handle_new_user(), qui rejette toute valeur hors
  // producteur/acheteur (et ouvrier via code d'invitation, voir docs/supabase_schema.sql).
  // Le formulaire ne propose jamais "admin"/"super_admin" comme option.
  if(mode==='login'){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setMsg(error.message);}
  else if(mode==='forgot'){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});setMsg(error?error.message:'Si cette adresse est connue, un lien de réinitialisation vient de lui être envoyé.');}
  else if(mode==='invite'){const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name,phone,invite_code:inviteCode.trim()}}});if(error)setMsg(error.message);else if(!data.session)setMsg('Compte créé. Vérifiez votre e-mail si la confirmation est activée.');}
  else {const refCode=new URLSearchParams(window.location.search).get('ref')||undefined;const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name,phone,role,referral_code:refCode}}});if(error)setMsg(error.message);else if(!data.session)setMsg('Compte créé. Vérifiez votre e-mail si la confirmation est activée.');}
  setBusy(false);onDone();
 }
 return <div className="authpage"><div className="authvisual"><div className="logoMark">D</div><span>DULYAGRIVIA • VIP</span><h1>Votre exploitation.<br/><em>Votre marché.</em></h1><p>Cultures et cheptel, prévisions, financement et intrants dans une seule plateforme.</p></div><form className="authcard" onSubmit={submit}><div className="authbrand"><div className="logoMark">D</div><b>DulyAgrivia</b></div>{mode!=='forgot'&&mode!=='invite'&&<div className="tabs"><button type="button" className={mode==='login'?'selected':''} onClick={()=>setMode('login')}>Connexion</button><button type="button" className={mode==='signup'?'selected':''} onClick={()=>setMode('signup')}>Créer un compte</button></div>}
  {mode==='signup'&&<><label>Nom complet<input value={name} onChange={e=>setName(e.target.value)} required /></label><label>Téléphone<input value={phone} onChange={e=>setPhone(e.target.value)} /></label><label>Je suis<select value={role} onChange={e=>setRole(e.target.value as 'producteur'|'acheteur')}><option value="producteur">Producteur</option><option value="acheteur">Acheteur</option></select></label></>}
  {mode==='invite'&&<><h2>Rejoindre une exploitation</h2><label>Code d’invitation<input value={inviteCode} onChange={e=>setInviteCode(e.target.value)} required /></label><label>Nom complet<input value={name} onChange={e=>setName(e.target.value)} required /></label><label>Téléphone<input value={phone} onChange={e=>setPhone(e.target.value)} /></label></>}
  {mode==='forgot'&&<h2>Mot de passe oublié</h2>}
  {(mode==='login'||mode==='signup'||mode==='invite')&&<label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>}
  {mode==='forgot'&&<label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>}
  {mode!=='forgot'&&<label>Mot de passe<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required /></label>}
  {msg&&<div className="notice">{msg}</div>}
  <button type="button" onClick={submit} className="primary wide" disabled={busy}>{busy?'Patientez…':mode==='login'?'Se connecter':mode==='forgot'?'Envoyer le lien':mode==='invite'?'Rejoindre':'Créer mon compte'}</button>
  <div className="authlinks">{mode==='login'&&<button type="button" className="linkbtn" onClick={()=>{setMode('forgot');setMsg('')}}>Mot de passe oublié ?</button>}{mode==='login'&&<button type="button" className="linkbtn" onClick={()=>{setMode('invite');setMsg('')}}>J’ai un code d’invitation Ouvrier</button>}{(mode==='forgot'||mode==='invite')&&<button type="button" className="linkbtn" onClick={()=>{setMode('login');setMsg('')}}>← Retour à la connexion</button>}</div>
  <small>Vos données sont protégées par l’authentification et les règles d’accès de la plateforme.</small></form></div>
}

function PublicGate(){
 const [showAuth,setShowAuth]=useState<false|'login'|'signup'>(false);
 const [sector,setSector]=useState<Sector>('agriculture');
 const [tenders,setTenders]=useState<Tender[]>([]);
 const [listings,setListings]=useState<MarketListing[]>([]);
 const [photos,setPhotos]=useState<Record<string,string[]>>({});
 const [refPrices,setRefPrices]=useState<ReferencePrice[]>([]);
 const [inputs,setInputs]=useState<InputProduct[]>([]);const [coops,setCoops]=useState<any[]>([]);const [coopTot,setCoopTot]=useState<Record<string,{kg:number;n:number}>>({});const [funds,setFunds]=useState<any[]>([]);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{(async()=>{
   if(!supabase){setLoading(false);return}
   const [t,l,r]=await Promise.all([
    supabase.from('tenders').select('*, crops(*), livestock_types(*)').eq('status','open').order('created_at',{ascending:false}).limit(12),
    supabase.from('market_listings').select('*, crops(*), livestock_types(*)').eq('active',true).order('created_at',{ascending:false}).limit(24),
    supabase.from('reference_prices').select('*')
   ]);
   setTenders((t.data||[]) as Tender[]);setListings((l.data||[]) as MarketListing[]);setRefPrices((r.data||[]) as ReferencePrice[]);
   // Contenu public supplémentaire (échec silencieux : la vitrine reste affichable)
   try{const [ip,co,ct,fp]=await Promise.all([supabase.from('input_products').select('*').eq('active',true).order('created_at',{ascending:false}).limit(24),supabase.from('cooperative_offers').select('*, crops(*), livestock_types(*)').eq('status','ouvert').order('created_at',{ascending:false}).limit(12),supabase.rpc('coop_offer_totals_public'),supabase.from('funding_programs').select('id,name,organization,sector,region,description,is_demo').eq('active',true).order('name').limit(12)]);setInputs((ip.data||[]) as InputProduct[]);setCoops((co.data||[]) as any[]);const tt:Record<string,{kg:number;n:number}>={};((ct.data||[]) as any[]).forEach(x=>{tt[x.offer_id]={kg:Number(x.committed_kg)||0,n:Number(x.producers)||0}});setCoopTot(tt);setFunds((fp.data||[]) as any[])}catch{}
   setPhotos(await loadPhotosByListing(supabase,((l.data||[]) as any[]).map((x:any)=>x.id)));setLoading(false);
 })()},[]);
 if(showAuth) return <Auth initialMode={showAuth} onDone={()=>{}} />;
 const shownTenders=tenders.filter(t=>sector==='agriculture'?t.crop_id:t.livestock_type_id);
 const shownListings=listings.filter(l=>sector==='agriculture'?l.crop_id:l.livestock_type_id);
 const shownInputs=inputs.filter(p=>p.sector===sector);const shownCoops=coops.filter(o=>sector==='agriculture'?o.crop_id:o.livestock_type_id);const shownFunds=funds.filter(f=>f.sector==='both'||f.sector===sector);
 function refFor(l:MarketListing){return refPrices.find(r=>sector==='agriculture'?r.crop_id===l.crop_id:r.livestock_type_id===l.livestock_type_id)}
 return <div className="publicpage">
  <div className="publictop"><div className="authbrand"><div className="logoMark">D</div><b>DulyAgrivia</b></div><div><button className="secondary" onClick={()=>setShowAuth('login')}>Se connecter</button> <button className="primary" onClick={()=>setShowAuth('signup')}>Créer un compte</button></div></div>
  <div className="authvisual" style={{borderRadius:0}}><h1>Votre exploitation.<br/><em>Votre marché.</em></h1><p>Cultures et cheptel, prévisions, financement et intrants — consultez librement, créez un compte quand vous êtes prêt à acheter ou vendre.</p></div>
  <div className="content">
   <div className="sectorswitch" style={{maxWidth:320}}><button className={sector==='agriculture'?'selected':''} onClick={()=>setSector('agriculture')}>Agriculture</button><button className={sector==='elevage'?'selected':''} onClick={()=>setSector('elevage')}>Élevage</button></div>
   <div className="quick" style={{margin:'10px 0',flexWrap:'wrap'}}>{[['vit-intrants','📦 Intrants'],['vit-marche','🛒 Marché'],['vit-appels','↗ Appels d’offres'],['vit-groupees','🤝 Ventes groupées'],['vit-fin','💰 Financement']].map(([id,t])=><a key={id} className="secondary" href={'#'+id}>{t}</a>)}</div>
   <div id="vit-intrants"><Section title="Boutique d’intrants (semences, engrais, produits, matériel)">{loading?<Loading/>:shownInputs.length?<div className="marketgrid">{shownInputs.map(p=><InputCard key={p.id} p={p} action={()=>setShowAuth('signup')} actionText="Créer un compte pour commander"/>)}</div>:<Empty text="Aucun intrant en vente pour le moment."/>}</Section></div>
   <div id="vit-marche"><Section title="Offres des producteurs">{loading?<Loading/>:shownListings.length?<div className="marketgrid">{shownListings.map(l=>{const label=sector==='agriculture'?l.crops?.name:l.livestock_types?.name;const emoji=sector==='agriculture'?(cropEmoji[label||'']||'🌱'):(livestockEmoji[label||'']||'🐄');const rp=refFor(l);return <div className="marketcard" key={l.id}><div className="marketvisual">{(photos[l.id]||[])[0]?<img className="marketphoto" src={photoUrl(supabase as any,photos[l.id][0])} alt={label||'Offre'} loading="lazy"/>:emoji}<span className="badge green">{listingStatusLabel[l.status]}</span></div>{(photos[l.id]||[]).length>1&&<div className="thumbstrip">{photos[l.id].slice(1,MAX_PHOTOS).map(p=><img key={p} src={photoUrl(supabase as any,p)} alt="" loading="lazy"/>)}</div>}<div className="marketbody"><span className="eyebrow">{label||'—'}{(l as any).is_demo?' • DÉMO':''}</span><h2>{(l as any).product_name||label||'Offre'}</h2><p style={{margin:'2px 0'}}>Quantité : <b>{unitSummary(l)}</b></p><div className="twocol"><div><span>Prix du vendeur</span><b>{Number(l.price_per_kg).toLocaleString('fr-FR')} {l.currency}/kg</b>{pricePerUnit(l)!==null&&<small className="muted"> ≈ {Number(pricePerUnit(l)).toLocaleString('fr-FR')} {l.currency}/{(l as any).sale_unit}</small>}</div><div><span>Référence DulyAgrivia</span><b>{rp?`${Number(rp.price_per_kg).toLocaleString('fr-FR')} ${rp.currency}/kg`:'—'}</b></div></div>{l.note&&<p>{l.note}</p>}<button className="secondary" onClick={()=>setShowAuth('signup')}>Créer un compte pour contacter le vendeur</button></div></div>})}</div>:<Empty text="Aucune offre publique pour le moment."/>}</Section></div>
   <div id="vit-appels"><Section title="Appels d’offres ouverts">{loading?<Loading/>:shownTenders.length?<div className="tenderlist">{shownTenders.map(t=><div className="tender" key={t.id}><div className="cropicon">{sector==='agriculture'?(cropEmoji[t.crops?.name||'']||'🌾'):(livestockEmoji[t.livestock_types?.name||'']||'🐾')}</div><div className="tendermain"><h3>{t.crops?.name||t.livestock_types?.name}{(t as any).is_demo?' • DÉMO':''}</h3><p>{Number(t.volume_kg).toLocaleString('fr-FR')} kg • {t.delivery_zone||'Zone non précisée'}{t.delivery_from?` • livraison ${fmtDate(t.delivery_from)} – ${fmtDate(t.delivery_to)}`:''}</p>{t.description&&<p>{t.description}</p>}{(t.preferred_unit||t.price_note)&&<p className="muted">{t.preferred_unit?`Conditionnement : ${t.preferred_unit}`:''}{t.preferred_unit&&t.price_note?' • ':''}{t.price_note||''}</p>}</div><button className="secondary" onClick={()=>setShowAuth('signup')}>Créer un compte pour répondre</button></div>)}</div>:<Empty text="Aucun appel d’offres public pour le moment."/>}</Section></div>
   <div id="vit-groupees"><Section title="Ventes groupées de producteurs">{loading?<Loading/>:shownCoops.length?<div className="tenderlist">{shownCoops.map((o:any)=>{const label=o.crops?.name||o.livestock_types?.name;const target=Number(o.target_volume_kg)||0;const t=coopTot[o.id]||{kg:0,n:0};const pct=target>0?Math.min(100,Math.round(t.kg/target*100)):0;return <div className="tender" key={o.id}><div className="cropicon">🤝</div><div className="tendermain"><span className="badge green">OUVERTE</span>{o.is_demo&&<span className="badge"> DÉMO</span>}<h3>{label||'—'} • objectif {target.toLocaleString('fr-FR')} kg</h3><p>{o.price_per_kg?`${Number(o.price_per_kg).toLocaleString('fr-FR')} FCFA/kg • `:''}{o.payment_terms||'Conditions à préciser'}{o.harvest_date?` • récolte ${fmtDate(o.harvest_date)}`:''}</p>{o.description&&<p>{o.description}</p>}<div style={{background:'var(--line)',borderRadius:8,height:10,overflow:'hidden',margin:'6px 0 2px'}}><div style={{width:pct+'%',height:'100%',background:'var(--green2)'}}/></div><small className="muted">{t.kg.toLocaleString('fr-FR')} kg engagés ({pct} %) • {t.n} producteur(s)</small></div><button className="secondary" onClick={()=>setShowAuth('signup')}>Créer un compte pour rejoindre</button></div>})}</div>:<Empty text="Aucune vente groupée ouverte pour le moment."/>}</Section></div>
   <div id="vit-fin"><Section title="Financements et programmes d’appui">{loading?<Loading/>:shownFunds.length?<div className="tenderlist">{shownFunds.map((f:any)=><div className="tender" key={f.id}><div className="cropicon">💰</div><div className="tendermain"><span className="badge green">{f.region||'International'}</span>{f.is_demo&&<span className="badge"> DÉMO</span>}<h3>{f.name}</h3><p>{f.organization}{f.description?` • ${f.description}`:''}</p></div><button className="secondary" onClick={()=>setShowAuth('signup')}>Créer un compte pour contacter</button></div>)}</div>:<Empty text="Aucun programme de financement pour le moment."/>}<p className="muted">Informations indicatives. Les coordonnées de contact sont réservées aux membres inscrits.</p></Section></div>
  </div>
  <div className="publicfooter">DulyAgrivia — plateforme agricole et d’élevage. <button className="linkbtn" onClick={()=>setShowAuth('login')}>Connexion Producteur / Acheteur</button></div>
 </div>;
}

function AdminLogin(){
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('');
 async function submit(){if(!supabase)return;setBusy(true);setMsg('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setMsg(error.message);setBusy(false);}
 return <div className="authpage"><div className="authvisual"><div className="logoMark">D</div><span>DULYAGRIVIA</span><h1>Espace<br/><em>Super Administrateur.</em></h1><p>Accès réservé. Aucune création de compte n’est possible depuis cet écran.</p></div><div className="authcard"><div className="authbrand"><div className="logoMark">D</div><b>DulyAgrivia — Admin</b></div><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>Mot de passe<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>{msg&&<div className="notice">{msg}</div>}<button type="button" onClick={submit} className="primary wide" disabled={busy}>{busy?'Connexion…':'Se connecter'}</button></div></div>;
}
function AdminDenied({error,signOut}:{error:string;signOut:()=>void}){
 return <div className="authpage"><div className="authcard"><div className="logoMark">D</div><h1>Accès refusé</h1><p>Ce compte ne dispose pas des droits Super Administrateur.{error?` (${error})`:''}</p><button className="secondary wide" onClick={signOut}>Se déconnecter</button></div></div>;
}
function UpdatePassword({onDone}:{onDone:()=>void}){
 const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('');
 async function submit(){if(!supabase)return;setBusy(true);setMsg('');const {error}=await supabase.auth.updateUser({password});setBusy(false);if(error)setMsg(error.message);else{setMsg('Mot de passe mis à jour. Veuillez vous reconnecter.');setTimeout(onDone,1500)}}
 return <div className="authpage"><div className="authcard"><div className="logoMark">D</div><h1>Nouveau mot de passe</h1><label>Nouveau mot de passe<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required /></label>{msg&&<div className="notice">{msg}</div>}<button type="button" onClick={submit} className="primary wide" disabled={busy}>{busy?'Enregistrement…':'Enregistrer'}</button></div></div>;
}
function Team({profile}:{profile:Profile}){
 const [farms,setFarms]=useState<Farm[]>([]);
 const [farmId,setFarmId]=useState<string|null>(null);
 const [invites,setInvites]=useState<WorkerInvite[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [form,setForm]=useState({name:'',phone:''});
 const [toast,setToast]=useState('');
 // Un producteur peut avoir plusieurs exploitations ; les invitations Ouvrier se créent
 // exploitation par exploitation (l'ouvrier n'a jamais accès à plus que celle choisie ici).
 async function load(fidOverride?:string){
  if(!supabase)return;setLoading(true);
  const {data:fs}=await supabase.from('farms').select('id,name,area_ha,region').eq('owner_id',profile.id).order('created_at');
  const list=(fs||[]) as Farm[];setFarms(list);
  const fid=fidOverride||farmId||(list[0]?list[0].id:null);setFarmId(fid);
  if(fid){const {data}=await supabase.from('worker_invites').select('*').eq('farm_id',fid).order('created_at',{ascending:false});setInvites((data||[]) as WorkerInvite[]);}else setInvites([]);
  setLoading(false);
 }
 useEffect(()=>{load()},[profile.id]);
 async function createInvite(e:React.FormEvent){e.preventDefault();if(!supabase||!farmId)return;setBusy(true);
  const code=Math.random().toString(36).slice(2,6).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase();
  const {error}=await supabase.from('worker_invites').insert({code,farm_id:farmId,full_name:form.name||null,phone:form.phone||null,created_by:profile.id});
  setBusy(false);
  if(error)setToast(error.message);else{setForm({name:'',phone:''});setToast('Code créé : '+code);load(farmId);}
 }
 return <><div className="pageintro"><div><span className="eyebrow">GESTION D’ÉQUIPE</span><h1>Mon équipe</h1><p>Créez un code d’invitation pour chaque ouvrier. Il l’utilisera pour créer lui-même son compte, déjà rattaché à l’exploitation choisie.</p></div></div>
  {!farmId&&!loading&&<Empty text="Créez d’abord une exploitation (Ma ferme) avant d’inviter des ouvriers."/>}
  {farms.length>1&&<label>Exploitation<select value={farmId||''} onChange={e=>load(e.target.value)}>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
  {farmId&&<form className="tender" onSubmit={createInvite}><div className="tendermain"><label>Nom de l’ouvrier (optionnel)<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Téléphone (optionnel)<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label></div><button className="primary" disabled={busy}>{busy?'Création…':'Générer un code'}</button></form>}
  {toast&&<div className="notice">{toast}</div>}
  {loading?<Loading/>:invites.length?<div className="adminlist">{invites.map(i=><div key={i.id}><b>{i.code}{i.full_name?` — ${i.full_name}`:''}</b><span className={'badge '+(i.used?'':'green')}>{i.used?'Utilisé':'En attente'}</span></div>)}</div>:farmId?<Empty text="Aucun code d’invitation créé pour le moment."/>:null}
 </>;
}

function Shell({profile,session,screen,setScreen,sector,setSector,selectedField,setSelectedField,selectedHerd,setSelectedHerd,toast,setToast,signOut}:{profile:Profile;session:Session;screen:Screen;setScreen:(s:Screen)=>void;sector:Sector;setSector:(s:Sector)=>void;selectedField:string|null;setSelectedField:(s:string|null)=>void;selectedHerd:string|null;setSelectedHerd:(s:string|null)=>void;toast:string;setToast:(s:string)=>void;signOut:()=>void}){
 const title:Record<Screen,string>={home:'Tableau de bord',farm:'Ma ferme',field:'Mon champ',herds:'Mon cheptel',herd:'Mon troupeau',market:'Marché DulyAgrivia',tenders:'Appels d’offres',map:'Carte agricole',ai:sector==='agriculture'?'AgroDoctor IA':'VétoDoctor IA',financement:'Financement',intrants:'Intrants',tasks:'Mes tâches',team:'Mon équipe',notifications:'Notifications',profile:'Mon profil',admin:'Super Administration',pro:'Passer à PRO',sales:'Mes ventes',committee:'Comité technique',coop:'Coopérative'};
 const go=(s:Screen)=>setScreen(s);
 const [isCommittee,setIsCommittee]=useState(false);
 const [more,setMore]=useState(false);
 // Historique du navigateur : le bouton Retour du téléphone revient à l'écran précédent (ex. le champ) au lieu de quitter l'application.
 useEffect(()=>{const cur=history.state as any;if(cur&&cur.duly&&cur.screen===screen&&(cur.field||null)===(selectedField||null)&&(cur.herd||null)===(selectedHerd||null))return;const st={duly:1,screen,field:selectedField,herd:selectedHerd};try{if(cur&&cur.duly)history.pushState(st,'');else history.replaceState(st,'')}catch{}},[screen,selectedField,selectedHerd]);
 useEffect(()=>{const onPop=(e:PopStateEvent)=>{const st=e.state as any;if(st&&st.duly){setScreen(st.screen);setSelectedField(st.field||null);setSelectedHerd(st.herd||null);setMore(false)}};window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[]);
 useEffect(()=>{(async()=>{if(!supabase)return;const {data}=await supabase.from('committee_members').select('user_id').eq('user_id',profile.id).maybeSingle();setIsCommittee(!!data)})()},[profile.id]);
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(t)}},[toast]);
 const items=(sector==='agriculture'
   ?[['home','⌂','Accueil'],['farm','🌱','Ma ferme'],['market','🛒','Marché'],['tenders','↗','Appels d’offres'],['map','📍','Carte']]
   :[['home','⌂','Accueil'],['herds','🐄','Mon cheptel'],['market','🛒','Marché'],['tenders','↗','Appels d’offres'],['financement','💰','Financement']]
 ) as [Screen,string,string][];
 // Menu « Plus » du mobile : donne accès à tous les écrans absents de la barre du bas (la barre latérale est masquée sur téléphone).
 const secondary=([['coop','🤝','Coopérative'],['intrants','📦','Intrants'],['ai','✦',sector==='agriculture'?'AgroDoctor IA':'VétoDoctor IA']] as [Screen,string,string][])
  .concat(profile.role==='ouvrier'?[['tasks','✓','Mes tâches'] as [Screen,string,string]]:[])
  .concat(profile.role==='producteur'?[['team','👥','Mon équipe'] as [Screen,string,string]]:[])
  .concat(profile.role==='producteur'&&isProActive(profile)?[['sales','💵','Mes ventes'] as [Screen,string,string]]:[])
  .concat(profile.role==='producteur'?[['pro','★',isProActive(profile)?'Abonnement PRO':'Passer à PRO'] as [Screen,string,string]]:[])
  .concat(isAdminRole(profile.role)||isCommittee?[['committee','⚖','Comité technique'] as [Screen,string,string]]:[])
  .concat(isAdminRole(profile.role)?[['admin','🛡','Administration'] as [Screen,string,string]]:[])
  .concat([['notifications','◔','Notifications'] as [Screen,string,string],['profile','◯','Profil'] as [Screen,string,string]]);
 return <div className="app"><aside className="sidebar"><div className="brand"><div className="logoMark">D</div><div><b>DulyAgrivia</b><small>AGRICULTURE • ÉLEVAGE</small></div></div><div className="sectorswitch"><button className={sector==='agriculture'?'selected':''} onClick={()=>{setSector('agriculture');go('home')}}>Agriculture</button><button className={sector==='elevage'?'selected':''} onClick={()=>{setSector('elevage');go('home')}}>Élevage</button></div><div className="rolebox"><span>{isAdminRole(profile.role)?'SUPER ADMIN':profile.role.toUpperCase()}</span><b>{profile.full_name||'Utilisateur'}</b></div>{items.map(i=><NavItem key={i[0]} active={screen===i[0]} icon={i[1]} text={i[2]} onClick={()=>go(i[0])}/>)}<NavItem active={screen==='coop'} icon="🤝" text="Coopérative" onClick={()=>go('coop')}/><NavItem active={screen==='intrants'} icon="📦" text="Intrants" onClick={()=>go('intrants')}/>{profile.role==='ouvrier'&&<NavItem active={screen==='tasks'} icon="✓" text="Mes tâches" onClick={()=>go('tasks')}/>}{profile.role==='producteur'&&<NavItem active={screen==='team'} icon="👥" text="Mon équipe" onClick={()=>go('team')}/>}{profile.role==='producteur'&&isProActive(profile)&&<NavItem active={screen==='sales'} icon="💵" text="Mes ventes" onClick={()=>go('sales')}/>}{profile.role==='producteur'&&<NavItem active={screen==='pro'} icon="★" text={isProActive(profile)?'Mon abonnement PRO':'Passer à PRO'} onClick={()=>go('pro')}/>}<NavItem active={screen==='ai'} icon="✦" text={sector==='agriculture'?'AgroDoctor IA':'VétoDoctor IA'} onClick={()=>go('ai')}/>{(isAdminRole(profile.role)||isCommittee)&&<NavItem active={screen==='committee'} icon="⚖" text="Comité technique" onClick={()=>go('committee')}/>}{profile.role==='ouvrier'&&<NavItem active={screen==='farm'} icon="🌱" text="Mes champs" onClick={()=>go('farm')}/>}{isAdminRole(profile.role)&&<NavItem active={screen==='admin'} icon="🛡" text="Administration" onClick={()=>go('admin')}/>}<div className="sidebottom"><NavItem active={screen==='notifications'} icon="◔" text="Notifications" onClick={()=>go('notifications')}/><NavItem active={screen==='profile'} icon="◯" text="Profil" onClick={()=>go('profile')}/></div></aside><main className="main"><header className="topbar"><div className="mobilebrand"><div className="logoMark">D</div><b>DulyAgrivia</b></div><div className="crumb">{title[screen]}</div><div className="topactions"><button className="iconbtn" onClick={()=>go('notifications')}>◔</button><button className="avatar" onClick={()=>go('profile')}>{(profile.full_name||'U').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</button></div></header><div className="mobilesectorswitch"><button className={sector==='agriculture'?'selected':''} onClick={()=>{setSector('agriculture');go('home')}}>Agriculture</button><button className={sector==='elevage'?'selected':''} onClick={()=>{setSector('elevage');go('home')}}>Élevage</button></div><div className="content">{screen==='home'&&<Dashboard profile={profile} go={go} sector={sector}/>} {screen==='farm'&&<Farm profile={profile} go={go} setSelectedField={setSelectedField}/>} {screen==='field'&&<Field fieldId={selectedField} go={go} role={profile.role}/>} {screen==='herds'&&<Herds profile={profile} go={go} setSelectedHerd={setSelectedHerd}/>} {screen==='herd'&&<HerdDetail herdId={selectedHerd} go={go}/>} {screen==='market'&&<Market sector={sector} profile={profile}/>} {screen==='tenders'&&<Tenders profile={profile} sector={sector} setToast={setToast}/>} {screen==='map'&&<MapScreen profile={profile}/>} {screen==='ai'&&<AI sector={sector} profile={profile} onBack={selectedField?()=>go('field'):undefined}/>} {screen==='financement'&&<Financement sector={sector}/>} {screen==='coop'&&supabase&&profile.role!=='ouvrier'&&<Cooperative db={supabase} profile={profile} sector={sector} setToast={setToast}/>} {screen==='intrants'&&<Intrants sector={sector}/>} {screen==='tasks'&&<Tasks profile={profile}/>} {screen==='team'&&<Team profile={profile}/>} {screen==='pro'&&<ProScreen profile={profile} reloadProfile={()=>{}}/>} {screen==='sales'&&<SalesScreen profile={profile}/>} {screen==='notifications'&&<Notifications/>} {screen==='profile'&&<Profile profile={profile} session={session} signOut={signOut}/>} {screen==='admin'&&<Admin/>}{screen==='committee'&&supabase&&(isAdminRole(profile.role)||isCommittee)&&<CommitteePanel db={supabase} isAdmin={isAdminRole(profile.role)} isCommittee={isCommittee}/>}</div>{toast&&<div className="toast">✓ <div><b>{toast}</b></div></div>}</main><nav className="bottomnav">{items.map(i=><button key={i[0]} className={screen===i[0]?'active':''} onClick={()=>{setMore(false);go(i[0])}}><span>{i[1]}</span><small>{i[2].split(' ')[0]}</small></button>)}<button className={more?'active':''} onClick={()=>setMore(!more)}><span>☰</span><small>Plus</small></button></nav>{more&&<div className="moresheet" onClick={()=>setMore(false)}><div onClick={e=>e.stopPropagation()}>{secondary.map(i=><button key={i[0]} onClick={()=>{setMore(false);go(i[0])}}><span>{i[1]}</span>{i[2]}</button>)}</div></div>}</div>
}
const NavItem=({active,icon,text,onClick}:{active:boolean;icon:string;text:string;onClick:()=>void})=><button className={'navitem '+(active?'active':'')} onClick={onClick}><span>{icon}</span><span>{text}</span></button>;
const Section=({title,action,children}:{title:string;action?:string;children:React.ReactNode})=><section className="section"><div className="sectionhead"><h2>{title}</h2>{action&&<span className="linkbtn">{action} →</span>}</div>{children}</section>;
const Stat=({title,value,note}:{title:string;value:string;note:string})=><div className="stat"><span>{title}</span><strong>{value}</strong><small>{note}</small></div>;

function useFarmData(profileId:string){
 const [farms,setFarms]=useState<Farm[]>([]),[fields,setFields]=useState<Field[]>([]),[crops,setCrops]=useState<Crop[]>([]),[forecasts,setForecasts]=useState<Forecast[]>([]),[loading,setLoading]=useState(true);
 async function load(){if(!supabase)return;setLoading(true);const [f,fi,c,h]=await Promise.all([supabase.from('farms').select('*').eq('owner_id',profileId).order('created_at'),supabase.from('fields').select('*, crops(*)').order('created_at'),supabase.from('crops').select('*').eq('active',true).order('name'),supabase.from('harvest_forecasts').select('*')]);setFarms((f.data||[]) as Farm[]);setFields((fi.data||[]) as Field[]);setCrops((c.data||[]) as Crop[]);setForecasts((h.data||[]) as Forecast[]);setLoading(false)}
 useEffect(()=>{load()},[profileId]);return {farms,fields,crops,forecasts,loading,reload:load};
}

function useHerdData(profileId:string){
 const [farms,setFarms]=useState<Farm[]>([]),[herds,setHerds]=useState<Herd[]>([]),[livestockTypes,setLivestockTypes]=useState<LivestockType[]>([]),[records,setRecords]=useState<HealthRecord[]>([]),[loading,setLoading]=useState(true);
 async function load(){if(!supabase)return;setLoading(true);const [f,h,lt,r]=await Promise.all([supabase.from('farms').select('*').eq('owner_id',profileId).order('created_at'),supabase.from('herds').select('*, livestock_types(*)').order('created_at'),supabase.from('livestock_types').select('*').eq('active',true).order('name'),supabase.from('herd_health_records').select('*').order('record_date',{ascending:false})]);setFarms((f.data||[]) as Farm[]);setHerds((h.data||[]) as Herd[]);setLivestockTypes((lt.data||[]) as LivestockType[]);setRecords((r.data||[]) as HealthRecord[]);setLoading(false)}
 useEffect(()=>{load()},[profileId]);return {farms,herds,livestockTypes,records,loading,reload:load};
}

function Dashboard({profile,go,sector}:{profile:Profile;go:(s:Screen)=>void;sector:Sector}){
 if(sector==='elevage') return <ElevageDashboard profile={profile} go={go}/>;
 const {farms,fields,forecasts,loading}=useFarmData(profile.id);const imminent=useMemo(()=>forecasts.filter(x=>x.estimated_date).sort((a,b)=>(a.estimated_date||'').localeCompare(b.estimated_date||''))[0],[forecasts]);const field=fields.find(x=>x.id===imminent?.field_id);const totalArea=Math.max(farms.reduce((a,b)=>a+Number(b.area_ha||0),0),fields.reduce((a,b)=>a+Number(b.area_ha||0),0));const totalVol=forecasts.reduce((a,b)=>a+Number(b.estimated_volume_kg||0),0);return <><div className="hero"><div><span className="eyebrow">BONJOUR, {profile.full_name?.split(' ')[0]?.toUpperCase()||'PRODUCTEUR'} 👋</span><h1>Votre ferme.<br/><em>Votre marché.</em></h1><p>Tout ce qui compte aujourd’hui, au même endroit.</p></div><button className="primary" onClick={()=>go('farm')}>＋ Ajouter un champ</button></div>{loading?<Loading/>:<><div className="grid4"><Stat title="Surface exploitée" value={`${totalArea.toFixed(1)} ha`} note={`${farms.length} ferme(s)`}/><Stat title="Récolte prévue" value={`${(totalVol/1000).toFixed(2)} t`} note={`${forecasts.length} prévision(s)`}/><Stat title="Champs actifs" value={String(fields.length)} note="Données réelles"/><Stat title="Compte" value={profile.role==='producteur'?'Producteur':'Actif'} note="Session sécurisée"/></div><div className="dashboardgrid"><Section title="Prochaine récolte"><div className="harvestcard">{field?<><div className="cropbig">{cropEmoji[field.crops?.name||'']||'🌱'}</div><div className="harvestinfo"><span className="badge danger">RÉCOLTE À VENIR</span><h3>{field.name}</h3><p>{field.crops?.name||'Culture'} • {field.area_ha} ha</p><div className="harvestmetrics"><div><b>{imminent?.estimated_volume_kg?`${Number(imminent.estimated_volume_kg).toLocaleString('fr-FR')} kg`:'Volume à définir'}</b><span>volume estimé</span></div><div><b>{fmtDate(imminent?.estimated_date||null)}</b><span>date prévue</span></div><div><b>{imminent?.estimated_date?Math.max(0,daysBetween(new Date(),new Date(imminent.estimated_date+'T00:00:00'))):'—'}</b><span>jours</span></div></div></div></>:<Empty text="Créez votre premier champ pour obtenir une prévision de récolte." action="Ma ferme" onClick={()=>go('farm')}/>}</div></Section><Section title="Démarrage rapide"><div className="quick"><Quick label="Ajouter un champ" onClick={()=>go('farm')}/><Quick label="Voir le marché" onClick={()=>go('market')}/><Quick label="Diagnostic IA" onClick={()=>go('ai')}/><Quick label="Financement" onClick={()=>go('financement')}/></div></Section></div></>}</>}

function ElevageDashboard({profile,go}:{profile:Profile;go:(s:Screen)=>void}){
 const {herds,records,loading}=useHerdData(profile.id);const totalHeads=herds.reduce((a,b)=>a+Number(b.headcount||0),0);const urgent=records.filter(r=>r.urgency==='eleve').length;return <><div className="hero"><div><span className="eyebrow">BONJOUR, {profile.full_name?.split(' ')[0]?.toUpperCase()||'ÉLEVEUR'} 👋</span><h1>Votre cheptel.<br/><em>Votre marché.</em></h1><p>Suivi sanitaire, ventes et financement au même endroit.</p></div><button className="primary" onClick={()=>go('herds')}>＋ Ajouter un troupeau</button></div>{loading?<Loading/>:<><div className="grid4"><Stat title="Effectif total" value={String(totalHeads)} note={`${herds.length} troupeau(x)`}/><Stat title="Alertes sanitaires" value={String(urgent)} note="Urgence élevée"/><Stat title="Troupeaux actifs" value={String(herds.length)} note="Données réelles"/><Stat title="Compte" value={profile.role==='producteur'?'Éleveur':'Actif'} note="Session sécurisée"/></div><div className="dashboardgrid"><Section title="Démarrage rapide"><div className="quick"><Quick label="Ajouter un troupeau" onClick={()=>go('herds')}/><Quick label="Voir le marché" onClick={()=>go('market')}/><Quick label="Diagnostic vétérinaire" onClick={()=>go('ai')}/><Quick label="Financement" onClick={()=>go('financement')}/></div></Section></div></>}</>}
const Quick=({label,onClick}:{label:string;onClick:()=>void})=><button className="quickbtn" onClick={onClick}><span>＋</span><b>{label}</b><span>→</span></button>;
const Loading=()=> <div className="loading">Chargement des données…</div>;
const Empty=({text,action,onClick}:{text:string;action?:string;onClick?:()=>void})=><div className="empty"><p>{text}</p>{action&&<button className="secondary" onClick={onClick}>{action}</button>}</div>;

function Farm({profile,go,setSelectedField}:{profile:Profile;go:(s:Screen)=>void;setSelectedField:(s:string)=>void}){const {farms,fields,crops,reload}=useFarmData(profile.id);const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');const [form,setForm]=useState({farm:'',name:'',crop:'',area:'',date:'',lat:'',lng:''});
 const [newFarmName,setNewFarmName]=useState('');const [newCrop,setNewCrop]=useState('');const [showTrace,setShowTrace]=useState(false);const [draft,setDraft]=useState<{points:{lat:number;lng:number}[];ha:number}|null>(null);
 useEffect(()=>{if(farms[0]&&!form.farm)setForm(x=>({...x,farm:farms[0].id}))},[farms]);
 // Le producteur peut posséder plusieurs exploitations distinctes (cahier des charges, section 3).
 async function createFarm(){if(!supabase||!newFarmName.trim())return;setBusy(true);setMsg('');const {data,error}=await supabase.from('farms').insert({owner_id:profile.id,name:newFarmName.trim(),area_ha:0}).select().single();setBusy(false);if(error){setMsg(error.message);return}setNewFarmName('');setForm(x=>({...x,farm:data.id}));await reload();}
 async function save(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setMsg('');let farmId=form.farm;if(!farmId){const {data,error}=await supabase.from('farms').insert({owner_id:profile.id,name:'Ma ferme',area_ha:0,region:'Ouest'}).select().single();if(error){setMsg(error.message);setBusy(false);return}farmId=data.id}
  let cropId:string|null=form.crop||null;if(form.crop==='__new'){const nm=newCrop.trim().slice(0,60);if(!nm){setMsg('Indiquez le nom de votre culture.');setBusy(false);return}const ex=crops.find(c=>c.name.toLowerCase()===nm.toLowerCase());if(ex){cropId=ex.id}else{const {data:cc,error:ce}=await supabase.from('crops').insert({name:nm,is_custom:true,created_by:profile.id,category:'autre',icon:'🌱'}).select('id').single();if(ce){setMsg(ce.message);setBusy(false);return}cropId=cc.id}}
  const {data:field,error}=await supabase.from('fields').insert({farm_id:farmId,name:form.name, crop_id:cropId, boundary:draft?draft.points:null, boundary_area_ha:draft?Number(draft.ha.toFixed(3)):null, area_ha:Number(form.area), planting_date:form.date||null, latitude:form.lat?Number(form.lat):null, longitude:form.lng?Number(form.lng):null}).select('*, crops(*)').single();if(error){setMsg(error.message);setBusy(false);return}
  if(cropId&&form.date){const crop=crops.find(c=>c.id===cropId);if(crop){const d=new Date(form.date+'T00:00:00');d.setDate(d.getDate()+crop.cycle_days);await supabase.from('harvest_forecasts').insert({field_id:field.id,estimated_date:d.toISOString().slice(0,10),status:'growth'});}}
  setBusy(false);setOpen(false);setDraft(null);setShowTrace(false);setForm({farm:farmId,name:'',crop:'',area:'',date:'',lat:'',lng:''});await reload();
 }
 function gps(){navigator.geolocation?.getCurrentPosition(p=>setForm(x=>({...x,lat:String(p.coords.latitude),lng:String(p.coords.longitude)})),()=>setMsg('Position GPS indisponible ou refusée.'))}
 return <><div className="pageintro"><div><span className="eyebrow">EXPLOITATION</span><h1>Ma ferme</h1><p>Gérez vos champs et prévisions depuis un seul espace. Vous pouvez gérer plusieurs exploitations.</p></div>{profile.role!=='ouvrier'&&<button className="primary" onClick={()=>setOpen(true)}>＋ Nouveau champ</button>}</div>
 {profile.role!=='ouvrier'&&<div className="tender" style={{marginBottom:16}}><div className="tendermain"><label>Exploitations ({farms.length})<select value={form.farm} onChange={e=>setForm({...form,farm:e.target.value})}>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>Nouvelle exploitation<input placeholder="Nom de l’exploitation" value={newFarmName} onChange={e=>setNewFarmName(e.target.value)}/></label></div><button type="button" className="secondary" disabled={busy||!newFarmName.trim()} onClick={createFarm}>{busy?'Création…':'＋ Créer cette exploitation'}</button>{msg&&<div className="notice">{msg}</div>}</div>}
 <div className="farmsummary"><div><span>Surface totale</span><b>{Math.max(farms.reduce((a,b)=>a+Number(b.area_ha||0),0),fields.reduce((a,b)=>a+Number(b.area_ha||0),0)).toFixed(1)} ha</b></div><div><span>Champs</span><b>{fields.length}</b></div><div><span>Cultures</span><b>{new Set(fields.map(f=>f.crop_id).filter(Boolean)).size}</b></div><div><span>Prévisions</span><b>{fields.length? 'Actives':'—'}</b></div></div><Section title="Mes champs"><div className="fieldgrid">{fields.length?fields.map(f=><button className="fieldcard" key={f.id} onClick={()=>{setSelectedField(f.id);go('field')}}><div className="fieldimage">{cropEmoji[f.crops?.name||'']||'🌱'}</div>{(()=>{const st=fieldStage(f);return <div><span className={'badge '+st.tone}>{st.label}</span><h3>{f.name}</h3><p>{f.area_ha} ha • {f.crops?.name||'Culture non définie'}</p><div className="progress"><span style={{width:st.pct+'%'}}/></div><small>{st.day!==null&&st.total?`Jour ${Math.max(0,st.day)} sur ${st.total}`:`Planté le ${fmtDate(f.planting_date)}`}</small></div>})()}<span>→</span></button>):<Empty text="Aucun champ enregistré. Commencez par créer votre premier champ." action="Créer un champ" onClick={()=>setOpen(true)}/>}</div></Section>{open&&<div className="modal"><form className="modalcard" onSubmit={save}><div className="sectionhead"><h2>Nouveau champ</h2><button type="button" onClick={()=>setOpen(false)}>✕</button></div>{farms.length>0&&<label>Ferme<select value={form.farm} onChange={e=>setForm({...form,farm:e.target.value})}>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}<label>Nom du champ<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Culture<select required value={form.crop} onChange={e=>setForm({...form,crop:e.target.value})}><option value="">Choisir…</option>{[['maraicher','Maraîchage'],['vivrier','Cultures vivrières'],['fruitier','Arbres fruitiers'],['rente','Cultures de rente'],['autre','Autres']].map(([k,l])=>{const list=crops.filter(c=>((c as any).category||'autre')===k);return list.length?<optgroup key={k} label={l}>{list.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>:null})}<option value="__new">＋ Ma culture n’est pas dans la liste…</option></select></label>{form.crop==='__new'&&<label>Nom de ma culture (visible par tous les producteurs, non modéré)<input maxLength={60} value={newCrop} onChange={e=>setNewCrop(e.target.value)}/></label>}<label>Surface (ha)<input type="number" min="0" step="0.01" required value={form.area} onChange={e=>setForm({...form,area:e.target.value})}/></label><label>Date de plantation<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><div className="gpsrow"><label>Latitude<input value={form.lat} onChange={e=>setForm({...form,lat:e.target.value})}/></label><label>Longitude<input value={form.lng} onChange={e=>setForm({...form,lng:e.target.value})}/></label></div><button type="button" className="secondary wide" onClick={gps}>📍 Utiliser ma position</button><button type="button" className="secondary wide" onClick={()=>setShowTrace(v=>!v)}>🗺️ {showTrace?'Masquer la carte':'Tracer le champ sur la carte (surface automatique)'}</button>{draft&&<div className="notice">Tracé gardé : <b>{draft.ha.toFixed(2)} ha</b> — il sera enregistré avec le champ.</div>}{showTrace&&<FieldMap db={supabase} field={{name:form.name||'Nouveau champ',boundary:[],latitude:form.lat?Number(form.lat):null,longitude:form.lng?Number(form.lng):null}} canEdit={true} onDraft={(pts,ha,la,ln)=>{setDraft({points:pts,ha});setForm(f=>({...f,area:ha.toFixed(2),lat:String(la),lng:String(ln)}));setShowTrace(false)}}/>}{msg&&<div className="notice">{msg}</div>}<button className="primary wide" disabled={busy}>{busy?'Enregistrement…':'Enregistrer le champ'}</button></form></div>}</>}

function Field({fieldId,go,role}:{fieldId:string|null;go:(s:Screen)=>void;role:Role}){const [field,setField]=useState<Field|null>(null);const [forecast,setForecast]=useState<Forecast|null>(null);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [edit,setEdit]=useState(false);const [corr,setCorr]=useState({volume:'',date:''});
 async function load(){if(!supabase||!fieldId)return;const {data}=await supabase.from('fields').select('*, crops(*)').eq('id',fieldId).single();const {data:f}=await supabase.from('harvest_forecasts').select('*').eq('field_id',fieldId).order('created_at',{ascending:false}).limit(1).maybeSingle();setField(data as Field);setForecast(f as Forecast|null);setLoading(false)}
 useEffect(()=>{load()},[fieldId]);
 // Prévision indicative recalculée à partir des paramètres configurés par culture (crop_guides,
 // crops.cycle_days) — jamais inventée librement par l'IA — et toujours corrigible par le producteur.
 async function recalc(){
  if(!supabase||!field||!field.crop_id)return;setBusy(true);
  const [{data:guide},{data:crop}]=await Promise.all([supabase.from('crop_guides').select('expected_yield_kg_per_ha').eq('crop_id',field.crop_id).maybeSingle(),supabase.from('crops').select('cycle_days').eq('id',field.crop_id).single()]);
  const yieldPerHa=guide?.expected_yield_kg_per_ha?Number(guide.expected_yield_kg_per_ha):0;
  const volume=Math.round(yieldPerHa*Number(field.area_ha||0));
  let date:string|null=null;
  if(field.planting_date&&crop?.cycle_days){const d=new Date(field.planting_date+'T00:00:00');d.setDate(d.getDate()+Number(crop.cycle_days));date=d.toISOString().slice(0,10)}
  const payload={field_id:field.id,estimated_volume_kg:volume,estimated_date:date,status:'croissance'};
  if(forecast){await supabase.from('harvest_forecasts').update(payload).eq('id',forecast.id)}else{await supabase.from('harvest_forecasts').insert(payload)}
  setBusy(false);load();
 }
 async function saveCorrection(e:React.FormEvent){e.preventDefault();if(!supabase||!field)return;setBusy(true);
  const payload={field_id:field.id,estimated_volume_kg:corr.volume?Number(corr.volume):null,estimated_date:corr.date||null,status:'corrige_producteur'};
  if(forecast){await supabase.from('harvest_forecasts').update(payload).eq('id',forecast.id)}else{await supabase.from('harvest_forecasts').insert(payload)}
  setBusy(false);setEdit(false);load();
 }
 if(loading)return <Loading/>;if(!field)return <Empty text="Champ introuvable." action="Ma ferme" onClick={()=>go('farm')}/>;return <><button className="back" onClick={()=>go('farm')}>← Retour à ma ferme</button><div className="fieldhero"><div className="fieldphoto">{cropEmoji[field.crops?.name||'']||'🌱'}</div><div>{(()=>{const st=fieldStage(field);return <><span className={'badge '+st.tone}>{st.label}</span><h1>{field.name}</h1><p>{field.crops?.name||'Culture'} • {field.area_ha} ha • Planté le {fmtDate(field.planting_date)}</p>{st.total&&st.day!==null&&<><div className="progress" style={{maxWidth:360}}><span style={{width:st.pct+'%'}}/></div><small className="muted" style={{display:'block',marginTop:6}}>Jour {Math.max(0,st.day)} sur {st.total} du cycle</small></>}</>})()}</div></div>{field.crops&&(field.crops as any).cycle_verified===false&&<div className="notice">⚠ Cycle de la culture « {field.crops.name} » : <b>indicatif, à confirmer</b>. La date de récolte prévue en dépend.</div>}<div className="grid3"><div className="metricbig"><span>Récolte estimée</span><b>{forecast?.estimated_volume_kg?`${Number(forecast.estimated_volume_kg).toLocaleString('fr-FR')} kg`:'À définir'}</b><small>{forecast?.status==='corrige_producteur'?'Corrigée par le producteur':'Prévision DulyAgrivia'}</small></div><div className="metricbig"><span>Date prévue</span><b>{fmtDate(forecast?.estimated_date||null)}</b><small>{forecast?.estimated_date?`${Math.max(0,daysBetween(new Date(),new Date(forecast.estimated_date+'T00:00:00')))} jours restants`:''}</small></div><div className="metricbig"><span>Localisation</span><b>{field.latitude?'GPS':'Non définie'}</b><small>{field.latitude&&field.longitude?`${field.latitude.toFixed(4)}, ${field.longitude.toFixed(4)}`:'Ajoutez une position'}</small></div></div><Section title="Carte et position GPS du champ"><FieldMap db={supabase} field={field} canEdit={role==="producteur"||role==="admin"||role==="super_admin"} onSaved={()=>load()}/></Section><Section title="Prévision de récolte"><div className="quick"><Quick label={busy?'Calcul…':'Recalculer la prévision'} onClick={recalc}/><Quick label="Corriger manuellement" onClick={()=>{setCorr({volume:forecast?.estimated_volume_kg?String(forecast.estimated_volume_kg):'',date:forecast?.estimated_date||''});setEdit(true)}}/></div>{edit&&<form className="tender" onSubmit={saveCorrection} style={{marginTop:12}}><div className="tendermain"><label>Quantité corrigée (kg)<input type="number" value={corr.volume} onChange={e=>setCorr({...corr,volume:e.target.value})}/></label><label>Date corrigée<input type="date" value={corr.date} onChange={e=>setCorr({...corr,date:e.target.value})}/></label></div><button className="primary" disabled={busy}>{busy?'Enregistrement…':'Enregistrer la correction'}</button></form>}</Section><Section title="Localisation"><div className="mapfake large"><div className="mapgrid"/><div className="pin">📍</div><span className="maplabel">{field.name}</span></div></Section><Section title="Actions"><div className="quick"><Quick label="Diagnostic IA" onClick={()=>go('ai')}/><Quick label="Carte agricole" onClick={()=>go('map')}/></div></Section>{supabase&&<FieldTools db={supabase} field={field} role={role} go={go}/>}</>}

function Herds({profile,go,setSelectedHerd}:{profile:Profile;go:(s:Screen)=>void;setSelectedHerd:(s:string)=>void}){const {farms,herds,livestockTypes,reload}=useHerdData(profile.id);const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');const [form,setForm]=useState({farm:'',name:'',type:'',headcount:'',region:''});
 useEffect(()=>{if(farms[0]&&!form.farm)setForm(x=>({...x,farm:farms[0].id}))},[farms]);
 async function save(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setMsg('');let farmId=form.farm;if(!farmId){const {data,error}=await supabase.from('farms').insert({owner_id:profile.id,name:'Mon exploitation',area_ha:0,region:form.region||'Ouest'}).select().single();if(error){setMsg(error.message);setBusy(false);return}farmId=data.id}
  const {error}=await supabase.from('herds').insert({farm_id:farmId,name:form.name,livestock_type_id:form.type||null,headcount:Number(form.headcount||0),region:form.region||null});if(error){setMsg(error.message);setBusy(false);return}
  setBusy(false);setOpen(false);setForm({farm:farmId,name:'',type:'',headcount:'',region:''});await reload();
 }
 return <><div className="pageintro"><div><span className="eyebrow">ÉLEVAGE</span><h1>Mon cheptel</h1><p>Gérez vos troupeaux et leur suivi sanitaire.</p></div><button className="primary" onClick={()=>setOpen(true)}>＋ Nouveau troupeau</button></div><div className="farmsummary"><div><span>Effectif total</span><b>{herds.reduce((a,b)=>a+Number(b.headcount||0),0)}</b></div><div><span>Troupeaux</span><b>{herds.length}</b></div><div><span>Espèces</span><b>{new Set(herds.map(h=>h.livestock_type_id).filter(Boolean)).size}</b></div></div><Section title="Mes troupeaux"><div className="fieldgrid">{herds.length?herds.map(h=><button className="fieldcard" key={h.id} onClick={()=>{setSelectedHerd(h.id);go('herd')}}><div className="fieldimage">{livestockEmoji[h.livestock_types?.name||'']||'🐄'}</div><div><span className="badge green">ACTIF</span><h3>{h.name}</h3><p>{h.headcount} têtes • {h.livestock_types?.name||'Espèce non définie'}</p><small>{h.region||'Zone non définie'}</small></div><span>→</span></button>):<Empty text="Aucun troupeau enregistré. Commencez par créer votre premier troupeau." action="Créer un troupeau" onClick={()=>setOpen(true)}/>}</div></Section>{open&&<div className="modal"><form className="modalcard" onSubmit={save}><div className="sectionhead"><h2>Nouveau troupeau</h2><button type="button" onClick={()=>setOpen(false)}>✕</button></div><label>Nom du troupeau<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Espèce<select required value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="">Choisir…</option>{livestockTypes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Effectif<input type="number" min="0" required value={form.headcount} onChange={e=>setForm({...form,headcount:e.target.value})}/></label><label>Zone<input value={form.region} onChange={e=>setForm({...form,region:e.target.value})}/></label>{msg&&<div className="notice">{msg}</div>}<button className="primary wide" disabled={busy}>{busy?'Enregistrement…':'Enregistrer le troupeau'}</button></form></div>}</>}

function HerdDetail({herdId,go}:{herdId:string|null;go:(s:Screen)=>void}){const [herd,setHerd]=useState<Herd|null>(null);const [records,setRecords]=useState<HealthRecord[]>([]);const [loading,setLoading]=useState(true);useEffect(()=>{(async()=>{if(!supabase||!herdId)return;const {data}=await supabase.from('herds').select('*, livestock_types(*)').eq('id',herdId).single();const {data:r}=await supabase.from('herd_health_records').select('*').eq('herd_id',herdId).order('record_date',{ascending:false});setHerd(data as Herd);setRecords((r||[]) as HealthRecord[]);setLoading(false)})()},[herdId]);if(loading)return <Loading/>;if(!herd)return <Empty text="Troupeau introuvable." action="Mon cheptel" onClick={()=>go('herds')}/>;const last=records[0];return <><button className="back" onClick={()=>go('herds')}>← Retour à mon cheptel</button><div className="fieldhero"><div className="fieldphoto">{livestockEmoji[herd.livestock_types?.name||'']||'🐄'}</div><div><span className="badge green">ACTIF</span><h1>{herd.name}</h1><p>{herd.livestock_types?.name||'Espèce'} • {herd.headcount} têtes • {herd.region||'Zone non définie'}</p></div></div><div className="grid3"><div className="metricbig"><span>Dernier contrôle</span><b>{last?fmtDate(last.record_date):'Aucun'}</b><small>Suivi sanitaire</small></div><div className="metricbig"><span>Urgence</span><b>{last?last.urgency:'—'}</b><small>{last?.type||''}</small></div><div className="metricbig"><span>Effectif</span><b>{herd.headcount}</b><small>têtes</small></div></div><Section title="Actions"><div className="quick"><Quick label="Diagnostic vétérinaire IA" onClick={()=>go('ai')}/><Quick label="Marché du bétail" onClick={()=>go('market')}/><Quick label="Financement" onClick={()=>go('financement')}/><Quick label="Intrants" onClick={()=>go('intrants')}/></div></Section><Section title="Historique sanitaire">{records.length?<div className="notifications">{records.map(r=><div className="notif" key={r.id}><span className="notificon">{r.urgency==='eleve'?'⚠':'✓'}</span><div><b>{r.type}</b><p>{r.note}</p><small>{fmtDate(r.record_date)}</small></div></div>)}</div>:<Empty text="Aucun contrôle sanitaire enregistré."/>}</Section></>}

function Market({sector,profile}:{sector:Sector;profile:Profile}){
 const [rows,setRows]=useState<MarketListing[]>([]);const [refPrices,setRefPrices]=useState<ReferencePrice[]>([]);
 const [coop,setCoop]=useState<any[]>([]);
 const [q,setQ]=useState('');const [loading,setLoading]=useState(true);
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');
 const [items,setItems]=useState<(Crop|LivestockType)[]>([]);const [myFarms,setMyFarms]=useState<{id:string;name:string}[]>([]);
 const [mine,setMine]=useState<MarketListing[]>([]);
 const [form,setForm]=useState({item:'',volume:'',price:'',status:'disponible_maintenant' as ListingStatus,from:'',farm:'',pname:'',unit:'kg',units:'',uw:'',desc:''});
 const [photos,setPhotos]=useState<Record<string,string[]>>({});
 const [files,setFiles]=useState<File[]>([]);
 const previews=useMemo(()=>files.map(f=>URL.createObjectURL(f)),[files]);
 useEffect(()=>()=>previews.forEach(u=>URL.revokeObjectURL(u)),[previews]);
 const addInput=useRef<HTMLInputElement>(null);const [addFor,setAddFor]=useState<string|null>(null);
 function pickFiles(e:React.ChangeEvent<HTMLInputElement>){const picked=(Array.from(e.target.files||[]) as File[]);setFiles(prev=>[...prev,...picked].slice(0,MAX_PHOTOS));e.target.value=''}
 async function addPhotosToExisting(e:React.ChangeEvent<HTMLInputElement>){const picked=(Array.from(e.target.files||[]) as File[]);e.target.value='';if(!supabase||!addFor||!picked.length)return;const current=(photos[addFor]||[]).length;const room=MAX_PHOTOS-current;if(room<=0){alert(`Maximum ${MAX_PHOTOS} photos par offre.`);return}setBusy(true);const r=await uploadListingPhotos(supabase,profile.id,addFor,picked.slice(0,room),current);setBusy(false);if(r.error)alert(r.error);load()}
 async function load(){if(!supabase)return;setLoading(true);
  const [l,r,c,co]=await Promise.all([
   supabase.from('market_listings').select('*, crops(*), livestock_types(*)').eq('active',true).eq('moderation_status','publiee').order('created_at',{ascending:false}),
   supabase.from('reference_prices').select('*'),
   sector==='agriculture'?supabase.from('crops').select('*').eq('active',true).order('name'):supabase.from('livestock_types').select('*').eq('active',true).order('name'),
   supabase.from('cooperative_offers').select('*, crops(*), livestock_types(*)').eq('status','ouvert').order('created_at',{ascending:false})
  ]);
  const list=((l.data||[]) as MarketListing[]).filter(x=>sector==='agriculture'?!!x.crop_id:!!x.livestock_type_id);
  setRows(list);setRefPrices((r.data||[]) as ReferencePrice[]);setItems((c.data||[]) as (Crop|LivestockType)[]);
  setCoop(((co.data||[]) as any[]).filter(x=>sector==='agriculture'?!!x.crop_id:!!x.livestock_type_id));
  if(profile.role==='producteur'){const {data:f}=await supabase.from('farms').select('id,name').eq('owner_id',profile.id);setMyFarms((f||[]) as any)}
  let mineIds:string[]=[];
  if(canSellFlag){const {data:m}=await supabase.from('market_listings').select('*, crops(*), livestock_types(*)').eq('seller_id',profile.id).order('created_at',{ascending:false});const ml=((m||[]) as MarketListing[]).filter(x=>sector==='agriculture'?!!x.crop_id:!!x.livestock_type_id);mineIds=ml.map(x=>x.id);setMine(ml)}
  setPhotos(await loadPhotosByListing(supabase,Array.from(new Set([...list.map(x=>x.id),...mineIds]))));
  setLoading(false);
 }
 const canSellFlag=(profile.role==='producteur'&&isProActive(profile))||isAdminRole(profile.role);
 async function soumettre(id:string){if(!supabase)return;const {error}=await supabase.from('market_listings').update({moderation_status:'soumise'}).eq('id',id);if(error)alert(error.message);else load()}
 useEffect(()=>{load()},[sector,profile.id]);
 useEffect(()=>{if(myFarms[0]&&!form.farm)setForm(x=>({...x,farm:myFarms[0].id}))},[myFarms]);
 function refFor(itemId:string){const rp=refPrices.find(r=>sector==='agriculture'?r.crop_id===itemId:r.livestock_type_id===itemId);return rp||null}
 async function publish(e:React.FormEvent){e.preventDefault();if(!supabase)return;
  if(files.length<MIN_PHOTOS){setMsg(`Ajoutez au moins ${MIN_PHOTOS} photos de l’offre (${files.length} pour le moment).`);return}
  setBusy(true);setMsg('');
  const units=Number(form.units),uw=Number(form.uw);const kgTotal=form.unit==='kg'?units:form.unit==='tonne'?units*1000:units*uw;if(!(kgTotal>0)){setMsg('Quantité ou poids unitaire invalide.');return}
  const payload:any={seller_id:profile.id,farm_id:form.farm||null,volume_kg:kgTotal,price_per_kg:Number(form.price),status:form.status,available_from:form.from||null,product_name:form.pname.trim()||null,note:form.desc.trim()||null,sale_unit:form.unit,units_available:units,unit_weight_kg:['kg','tonne'].includes(form.unit)?null:uw};
  if(sector==='agriculture')payload.crop_id=form.item;else payload.livestock_type_id=form.item;
  const {data:created,error}=await supabase.from('market_listings').insert(payload).select('id').single();
  if(error||!created){setBusy(false);setMsg(error?.message||'Création de l’offre impossible.');return}
  const r=await uploadListingPhotos(supabase,profile.id,created.id,files,0);
  setBusy(false);setOpen(false);setFiles([]);setForm({item:'',volume:'',price:'',status:'disponible_maintenant',from:'',farm:form.farm,pname:'',unit:'kg',units:'',uw:'',desc:''});
  if(r.error||r.saved<MIN_PHOTOS){setMsg(`Offre enregistrée en brouillon, mais seulement ${r.saved} photo(s) envoyée(s)${r.error?' ('+r.error+')':''}. Dans « Mes offres », ajoutez les photos manquantes puis soumettez l’offre.`)}
  else alert('Offre enregistrée en brouillon avec ses photos. Retrouvez-la dans "Mes offres" pour la soumettre à validation.');
  load();
 }
 async function commit(offerId:string,farmId:string){if(!supabase)return;const vol=window.prompt('Quantité (kg) que vous engagez sur cette offre groupée ?');if(!vol)return;const {error}=await supabase.from('commitments').insert({offer_id:offerId,farm_id:farmId,volume_kg:Number(vol)});if(error)alert(error.message);else{alert('Engagement enregistré.');load()}}
 const filtered=rows.filter(x=>{const label=sector==='agriculture'?x.crops?.name:x.livestock_types?.name;return (label||'').toLowerCase().includes(q.toLowerCase())});
 const modLabel:Record<string,string>={brouillon:'Brouillon',soumise:'Soumise — en attente',en_controle:'En contrôle',modification_demandee:'Modification demandée',validee:'Validée',publiee:'Publiée',suspendue:'Suspendue',refusee:'Refusée',expiree:'Expirée'};
 return <><div className="pageintro"><div><span className="eyebrow">{sector==='agriculture'?'COMMERCE AGRICOLE':'COMMERCE DU BÉTAIL'}</span><h1>Marché DulyAgrivia</h1><p>Offres publiées par les producteurs, avec prix de référence DulyAgrivia affiché à titre indicatif, distinct du prix fixé par chaque vendeur.</p></div>{canSellFlag&&<button className="primary" onClick={()=>setOpen(true)}>＋ Publier une offre</button>}{profile.role==='producteur'&&!isProActive(profile)&&<span className="badge">Passez PRO pour publier une offre</span>}</div>
  {canSellFlag&&mine.length>0&&<Section title="Mes offres (tous statuts)"><input ref={addInput} type="file" accept="image/*" multiple style={{display:'none'}} onChange={addPhotosToExisting}/><div className="adminlist">{mine.map(m=>{const label=sector==='agriculture'?m.crops?.name:m.livestock_types?.name;return <div key={m.id}><b>{label||'—'} — {Number(m.volume_kg).toLocaleString('fr-FR')} kg</b><span className={'badge '+(m.moderation_status==='publiee'?'green':(m.moderation_status==='refusee'?'danger':''))}>{modLabel[m.moderation_status]}</span><span className="muted">📷 {(photos[m.id]||[]).length} photo(s)</span>{(m.moderation_status==='brouillon'||m.moderation_status==='modification_demandee')&&(photos[m.id]||[]).length<MAX_PHOTOS&&<button className="secondary" disabled={busy} onClick={()=>{setAddFor(m.id);addInput.current?.click()}}>＋ Photos</button>}{m.moderation_status==='brouillon'&&<button className="secondary" disabled={(photos[m.id]||[]).length<MIN_PHOTOS} onClick={()=>soumettre(m.id)}>Soumettre pour validation</button>}{(m.moderation_status==='modification_demandee')&&<button className="secondary" disabled={(photos[m.id]||[]).length<MIN_PHOTOS} onClick={()=>soumettre(m.id)}>Resoumettre</button>}{(m.moderation_status==='brouillon'||m.moderation_status==='modification_demandee')&&(photos[m.id]||[]).length<MIN_PHOTOS&&<p className="muted">Il faut au moins {MIN_PHOTOS} photos pour soumettre cette offre.</p>}{m.moderation_note&&(m.moderation_status==='modification_demandee'||m.moderation_status==='refusee')&&<p className="muted">Motif : {m.moderation_note}</p>}</div>})}</div></Section>}
  <div className="searchrow"><div className="search">⌕<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher…"/></div></div>
  {loading?<Loading/>:<div className="marketgrid">{filtered.length?filtered.map(l=>{const label=sector==='agriculture'?l.crops?.name:l.livestock_types?.name;const emoji=sector==='agriculture'?(cropEmoji[label||'']||'🌱'):(livestockEmoji[label||'']||'🐄');const rp=refFor(sector==='agriculture'?(l.crop_id||''):(l.livestock_type_id||''));return <div className="marketcard" key={l.id}><div className="marketvisual">{(photos[l.id]||[])[0]?<img className="marketphoto" src={photoUrl(supabase as any,photos[l.id][0])} alt={label||'Offre'} loading="lazy"/>:emoji}<span className="badge green">{listingStatusLabel[l.status]}</span></div>{(photos[l.id]||[]).length>1&&<div className="thumbstrip">{photos[l.id].slice(1,MAX_PHOTOS).map(p=><img key={p} src={photoUrl(supabase as any,p)} alt="" loading="lazy"/>)}</div>}<div className="marketbody"><span className="eyebrow">{label||'—'}{(l as any).is_demo?' • DÉMO':''}</span><h2>{(l as any).product_name||label||'Offre'}</h2><p style={{margin:'2px 0'}}>Quantité : <b>{unitSummary(l)}</b></p><div className="twocol"><div><span>Prix du vendeur</span><b>{Number(l.price_per_kg).toLocaleString('fr-FR')} {l.currency}/kg</b>{pricePerUnit(l)!==null&&<small className="muted"> ≈ {Number(pricePerUnit(l)).toLocaleString('fr-FR')} {l.currency}/{(l as any).sale_unit}</small>}</div><div><span>Prix de référence DulyAgrivia</span><b>{rp?`${Number(rp.price_per_kg).toLocaleString('fr-FR')} ${rp.currency}/kg`:'Non défini'}</b></div></div>{l.available_from&&<div className="row muted"><span>📅 Disponible à partir du {fmtDate(l.available_from)}</span></div>}{l.note&&<p>{l.note}</p>}</div></div>}):<Empty text="Aucune offre ne correspond à votre recherche."/>}</div>}
  {coop.length>0&&<Section title="Ventes groupées (mise en commun entre producteurs)"><div className="tenderlist">{coop.map((o:any)=>{const label=sector==='agriculture'?o.crops?.name:o.livestock_types?.name;return <div className="tender" key={o.id}><div className="cropicon">🤝</div><div className="tendermain"><span className="badge green">OUVERTE</span><h3>{label||'—'} • objectif {Number(o.target_volume_kg||0).toLocaleString('fr-FR')} kg</h3><p>{o.price_per_kg?`${Number(o.price_per_kg).toLocaleString('fr-FR')} FCFA/kg • `:''}{o.payment_terms||'Conditions à préciser'}{o.harvest_date?` • récolte ${fmtDate(o.harvest_date)}`:''}</p></div>{profile.role==='producteur'&&myFarms[0]&&<div className="tenderright"><button className="secondary" onClick={()=>commit(o.id,myFarms[0].id)}>S’engager</button></div>}</div>})}</div></Section>}
  {msg&&<div className="notice">{msg}</div>}
  {open&&<div className="modal"><form className="modalcard" onSubmit={publish}><div className="sectionhead"><h2>Publier une offre</h2><button type="button" onClick={()=>setOpen(false)}>✕</button></div><label>{sector==='agriculture'?'Culture':'Espèce'}<select required value={form.item} onChange={e=>setForm({...form,item:e.target.value})}><option value="">Choisir…</option>{items.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{myFarms.length>1&&<label>Exploitation<select value={form.farm} onChange={e=>setForm({...form,farm:e.target.value})}>{myFarms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}<label>Nom du produit (ex : Tomates rondes calibre moyen)<input maxLength={120} value={form.pname} onChange={e=>setForm({...form,pname:e.target.value})}/></label><label>Description / caractéristiques (qualité, calibre, variété, conditionnement…)<textarea maxLength={1500} rows={3} value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})}/></label><label>Vendu en<select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}>{SALE_UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></label><label>Quantité disponible ({form.unit})<input type="number" min="0.01" step="any" required value={form.units} onChange={e=>setForm({...form,units:e.target.value})}/></label>{!['kg','tonne'].includes(form.unit)&&<label>Poids d’un(e) {form.unit} (kg)<input type="number" min="0.01" step="any" required value={form.uw} onChange={e=>setForm({...form,uw:e.target.value})}/></label>}<label>Votre prix (par kg)<input type="number" min="0" required value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label>Statut de vente<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as ListingStatus})}><option value="disponible_maintenant">Disponible maintenant</option><option value="prochainement">Prochainement</option><option value="programmee">Vente programmée</option><option value="appel_offres">Ouverte aux appels d’offres</option></select></label><label>Disponible à partir du<input type="date" value={form.from} onChange={e=>setForm({...form,from:e.target.value})}/></label><label>Photos de l’offre ({MIN_PHOTOS} minimum, {MAX_PHOTOS} maximum)<input type="file" accept="image/*" multiple onChange={pickFiles}/></label><div className="thumbs">{previews.map((u,i)=><div key={u} className="thumb"><img src={u} alt=""/><button type="button" aria-label="Retirer" onClick={()=>setFiles(files.filter((_,j)=>j!==i))}>✕</button></div>)}</div><p className="muted" style={{marginTop:0}}>{files.length}/{MIN_PHOTOS} photos minimum{files.length>=MIN_PHOTOS?' ✓':''}</p><button className="primary wide" disabled={busy||files.length<MIN_PHOTOS}>{busy?'Publication et envoi des photos…':'Publier'}</button></form></div>}
 </>;
}

function Tenders({profile,sector,setToast}:{profile:Profile;sector:Sector;setToast:(s:string)=>void}){
 const [rows,setRows]=useState<Tender[]>([]);const [crops,setCrops]=useState<Crop[]>([]);const [livestockTypes,setLivestockTypes]=useState<LivestockType[]>([]);
 const [myFields,setMyFields]=useState<Field[]>([]);const [myHerds,setMyHerds]=useState<Herd[]>([]);
 const [responses,setResponses]=useState<Record<string,TenderResponse[]>>({});
 const [open,setOpen]=useState(false);const [form,setForm]=useState({item:'',volume:'',from:'',to:'',tol:'15',price:'',zone:'',desc:'',unit:''});const [busy,setBusy]=useState(false);
 const [respondTo,setRespondTo]=useState<Tender|null>(null);const [rform,setRform]=useState({target:'',volume:'',date:'',note:''});
 const canRespond=profile.role==='producteur'||isAdminRole(profile.role);const [mine,setMine]=useState<any[]>([]);const canBuy=profile.role==='acheteur'||isAdminRole(profile.role); // acheteur ET admin/super_admin peuvent publier un appel d'offres (ex: le promoteur qui sollicite ses producteurs affiliés pour compléter une commande)
 async function load(){if(!supabase)return;
  const query=profile.role==='acheteur'?supabase.from('tenders').select('*, crops(*), livestock_types(*)').eq('buyer_id',profile.id).order('created_at',{ascending:false}):isAdminRole(profile.role)?supabase.from('tenders').select('*, crops(*), livestock_types(*)').order('created_at',{ascending:false}):supabase.from('tenders').select('*, crops(*), livestock_types(*)').eq('status','open').order('created_at',{ascending:false});
  const [t,c,lt]=await Promise.all([query,supabase.from('crops').select('*').eq('active',true),supabase.from('livestock_types').select('*').eq('active',true)]);
  const list=((t.data||[]) as Tender[]).filter(x=>sector==='agriculture'?!!x.crop_id:!!x.livestock_type_id);
  setRows(list);setCrops((c.data||[]) as Crop[]);setLivestockTypes((lt.data||[]) as LivestockType[]);
  if(canRespond){const [f,h]=await Promise.all([supabase.from('fields').select('*, crops(*), farms!inner(owner_id)').eq('farms.owner_id',profile.id),supabase.from('herds').select('*, livestock_types(*), farms!inner(owner_id)').eq('farms.owner_id',profile.id)]);setMyFields((f.data||[]) as Field[]);setMyHerds((h.data||[]) as Herd[]);const mr=await supabase.from('tender_responses').select('*, fields(name), herds(name)').eq('producer_id',profile.id).order('created_at',{ascending:false});setMine((mr.data||[]) as any[])}
  if(canBuy&&list.length){const {data:r}=await supabase.from('tender_responses').select('*, fields(name), herds(name), profiles(full_name)').in('tender_id',list.map(x=>x.id));const grouped:Record<string,TenderResponse[]>={};(r||[]).forEach((x:any)=>{(grouped[x.tender_id]=grouped[x.tender_id]||[]).push(x)});setResponses(grouped)}
 }
 useEffect(()=>{load()},[profile.id,profile.role,sector]);
 async function create(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);const payload:any={buyer_id:profile.id,volume_kg:Number(form.volume),delivery_from:form.from||null,delivery_to:form.to||null,tolerance_days:Number(form.tol),price_note:form.price||null,delivery_zone:form.zone||null,description:form.desc.trim()||null,preferred_unit:form.unit||null};if(sector==='agriculture')payload.crop_id=form.item;else payload.livestock_type_id=form.item;const {error}=await supabase.from('tenders').insert(payload);setBusy(false);if(error)setToast(error.message);else{setToast('Appel d’offres publié.');setOpen(false);setForm({item:'',volume:'',from:'',to:'',tol:'15',price:'',zone:'',desc:'',unit:''});load()}}
 // Réponse réelle du producteur : sélection d'un champ ou d'un troupeau compatible, puis insertion dans tender_responses.
 async function sendResponse(e:React.FormEvent){e.preventDefault();if(!supabase||!respondTo)return;if(!rform.target){setToast(sector==='agriculture'?'Choisissez un champ.':'Choisissez un troupeau.');return}setBusy(true);
  const payload:any={tender_id:respondTo.id,producer_id:profile.id,offered_volume_kg:Number(rform.volume),estimated_harvest_date:rform.date||null,note:rform.note||null,status:'pending'};
  if(sector==='agriculture')payload.field_id=rform.target;else payload.herd_id=rform.target;
  const {error}=await supabase.from('tender_responses').insert(payload);setBusy(false);
  if(error)setToast(error.message);else{setToast('Proposition envoyée à l’acheteur.');setRespondTo(null);setRform({target:'',volume:'',date:'',note:''});load()}
 }
 async function decide(id:string,status:'accepted'|'rejected'){if(!supabase)return;const {error}=await supabase.from('tender_responses').update({status}).eq('id',id);if(error)setToast(error.message);else{setToast(status==='accepted'?'Proposition acceptée.':'Proposition refusée.');load()}}
 const options=sector==='agriculture'?crops:livestockTypes;
 const targets=sector==='agriculture'?myFields:myHerds;
 return <><div className="pageintro"><div><span className="eyebrow">COMMANDE À L’AVANCE</span><h1>Appels d’offres</h1><p>{canBuy?'Publiez vos besoins et recevez des propositions.':'Les besoins qui correspondent à vos productions.'}</p></div>{canBuy&&<button className="primary" onClick={()=>setOpen(true)}>＋ Créer un appel</button>}</div><div className="tenderlist">{rows.length?rows.map(t=>{const label=sector==='agriculture'?t.crops?.name:t.livestock_types?.name;const emoji=sector==='agriculture'?(cropEmoji[label||'']||'🌱'):(livestockEmoji[label||'']||'🐄');const list=responses[t.id]||[];return <div className="tender" key={t.id}><div className="cropicon">{emoji}</div><div className="tendermain"><span className="badge green">{t.status==='open'?'OUVERT':'FERMÉ'}</span>{(t as any).is_demo&&<span className="badge"> DÉMO</span>}<h3>{label||'—'}</h3><p>{Number(t.volume_kg).toLocaleString('fr-FR')} kg • {fmtDate(t.delivery_from)} – {fmtDate(t.delivery_to)} • {t.delivery_zone||'Zone non définie'}</p>{t.description&&<p>{t.description}</p>}{(t.preferred_unit||t.price_note)&&<p className="muted">{t.preferred_unit?`Conditionnement : ${t.preferred_unit}`:''}{t.preferred_unit&&t.price_note?' • ':''}{t.price_note||''}</p>}{canBuy&&<div className="notifications">{list.length?list.map(r=><div className="notif" key={r.id}><span className="notificon">{r.status==='accepted'?'✓':r.status==='rejected'?'✕':'…'}</span><div><b>{r.profiles?.full_name||'Producteur'}</b><p>{r.fields?.name||r.herds?.name||''} • {Number(r.offered_volume_kg).toLocaleString('fr-FR')} kg{r.estimated_harvest_date?` • ${fmtDate(r.estimated_harvest_date)}`:''}</p>{r.status==='pending'&&<div className="quick"><button className="secondary" onClick={()=>decide(r.id,'accepted')}>Accepter</button><button className="secondary" onClick={()=>decide(r.id,'rejected')}>Refuser</button></div>}</div></div>):<small>Aucune proposition reçue pour le moment.</small>}</div>}</div><div className="tenderright">{canRespond&&t.buyer_id!==profile.id&&t.status==='open'&&<button className="secondary" onClick={()=>setRespondTo(t)}>{mine.some((m:any)=>m.tender_id===t.id)?'Répondre à nouveau':'Répondre'}</button>}</div></div>}):<Empty text={canBuy?'Vous n’avez encore publié aucun appel d’offres.':'Aucun appel d’offres ouvert pour le moment.'}/>}</div>
 {canRespond&&<section className="section" style={{marginTop:18}}><div className="sectionhead"><h2>Mes propositions envoyées</h2></div>{mine.length?<div className="adminlist">{mine.map((m:any)=>{const tt=rows.find(x=>x.id===m.tender_id);const lbl=tt?(tt.crops?.name||tt.livestock_types?.name):'Appel d’offres';return <div key={m.id}><b>{lbl||'Appel d’offres'} • {Number(m.offered_volume_kg).toLocaleString('fr-FR')} kg<br/><small className="muted">{m.fields?.name||m.herds?.name||''}{m.estimated_harvest_date?` • ${fmtDate(m.estimated_harvest_date)}`:''}{m.is_demo?' • DÉMO':''}</small></b><span className={'badge '+(m.status==='accepted'?'green':'')}>{m.status==='accepted'?'ACCEPTÉE':m.status==='rejected'?'REFUSÉE':'EN ATTENTE'}</span></div>})}</div>:<p className="muted">Vous n’avez encore envoyé aucune proposition.</p>}</section>}
 {open&&<div className="modal"><form className="modalcard" onSubmit={create}><div className="sectionhead"><h2>Créer un appel d’offres</h2><button type="button" onClick={()=>setOpen(false)}>✕</button></div><label>{sector==='agriculture'?'Culture':'Espèce'}<select required value={form.item} onChange={e=>setForm({...form,item:e.target.value})}><option value="">Choisir…</option>{options.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Volume demandé (kg)<input type="number" min="1" required value={form.volume} onChange={e=>setForm({...form,volume:e.target.value})}/></label><div className="gpsrow"><label>Du<input type="date" value={form.from} onChange={e=>setForm({...form,from:e.target.value})}/></label><label>Au<input type="date" value={form.to} onChange={e=>setForm({...form,to:e.target.value})}/></label></div><label>Tolérance (jours)<input type="number" min="0" value={form.tol} onChange={e=>setForm({...form,tol:e.target.value})}/></label><label>Caractéristiques demandées (qualité, calibre, variété, normes…)<textarea maxLength={1500} rows={3} value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})}/></label><label>Conditionnement souhaité<select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}><option value="">Peu importe</option>{SALE_UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></label><label>Prix / conditions<textarea value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label>Zone de livraison<input value={form.zone} onChange={e=>setForm({...form,zone:e.target.value})}/></label><button className="primary wide" disabled={busy}>{busy?'Publication…':'Publier l’appel d’offres'}</button></form></div>}
 {respondTo&&<div className="modal"><form className="modalcard" onSubmit={sendResponse}><div className="sectionhead"><h2>Répondre à cet appel</h2><button type="button" onClick={()=>setRespondTo(null)}>✕</button></div><label>{sector==='agriculture'?'Champ disponible':'Troupeau disponible'}<select required value={rform.target} onChange={e=>setRform({...rform,target:e.target.value})}><option value="">Choisir…</option>{targets.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Quantité proposée (kg)<input type="number" min="1" required value={rform.volume} onChange={e=>setRform({...rform,volume:e.target.value})}/></label><label>Date estimée<input type="date" value={rform.date} onChange={e=>setRform({...rform,date:e.target.value})}/></label><label>Commentaire<textarea value={rform.note} onChange={e=>setRform({...rform,note:e.target.value})}/></label><button className="primary wide" disabled={busy}>{busy?'Envoi…':'Envoyer ma proposition'}</button></form></div>}
 </>}

// Superficie d’un polygone (sommets en lat/lng) par projection équirectangulaire locale autour
// du centroïde puis formule du lacet (shoelace) — précision suffisante à l’échelle d’une parcelle.
function polygonAreaHa(points:{lat:number;lng:number}[]):number{
 if(points.length<3)return 0;
 const latRad=points.reduce((a,p)=>a+p.lat,0)/points.length*Math.PI/180;
 const mPerDegLat=111320,mPerDegLng=111320*Math.cos(latRad);
 const xy=points.map(p=>({x:p.lng*mPerDegLng,y:p.lat*mPerDegLat}));
 let sum=0;for(let i=0;i<xy.length;i++){const a=xy[i],b=xy[(i+1)%xy.length];sum+=a.x*b.y-b.x*a.y}
 return Math.abs(sum/2)/10000; // m² → ha
}
function MapScreen({profile}:{profile:Profile}){
 const mapDivRef=useRef<HTMLDivElement|null>(null);const mapRef=useRef<any>(null);const layerRef=useRef<any>(null);const drawLayerRef=useRef<any>(null);
 const [pos,setPos]=useState<{lat:number;lng:number;accuracy:number}|null>(null);const [msg,setMsg]=useState('');const [locating,setLocating]=useState(false);
 const [fields,setFields]=useState<Field[]>([]);const [drawingFieldId,setDrawingFieldId]=useState('');const [drawing,setDrawing]=useState(false);
 const [points,setPoints]=useState<{lat:number;lng:number}[]>([]);const [saving,setSaving]=useState(false);
 async function loadFields(){if(!supabase)return;let q=supabase.from('fields').select('*, crops(*)');if(profile.role==='producteur'){const {data:f}=await supabase.from('farms').select('id').eq('owner_id',profile.id);const farmIds=(f||[]).map((x:any)=>x.id);if(!farmIds.length){setFields([]);return}q=q.in('farm_id',farmIds)}const {data}=await q.limit(500);setFields((data||[]) as Field[])}
 useEffect(()=>{loadFields()},[profile.id]);
 // Initialise la carte Leaflet une seule fois (bibliothèque chargée globalement via CDN dans index.html).
 useEffect(()=>{
  const L=(window as any).L;if(!L||!mapDivRef.current||mapRef.current)return;
  mapRef.current=L.map(mapDivRef.current).setView([5.48,10.41],13); // Ouest Cameroun par défaut
  const osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19});const esri=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Imagery © Esri',maxZoom:19});esri.addTo(mapRef.current);L.control.layers({'Satellite':esri,'Plan':osm}).addTo(mapRef.current);
  layerRef.current=L.layerGroup().addTo(mapRef.current);
  drawLayerRef.current=L.layerGroup().addTo(mapRef.current);
  mapRef.current.on('click',(e:any)=>{setDrawing(d=>{if(d){setPoints(pp=>[...pp,{lat:e.latlng.lat,lng:e.latlng.lng}])}return d});});
  return ()=>{mapRef.current?.remove();mapRef.current=null};
 },[]);
 // Redessine les parcelles existantes à chaque changement.
 useEffect(()=>{
  const L=(window as any).L;if(!L||!layerRef.current)return;
  layerRef.current.clearLayers();
  fields.forEach(f=>{
   if(f.boundary&&f.boundary.length>=3){
    L.polygon(f.boundary.map(p=>[p.lat,p.lng]),{color:'#22c55e',weight:3,fillOpacity:0.25}).addTo(layerRef.current).bindPopup(`<b>${f.name}</b><br/>${f.crops?.name||''} — ${Number(f.boundary_area_ha||f.area_ha||0).toFixed(2)} ha`).bindTooltip(`${f.name} • ${Number(f.boundary_area_ha||f.area_ha||0).toFixed(2)} ha`,{permanent:true,direction:'center'});
   } else if(f.latitude&&f.longitude){
    L.marker([f.latitude,f.longitude]).addTo(layerRef.current).bindPopup(`<b>${f.name}</b>`);
   }
  });
  const pts:any[]=[];fields.forEach(f=>{if(f.boundary&&f.boundary.length>=3)f.boundary.forEach(p=>pts.push([p.lat,p.lng]));else if(f.latitude&&f.longitude)pts.push([f.latitude,f.longitude])});
  if(pts.length&&mapRef.current)mapRef.current.fitBounds(pts,{maxZoom:17,padding:[30,30]});
 },[fields]);
 // Redessine le tracé en cours.
 useEffect(()=>{
  const L=(window as any).L;if(!L||!drawLayerRef.current)return;
  drawLayerRef.current.clearLayers();
  if(points.length)L.polyline(points.map(p=>[p.lat,p.lng]).concat(points.length>2?[[points[0].lat,points[0].lng]]:[]),{color:'#ef4444',weight:3,dashArray:'6 6'}).addTo(drawLayerRef.current);
  points.forEach(p=>L.circleMarker([p.lat,p.lng],{radius:5,color:'#ef4444'}).addTo(drawLayerRef.current));
 },[points]);
 function locate(){if(!navigator.geolocation){setMsg('Le GPS n’est pas disponible sur cet appareil.');return}setLocating(true);setMsg('Recherche de la position…');navigator.geolocation.getCurrentPosition(p=>{setPos({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy});setMsg('Position obtenue.');setLocating(false);mapRef.current?.setView([p.coords.latitude,p.coords.longitude],16);},err=>{setLocating(false);if(err.code===err.PERMISSION_DENIED)setMsg('Autorisation GPS refusée. Activez la localisation pour cette application.');else if(err.code===err.TIMEOUT)setMsg('Délai dépassé, réessayez.');else setMsg('Position GPS indisponible pour le moment.');},{enableHighAccuracy:true,timeout:10000})}
 function startDrawing(){if(!drawingFieldId){setMsg('Choisissez d’abord un champ.');return}setPoints([]);setDrawing(true);setMsg('Touchez la carte pour poser chaque coin de la parcelle, puis "Terminer le tracé".')}
 function cancelDrawing(){setDrawing(false);setPoints([])}
 async function saveDrawing(){
  if(!supabase||points.length<3){setMsg('Il faut au moins 3 points pour fermer un polygone.');return}
  setSaving(true);const area=polygonAreaHa(points);
  const {error}=await supabase.from('fields').update({boundary:points,boundary_area_ha:Number(area.toFixed(3)),latitude:Number((points.reduce((a,p)=>a+p.lat,0)/points.length).toFixed(6)),longitude:Number((points.reduce((a,p)=>a+p.lng,0)/points.length).toFixed(6))}).eq('id',drawingFieldId);
  setSaving(false);
  if(error){setMsg(error.message);return}
  setMsg(`Parcelle enregistrée — superficie calculée : ${area.toFixed(2)} ha.`);setDrawing(false);setPoints([]);loadFields();
 }
 return <><div className="pageintro"><div><span className="eyebrow">GÉOAGRICULTURE</span><h1>Carte agricole</h1><p>Vos parcelles enregistrées s’affichent sur la carte. {profile.role==='producteur'||isAdminRole(profile.role)?'Dessinez le contour d’un champ pour calculer automatiquement sa superficie.':''}</p></div><button className="primary" onClick={locate} disabled={locating}>{locating?'Recherche…':'📍 Ma position'}</button></div>
  {(profile.role==='producteur'||isAdminRole(profile.role))&&fields.length>0&&<div className="tender" style={{marginBottom:12}}><div className="tendermain">{!drawing?<><label>Champ à délimiter<select value={drawingFieldId} onChange={e=>setDrawingFieldId(e.target.value)}><option value="">Choisir…</option>{fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><button className="secondary" onClick={startDrawing}>✏️ Dessiner le polygone sur la carte</button></>:<><p>{points.length} point(s) posé(s). Touchez la carte pour continuer, ou validez.</p><div className="quick"><Quick label="Terminer et enregistrer" onClick={saveDrawing}/><Quick label="Annuler" onClick={cancelDrawing}/></div></>}</div></div>}
  <div ref={mapDivRef} style={{width:'100%',height:420,borderRadius:12,overflow:'hidden'}}/>
  {pos&&<div className="maplegend" style={{marginTop:8}}><b>Position</b><span>{`${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} (± ${Math.round(pos.accuracy)} m)`}</span></div>}
  {msg&&<div className="notice">{msg}</div>}
 </>;
}

type Diagnosis = { id:string; sector:Sector; condition_label:string|null; confidence:'faible'|'moyenne'|'elevee'|null; recommendation:string|null; raw_response:any; created_at:string; image_paths?:string[]|null; is_demo?:boolean; treatment_product?:string|null; treatment_dosage?:string|null; treatment_precautions?:string|null };
const confidenceLabel:Record<string,string>={faible:'Confiance faible',moyenne:'Confiance moyenne',elevee:'Confiance élevée'};
function fileToBase64(file:File):Promise<{data:string;mediaType:string}>{
 return new Promise((resolve,reject)=>{
  const r=new FileReader();
  r.onload=()=>{const result=r.result as string;const [, mediaType, data]=result.match(/^data:(.+);base64,(.*)$/)||[];if(!data){reject(new Error('Lecture image impossible'));return}resolve({data,mediaType:mediaType||file.type})};
  r.onerror=()=>reject(new Error('Lecture image impossible'));
  r.readAsDataURL(file);
 });
}
function AI({sector,profile,onBack}:{sector:Sector;profile:Profile;onBack?:()=>void}){
 const isAgri=sector==='agriculture';
 const [preview,setPreview]=useState<string|null>(null);const [file,setFile]=useState<File|null>(null);
 const [note,setNote]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [result,setResult]=useState<any>(null);
 const [history,setHistory]=useState<Diagnosis[]>([]);const [loadingHistory,setLoadingHistory]=useState(true);const [okMsg,setToastLocal]=useState('');const [archived,setArchived]=useState(false);const [thumbs,setThumbs]=useState<Record<string,string>>({});const [openDiag,setOpenDiag]=useState<string|null>(null);
 useEffect(()=>{setArchived(false);setToastLocal('')},[file]);
 const [linkedField]=useState<string|null>(()=>{try{return sessionStorage.getItem('duly_ai_field')}catch{return null}});
 async function loadHistory(){if(!supabase)return;setLoadingHistory(true);const {data}=await supabase.from('ai_diagnoses').select('*').eq('sector',sector).order('created_at',{ascending:false}).limit(30);const list=(data||[]) as Diagnosis[];setHistory(list);setLoadingHistory(false);const paths=list.flatMap(h=>h.image_paths||[]);if(paths.length){const {data:signed}=await supabase.storage.from('diagnostic-photos').createSignedUrls(paths,3600);const m:Record<string,string>={};(signed||[]).forEach((x:any)=>{if(x.path&&x.signedUrl)m[x.path]=x.signedUrl});setThumbs(m)}}
 useEffect(()=>{loadHistory();setResult(null);setPreview(null);setFile(null);setError('')},[sector]);
 function onPick(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];e.target.value='';if(!f)return;setFile(f);setResult(null);setError('');setPreview(prev=>{if(prev&&prev.startsWith('blob:')){try{URL.revokeObjectURL(prev)}catch{}}try{return URL.createObjectURL(f)}catch{return null}})}
 async function savePhoto(diagId:string,photo:File){if(!supabase)return false;const path=`${profile.id}/${diagId}.jpg`;const up=await supabase.storage.from('diagnostic-photos').upload(path,photo,{contentType:'image/jpeg',upsert:true});if(up.error){setError('Analyse enregistrée, mais la photo n’a pas pu être sauvegardée : '+up.error.message);return false}const {error:e2}=await supabase.from('ai_diagnoses').update({image_paths:[path]}).eq('id',diagId);if(e2){setError('Photo envoyée mais non rattachée : '+e2.message);return false}return true}
 // Archive la photo dans l'historique de l'utilisateur (sans inventer d'analyse) : appelé automatiquement si l'analyse échoue, ou à la main.
 async function archiveOnly(small:File):Promise<boolean>{
  if(!supabase)return false;
  const {data,error:e}=await supabase.from('ai_diagnoses').insert({user_id:profile.id,sector,field_id:linkedField||null,condition_label:'Photo enregistrée — analyse non effectuée',recommendation:note||null,raw_response:{pending_analysis:true,note:note||null},model:null}).select().single();
  if(e||!data){setError(e?.message||'Enregistrement impossible.');return false}
  const ok=await savePhoto(data.id,small);if(ok){setArchived(true);loadHistory()}return ok;
 }
 async function saveOnly(){
  if(!file||busy)return;setBusy(true);setError('');
  try{const small=new File([await compressImage(file,1280,0.82)],'photo.jpg',{type:'image/jpeg'});const ok=await archiveOnly(small);if(ok)setToastLocal('Photo enregistrée dans votre historique (ci-dessous).')}catch(err:any){setError(err.message||'Erreur inattendue.')}
  setBusy(false);
 }
 async function analyser(){
  if(!supabase||!file)return;setBusy(true);setError('');setResult(null);
  try{
   const small=new File([await compressImage(file,1280,0.82)],'photo.jpg',{type:'image/jpeg'});const {data:imgData,mediaType}=await fileToBase64(small);
   const {data,error:fnError}=await supabase.functions.invoke('diagnose-image',{body:{imageBase64:imgData,mediaType,sector,note:note||undefined,field_id:linkedField||undefined}});
   if(fnError){const ok=await archiveOnly(small);setError('Le service d’analyse n’est pas joignable pour le moment.'+(ok?' Votre photo est enregistrée dans l’historique.':''));setBusy(false);return}
   if(data?.error==='not_configured'){const ok=await archiveOnly(small);setError('Le diagnostic IA n’est pas encore activé sur le serveur (clé API en attente de configuration).'+(ok?' Votre photo est enregistrée dans l’historique.':''));setBusy(false);return}
   if(data?.error){const ok=await archiveOnly(small);setError((data.message||'Analyse impossible pour le moment.')+(ok?' Votre photo est enregistrée dans l’historique.':''));setBusy(false);return}
   setResult(data.result);if(data.result?.id)await savePhoto(data.result.id,small);loadHistory();try{sessionStorage.removeItem('duly_ai_field')}catch{}
  }catch(e:any){setError(e.message||'Erreur inattendue pendant l’analyse.')}
  setBusy(false);
 }
 return <>{linkedField&&onBack&&<button className="back" onClick={onBack}>← Retour au champ</button>}<div className="pageintro"><div><span className="eyebrow">{isAgri?'ASSISTANT AGRICOLE':'ASSISTANT VÉTÉRINAIRE'}</span><h1>{isAgri?<>AgroDoctor <em>IA</em></>:<>VétoDoctor <em>IA</em></>}</h1><p>Prenez une photo {isAgri?'de la plante concernée':'de l’animal concerné'} pour une estimation indicative. Ceci ne remplace jamais {isAgri?'un agronome':'un vétérinaire'} en cas de doute sérieux.</p></div></div>
  <div className="aiupload">
   {preview?<img src={preview} alt="aperçu" style={{maxWidth:'100%',borderRadius:12,marginBottom:12}}/>:<div className="aiorb">✦</div>}
   <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}><label className="secondary" style={{display:'inline-block',cursor:'pointer'}}>📷 {file?'Reprendre une photo':'Prendre une photo'}<input type="file" accept="image/*" capture="environment" onChange={onPick} style={{display:'none'}}/></label><label className="secondary" style={{display:'inline-block',cursor:'pointer'}}>🖼️ Choisir dans la galerie<input type="file" accept="image/*" onChange={onPick} style={{display:'none'}}/></label></div>
   {file&&<><label style={{marginTop:10}}>Remarque (optionnel)<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex : taches depuis 3 jours, feuilles jaunes…"/></label>
   <button className="primary wide" style={{marginTop:10}} disabled={busy} onClick={analyser}>{busy?'Analyse en cours…':'Analyser cette photo'}</button></>}
   {error&&<div className="notice">{error}</div>}
   {okMsg&&<div className="notice">✓ {okMsg}</div>}
   {file&&!archived&&!result&&<button className="secondary wide" style={{marginTop:8}} disabled={busy} onClick={saveOnly}>💾 Enregistrer la photo dans mon historique</button>}
   {result&&<div className="tender" style={{marginTop:14,textAlign:'left'}}><div className="tendermain"><span className={'badge '+(result.confidence==='elevee'?'green':'')}>{confidenceLabel[result.confidence]||'—'}</span><h3>{result.condition_label||'—'}</h3><p>{result.recommendation}</p>
    {(result.treatment_product||result.treatment_dosage||result.treatment_precautions)&&<div className="farmsummary" style={{marginTop:10}}>{result.treatment_product&&<div><span>Traitement suggéré</span><b>{result.treatment_product}</b></div>}{result.treatment_dosage&&<div><span>Dosage indicatif</span><b>{result.treatment_dosage}</b></div>}{result.treatment_precautions&&<div><span>Précautions</span><b>{result.treatment_precautions}</b></div>}</div>}
    {result.raw_response?.disclaimer&&<p className="muted">⚠️ {result.raw_response.disclaimer}</p>}</div></div>}
  </div>
  <Section title="Historique de vos analyses">{loadingHistory?<Loading/>:history.length?<div className="adminlist">{history.map(h=>{const ph=(h.image_paths||[])[0];const url=ph?thumbs[ph]:undefined;const isOpen=openDiag===h.id;return <div key={h.id} style={{flexWrap:'wrap'}}><b style={{display:'flex',gap:10,alignItems:'center',cursor:'pointer'}} onClick={()=>setOpenDiag(isOpen?null:h.id)}>{url?<img src={url} alt="photo" style={{width:56,height:56,objectFit:'cover',borderRadius:8}}/>:<span style={{width:56,height:56,display:'grid',placeItems:'center',background:'var(--mint)',borderRadius:8}}>{ph?'⏳':'🌿'}</span>}<span>{h.condition_label||'—'}{h.is_demo?' (DÉMO)':''}<br/><small className="muted">{new Date(h.created_at).toLocaleDateString('fr-FR')} • {h.confidence?confidenceLabel[h.confidence]:'sans analyse'}</small></span></b><span className="badge">{isOpen?'Masquer':'Détails'}</span>{isOpen&&<div style={{width:'100%',marginTop:8}}>{url&&<img src={url} alt="photo du diagnostic" style={{maxWidth:'100%',borderRadius:12}}/>}{h.recommendation&&<p>{h.recommendation}</p>}{(h.treatment_product||h.treatment_dosage||h.treatment_precautions)&&<div className="farmsummary">{h.treatment_product&&<div><span>Traitement suggéré</span><b>{h.treatment_product}</b></div>}{h.treatment_dosage&&<div><span>Dosage indicatif</span><b>{h.treatment_dosage}</b></div>}{h.treatment_precautions&&<div><span>Précautions</span><b>{h.treatment_precautions}</b></div>}</div>}{url&&<a className="secondary" href={url} download={`diagnostic-${h.id.slice(0,8)}.jpg`} target="_blank" rel="noreferrer noopener">⬇ Télécharger la photo</a>}{h.raw_response?.disclaimer&&<p className="muted">⚠️ {h.raw_response.disclaimer}</p>}</div>}</div>})}</div>:<Empty text="Aucune analyse enregistrée pour le moment."/>}</Section>
 </>;
}

function Financement({sector}:{sector:Sector}){const [rows,setRows]=useState<FundingProgram[]>([]);const [loading,setLoading]=useState(true);useEffect(()=>{(async()=>{if(!supabase)return;const {data}=await supabase.from('funding_programs').select('*').eq('active',true).order('name');setRows((data||[]) as FundingProgram[]);setLoading(false)})()},[]);const shown=rows.filter(r=>r.sector==='both'||r.sector===sector);return <><div className="pageintro"><div><span className="eyebrow">BAILLEURS ET PROGRAMMES</span><h1>Financement</h1><p>Informations fournies à titre indicatif — vérifiez les conditions auprès de l’organisme. Vous restez responsable de la prise de contact.</p></div></div>{loading?<Loading/>:shown.length?<div className="tenderlist">{shown.map(f=><div className="tender" key={f.id}><div className="cropicon">💰</div><div className="tendermain"><span className="badge green">{f.region||'International'}</span>{(f as any).is_demo&&<span className="badge"> DÉMO</span>}<h3>{f.name}</h3><p>{f.organization}{f.description?` • ${f.description}`:''}</p></div><div className="tenderright">{f.contact_url&&<a className="secondary" href={safeUrl(f.contact_url)} target="_blank" rel="noreferrer">Voir</a>}</div></div>)}</div>:<Empty text="Aucun programme de financement enregistré pour le moment."/>}</>}

function Intrants({sector}:{sector:Sector}){const [rows,setRows]=useState<InputProduct[]>([]);const [loading,setLoading]=useState(true);useEffect(()=>{(async()=>{if(!supabase)return;const {data}=await supabase.from('input_products').select('*').eq('active',true).eq('sector',sector).order('category');setRows((data||[]) as InputProduct[]);setLoading(false)})()},[sector]);return <><div className="pageintro"><div><span className="eyebrow">FOURNITURES</span><h1>Intrants</h1><p>{sector==='agriculture'?'Semences, engrais, produits phytosanitaires, matériel et irrigation.':'Aliments, vaccins, produits vétérinaires, matériel et équipements.'} Annuaire indicatif — ne remplace pas une prescription phytosanitaire ou vétérinaire.</p></div></div>{loading?<Loading/>:rows.length?<div className="marketgrid">{rows.map(p=><InputCard key={p.id} p={p}/>)}</div>:<Empty text="Aucun intrant enregistré pour le moment."/>}</>}

function Tasks({profile}:{profile:Profile}){const [rows,setRows]=useState<Task[]>([]);const [loading,setLoading]=useState(true);const [toast,setToast]=useState('');
 async function load(){if(!supabase)return;setLoading(true);const {data}=await supabase.from('tasks').select('*').eq('assigned_to',profile.id).order('due_date');setRows((data||[]) as Task[]);setLoading(false)}
 useEffect(()=>{load()},[profile.id]);
 async function setStatus(id:string,status:string){if(!supabase)return;const patch:any={status};if(status==='completed')patch.completed_at=new Date().toISOString();const {error}=await supabase.from('tasks').update(patch).eq('id',id);if(error)setToast(error.message);else load()}
 return <><div className="pageintro"><div><span className="eyebrow">OUVRIER</span><h1>Mes tâches</h1><p>Les interventions qui vous sont assignées. Vous ne voyez jamais les tâches d’un autre ouvrier ni les données financières de l’exploitation.</p></div></div>{toast&&<div className="notice">{toast}</div>}{loading?<Loading/>:rows.length?<div className="tenderlist">{rows.map(t=><div className="tender" key={t.id}><div className="cropicon">{t.priority==='urgent'?'🔴':t.priority==='high'?'🟠':'✓'}</div><div className="tendermain"><span className="badge green">{t.status==='pending'?'À FAIRE':t.status==='in_progress'?'EN COURS':t.status==='completed'?'TERMINÉE':'ANNULÉE'}</span><h3>{t.title}</h3><p>{t.description||''}{t.due_date?` • Échéance ${fmtDate(t.due_date)}`:''}</p></div><div className="tenderright">{t.status==='pending'&&<button className="secondary" onClick={()=>setStatus(t.id,'in_progress')}>Commencer</button>}{t.status==='in_progress'&&<button className="secondary" onClick={()=>setStatus(t.id,'completed')}>Terminer</button>}</div></div>)}</div>:<Empty text="Aucune tâche n’est encore assignée à votre compte."/>}</>}

function Notifications(){const [rows,setRows]=useState<Notification[]>([]);useEffect(()=>{(async()=>{if(!supabase)return;const {data}=await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(50);setRows((data||[]) as Notification[])})()},[]);async function read(id:string){await supabase?.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id);setRows(x=>x.map(n=>n.id===id?{...n,read_at:new Date().toISOString()}:n))}return <><div className="pageintro"><div><span className="eyebrow">CENTRE D’ACTIVITÉ</span><h1>Notifications</h1><p>Vos alertes et événements.</p></div></div><div className="notifications">{rows.length?rows.map(n=><button className="notif" key={n.id} onClick={()=>read(n.id)}><span className="notificon">{n.type==='commercial'?'📢':n.type==='warning'?'⚠':'✓'}</span><div><b>{n.title}</b><p>{n.body}</p><small>{new Date(n.created_at).toLocaleString('fr-FR')}</small></div>{!n.read_at&&<span className="unread"/>}</button>):<Empty text="Aucune notification."/>}</div></>}
function Profile({profile,session,signOut}:{profile:Profile;session:Session;signOut:()=>void}){return <><div className="profilehead"><div className="profileavatar">{(profile.full_name||'U').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</div><div><span className="eyebrow">{profile.role.toUpperCase()}</span><h1>{profile.full_name||'Utilisateur'}</h1><p>{profile.country||'—'} • {session.user.email}</p></div></div><div className="settings"><div><b>Rôle</b><span>{profile.role}</span></div><div><b>Pays</b><span>{profile.country||'Cameroun'}</span></div><div><b>Compte</b><span>Authentifié et protégé</span></div></div><button className="secondary dangerbtn" onClick={signOut}>Se déconnecter</button></>}
function ProScreen({profile,reloadProfile}:{profile:Profile;reloadProfile:()=>void}){
 const [pricing,setPricing]=useState<PricingConfig|null>(null);const [loading,setLoading]=useState(true);
 const [zone,setZone]=useState<'local'|'intl'>('local');const [period,setPeriod]=useState<'mensuel'|'annuel'>('mensuel');
 const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');
 const [referrals,setReferrals]=useState<ReferralRow[]>([]);const [sim,setSim]=useState(false);const [momoPhone,setMomoPhone]=useState('');
 useEffect(()=>{(async()=>{if(!supabase)return;const {data:g}=await supabase.from('payment_gateway_config').select('sim_enabled').eq('id',1).maybeSingle();setSim(!!g?.sim_enabled);const {data}=await supabase.from('pricing_config').select('*').eq('id',1).single();setPricing(data as PricingConfig);const {data:refs}=await supabase.from('referrals').select('*').eq('referrer_user_id',profile.id).order('created_at',{ascending:false});setReferrals((refs||[]) as ReferralRow[]);setLoading(false)})()},[]);
 const referralLink=typeof window!=='undefined'?`${window.location.origin}/?ref=${profile.referral_code}`:'';
 async function demander(provider:'orange_money'|'mtn_momo'|'stripe'){
  if(!supabase||!pricing)return;setBusy(true);setMsg('');
  const amount=zone==='local'?(period==='mensuel'?pricing.monthly_amount:pricing.annual_amount):(period==='mensuel'?pricing.monthly_amount_intl:pricing.annual_amount_intl);
  const currency=zone==='local'?pricing.currency:pricing.currency_intl;
  const {error}=await supabase.from('payment_intents').insert({user_id:profile.id,provider,purpose:'abonnement_pro',amount,currency,status:'non_configure',period});
  setBusy(false);
  if(error)setMsg(error.message);else setMsg('Votre demande a été enregistrée. Le paiement en ligne ('+provider+') n’est pas encore activé sur la plateforme — l’équipe DulyAgrivia vous contactera pour finaliser l’activation PRO.');
 }
 async function payerSim(provider:'orange_money'|'mtn_momo'){
  if(!supabase||!pricing)return;if(momoPhone.replace(/\D/g,'').length<8){setMsg('Saisissez votre numéro Mobile Money (8 chiffres minimum).');return}
  setBusy(true);setMsg('');
  const amount=zone==='local'?(period==='mensuel'?pricing.monthly_amount:pricing.annual_amount):(period==='mensuel'?pricing.monthly_amount_intl:pricing.annual_amount_intl);
  const currency=zone==='local'?pricing.currency:pricing.currency_intl;
  const {data,error}=await supabase.from('payment_intents').insert({user_id:profile.id,provider,purpose:'abonnement_pro',amount,currency,status:'pending',period,idempotency_key:crypto.randomUUID()}).select('id').single();
  if(error||!data){setBusy(false);setMsg(error?.message||'Erreur');return}
  await new Promise(r=>setTimeout(r,1500)); // attente de la confirmation sur le téléphone (simulée)
  const {error:e2}=await supabase.rpc('sim_confirm_payment',{p_intent:data.id});
  setBusy(false);
  if(e2){setMsg(e2.message);return}
  setMsg('✅ Paiement SIMULÉ confirmé — aucun argent réel n’a été débité. Votre compte est passé PRO pour la démonstration.');reloadProfile();
 }
 if(loading)return <Loading/>;
 const active=isProActive(profile);
 return <><div className="pageintro"><div><span className="eyebrow">ABONNEMENT</span><h1>Passer à PRO</h1><p>Le compte PRO donne accès à la gestion d’exploitation, la publication commerciale, le suivi de production et les outils IA.</p></div></div>
  {active&&<div className="notice">Votre compte est déjà PRO{profile.pro_expires_at?` jusqu’au ${fmtDate(profile.pro_expires_at.slice(0,10))}`:''}.</div>}
  {pricing&&<><div className="sectorswitch" style={{maxWidth:320}}><button className={zone==='local'?'selected':''} onClick={()=>setZone('local')}>Cameroun / Afrique centrale</button><button className={zone==='intl'?'selected':''} onClick={()=>setZone('intl')}>International</button></div>
  <div className="sectorswitch" style={{maxWidth:240,marginTop:8}}><button className={period==='mensuel'?'selected':''} onClick={()=>setPeriod('mensuel')}>Mensuel</button><button className={period==='annuel'?'selected':''} onClick={()=>setPeriod('annuel')}>Annuel</button></div>
  <div className="farmsummary" style={{marginTop:16}}><div><span>Tarif</span><b>{zone==='local'?(period==='mensuel'?pricing.monthly_amount:pricing.annual_amount):(period==='mensuel'?pricing.monthly_amount_intl:pricing.annual_amount_intl)} {zone==='local'?pricing.currency:pricing.currency_intl}</b></div><div><span>Période</span><b>{period==='mensuel'?'Par mois':'Par an'}</b></div></div>
  <Section title="Moyen de paiement">{sim&&<div className="tender" style={{marginBottom:12}}><div className="tendermain"><div className="notice">🧪 <b>MODE DÉMONSTRATION</b> — le paiement ci-dessous est simulé : aucun argent réel n’est débité.</div><label>Numéro Mobile Money<input inputMode="tel" value={momoPhone} onChange={e=>setMomoPhone(e.target.value)} placeholder="6xx xx xx xx"/></label><div className="quick"><Quick label={busy?'Paiement en cours…':'Payer avec Orange Money (SIMULÉ)'} onClick={()=>payerSim('orange_money')}/><Quick label={busy?'Paiement en cours…':'Payer avec MTN MoMo (SIMULÉ)'} onClick={()=>payerSim('mtn_momo')}/></div></div></div>}<p className="muted">Aucun moyen de paiement n’est encore réellement connecté — votre demande est enregistrée et traitée manuellement le temps de l’intégration.</p><div className="quick"><Quick label="Orange Money" onClick={()=>demander('orange_money')}/><Quick label="MTN Mobile Money" onClick={()=>demander('mtn_momo')}/><Quick label="Carte bancaire (Stripe)" onClick={()=>demander('stripe')}/></div></Section>
  <Section title="Programme de parrainage"><p className="muted">Partagez votre lien avec un autre producteur. Dès qu’il devient réellement PRO (paiement confirmé — pas juste inscrit), une commission de parrainage est créée, puis validée après un délai anti-fraude avant d’être définitivement acquise.</p>
   <div className="farmsummary"><div><span>Votre code</span><b>{profile.referral_code}</b></div><div><span>Filleuls</span><b>{referrals.length}</b></div><div><span>Conversions PRO</span><b>{referrals.filter(r=>r.pro_conversion_at).length}</b></div></div>
   <div className="tender"><div className="tendermain"><label>Votre lien de parrainage<input readOnly value={referralLink} onClick={e=>(e.target as HTMLInputElement).select()}/></label></div></div>
   {referrals.length>0&&<div className="adminlist" style={{marginTop:12}}>{referrals.map(r=><div key={r.id}><b>{new Date(r.referred_signup_at).toLocaleDateString('fr-FR')}{r.commission_amount?` — ${Number(r.commission_amount).toLocaleString('fr-FR')} ${r.currency}`:''}</b><span className={'badge '+(r.status==='paid'||r.status==='approved'?'green':'')}>{referralStatusLabel[r.status]}</span></div>)}</div>}
  </Section>
  {msg&&<div className="notice">{msg}</div>}</>}
 </>;
}

function SalesScreen({profile}:{profile:Profile}){
 const [rows,setRows]=useState<Sale[]>([]);const [loading,setLoading]=useState(true);
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');
 const [form,setForm]=useState({volume:'',amount:'',currency:'FCFA'});
 async function load(){if(!supabase)return;setLoading(true);const {data}=await supabase.from('sales').select('*, crops(*), livestock_types(*)').eq('seller_id',profile.id).order('created_at',{ascending:false});setRows((data||[]) as Sale[]);setLoading(false)}
 useEffect(()=>{load()},[profile.id]);
 async function save(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setMsg('');
  const {error}=await supabase.from('sales').insert({seller_id:profile.id,volume_kg:Number(form.volume),gross_amount:Number(form.amount),currency:form.currency,status:'en_attente'});
  setBusy(false);
  if(error)setMsg(error.message);else{setOpen(false);setForm({volume:'',amount:'',currency:'FCFA'});load()}
 }
 const totalNet=rows.reduce((a,b)=>a+Number(b.net_amount||0),0);
 const totalCommission=rows.reduce((a,b)=>a+Number(b.commission_amount||0),0);
 if(!isProActive(profile)) return <><div className="pageintro"><div><span className="eyebrow">VENTES</span><h1>Mes ventes</h1></div></div><Empty text="Passez au compte PRO pour enregistrer vos ventes et suivre vos commissions." action="Passer à PRO" onClick={()=>{}}/></>;
 return <><div className="pageintro"><div><span className="eyebrow">TRAÇABILITÉ COMMERCIALE</span><h1>Mes ventes</h1><p>Montant brut, taux appliqué, commission DulyAgrivia et montant net — conservés pour chaque vente.</p></div><button className="primary" onClick={()=>setOpen(true)}>＋ Enregistrer une vente</button></div>
  <div className="farmsummary"><div><span>Ventes</span><b>{rows.length}</b></div><div><span>Commission cumulée</span><b>{totalCommission.toLocaleString('fr-FR')}</b></div><div><span>Net cumulé</span><b>{totalNet.toLocaleString('fr-FR')}</b></div></div>
  {loading?<Loading/>:rows.length?<div className="tenderlist">{rows.map(s=><div className="tender" key={s.id}><div className="cropicon">💵</div><div className="tendermain"><span className="badge green">{s.status==='confirmee'?'CONFIRMÉE':s.status==='annulee'?'ANNULÉE':'EN ATTENTE'}</span><h3>{Number(s.gross_amount).toLocaleString('fr-FR')} {s.currency}</h3><p>Taux {s.commission_rate_applied}% • Commission {Number(s.commission_amount).toLocaleString('fr-FR')} {s.currency} • Net {Number(s.net_amount).toLocaleString('fr-FR')} {s.currency}</p><small>{new Date(s.created_at).toLocaleDateString('fr-FR')}</small></div></div>)}</div>:<Empty text="Aucune vente enregistrée pour le moment."/>}
  {open&&<div className="modal"><form className="modalcard" onSubmit={save}><div className="sectionhead"><h2>Enregistrer une vente</h2><button type="button" onClick={()=>setOpen(false)}>✕</button></div><label>Volume (kg)<input type="number" min="0" step="0.01" required value={form.volume} onChange={e=>setForm({...form,volume:e.target.value})}/></label><label>Montant brut<input type="number" min="0" step="0.01" required value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label>Devise<select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option value="FCFA">FCFA</option><option value="EUR">EUR</option></select></label><div className="notice">Le taux de commission et le montant net sont calculés automatiquement à l’enregistrement, selon la politique DulyAgrivia en vigueur.</div>{msg&&<div className="notice">{msg}</div>}<button className="primary wide" disabled={busy}>{busy?'Enregistrement…':'Enregistrer la vente'}</button></form></div>}
 </>;
}

function AdminCreateProducer(){
 const [form,setForm]=useState({fullName:'',phone:'',email:'',grantPro:false,proType:'offert' as 'offert'|'sponsorise'|'exonere'|'paiement_manuel',proReason:'',proDurationDays:'30'});
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [created,setCreated]=useState<{email:string;temporaryPassword:string}|null>(null);
 async function submit(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setError('');setCreated(null);
  const {data,error:fnError}=await supabase.functions.invoke('admin-create-producer',{body:{fullName:form.fullName,phone:form.phone||undefined,email:form.email||undefined,grantPro:form.grantPro,proType:form.proType,proReason:form.proReason||undefined,proDurationDays:Number(form.proDurationDays)}});
  setBusy(false);
  if(fnError){setError('Le service n’est pas joignable pour le moment.');return}
  if(data?.error){setError(data.message||'Création impossible.');return}
  setCreated(data.result);setForm({fullName:'',phone:'',email:'',grantPro:false,proType:'offert',proReason:'',proDurationDays:'30'});
 }
 return <Section title="Créer un compte Producteur (pour ceux qui ne s’inscrivent pas eux-mêmes)">
  <form className="tender" onSubmit={submit}><div className="tendermain" style={{display:'grid',gap:10}}>
   <label>Nom complet *<input required value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></label>
   <label>Téléphone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
   <label>E-mail (optionnel — un identifiant technique sera généré si absent)<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
   <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={form.grantPro} onChange={e=>setForm({...form,grantPro:e.target.checked})}/> Accorder le PRO immédiatement (offert/sponsorisé/exonéré)</label>
   {form.grantPro&&<><label>Type<select value={form.proType} onChange={e=>setForm({...form,proType:e.target.value as any})}><option value="offert">Offert</option><option value="sponsorise">Sponsorisé</option><option value="exonere">Exonéré</option><option value="paiement_manuel">Paiement reçu manuellement</option></select></label>
   <label>Motif (obligatoire, tracé dans le journal) *<textarea required value={form.proReason} onChange={e=>setForm({...form,proReason:e.target.value})}/></label>
   <label>Durée (jours)<input type="number" min="1" value={form.proDurationDays} onChange={e=>setForm({...form,proDurationDays:e.target.value})}/></label></>}
  </div><button className="primary" disabled={busy}>{busy?'Création…':'Créer le compte'}</button></form>
  {error&&<div className="notice">{error}</div>}
  {created&&<div className="notice">Compte créé. Identifiants à transmettre au producteur (à usage unique, non ré-affichables) :<br/><b>E-mail / identifiant :</b> {created.email}<br/><b>Mot de passe temporaire :</b> {created.temporaryPassword}<br/>Conseillez-lui de le changer dès sa première connexion.</div>}
 </Section>;
}
function AdminMonetization(){
 const [pricing,setPricing]=useState<PricingConfig|null>(null);const [commission,setCommission]=useState<CommissionConfig|null>(null);
 const [refPrices,setRefPrices]=useState<ReferencePrice[]>([]);const [crops,setCrops]=useState<Crop[]>([]);const [livestockTypes,setLivestockTypes]=useState<LivestockType[]>([]);
 const [rpForm,setRpForm]=useState({sector:'agriculture' as Sector,item:'',price:''});const [rpBusy,setRpBusy]=useState(false);
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');
 async function load(){if(!supabase)return;setLoading(true);const [p,c,rp,cr,lt]=await Promise.all([supabase.from('pricing_config').select('*').eq('id',1).single(),supabase.from('commission_config').select('*').eq('id',1).single(),supabase.from('reference_prices').select('*, crops(*), livestock_types(*)'),supabase.from('crops').select('*').order('name'),supabase.from('livestock_types').select('*').order('name')]);setPricing(p.data as PricingConfig);setCommission(c.data as CommissionConfig);setRefPrices((rp.data||[]) as ReferencePrice[]);setCrops((cr.data||[]) as Crop[]);setLivestockTypes((lt.data||[]) as LivestockType[]);setLoading(false)}
 useEffect(()=>{load()},[]);
 async function savePricing(e:React.FormEvent){e.preventDefault();if(!supabase||!pricing)return;setBusy(true);setMsg('');const {error}=await supabase.from('pricing_config').update({monthly_amount:pricing.monthly_amount,annual_amount:pricing.annual_amount,monthly_amount_intl:pricing.monthly_amount_intl,annual_amount_intl:pricing.annual_amount_intl}).eq('id',1);setBusy(false);setMsg(error?error.message:'Tarifs enregistrés.')}
 async function saveCommission(e:React.FormEvent){e.preventDefault();if(!supabase||!commission)return;setBusy(true);setMsg('');const {error}=await supabase.from('commission_config').update({rate_percent:commission.rate_percent}).eq('id',1);setBusy(false);setMsg(error?error.message:'Taux de commission mis à jour pour les prochaines ventes (l’historique conserve les anciens taux).')}
 async function saveRefPrice(e:React.FormEvent){e.preventDefault();if(!supabase||!rpForm.item||!rpForm.price)return;setRpBusy(true);
  const payload:any={price_per_kg:Number(rpForm.price)};if(rpForm.sector==='agriculture')payload.crop_id=rpForm.item;else payload.livestock_type_id=rpForm.item;
  const existing=refPrices.find((r:any)=>rpForm.sector==='agriculture'?r.crop_id===rpForm.item:r.livestock_type_id===rpForm.item);
  const {error}=existing?await supabase.from('reference_prices').update(payload).eq('id',existing.id):await supabase.from('reference_prices').insert(payload);
  setRpBusy(false);if(!error){setRpForm({...rpForm,item:'',price:''});load()}else setMsg(error.message);
 }
 // Centre de contrôle parrainage + paiements (exigence de l’audit : tableau Super Admin complet)
 const [refConfig,setRefConfig]=useState<{rate_percent:number;validation_delay_days:number}|null>(null);
 const [allReferrals,setAllReferrals]=useState<any[]>([]);const [pendingPayments,setPendingPayments]=useState<any[]>([]);
 async function loadMonetizationControl(){if(!supabase)return;const [rc,ar,pp]=await Promise.all([supabase.from('referral_commission_config').select('*').eq('id',1).single(),supabase.from('referrals').select('*, referrer:profiles!referrals_referrer_user_id_fkey(full_name), referred:profiles!referrals_referred_user_id_fkey(full_name)').order('created_at',{ascending:false}).limit(50),supabase.from('payment_intents').select('*, profiles(full_name)').in('status',['pending','non_configure']).order('created_at',{ascending:false}).limit(50)]);setRefConfig(rc.data as any);setAllReferrals((ar.data||[]) as any[]);setPendingPayments((pp.data||[]) as any[])}
 useEffect(()=>{loadMonetizationControl()},[]);
 async function saveRefConfig(e:React.FormEvent){e.preventDefault();if(!supabase||!refConfig)return;setBusy(true);const {error}=await supabase.from('referral_commission_config').update({rate_percent:refConfig.rate_percent,validation_delay_days:refConfig.validation_delay_days}).eq('id',1);setBusy(false);setMsg(error?error.message:'Configuration de parrainage mise à jour.')}
 async function approveDue(){if(!supabase)return;const {data,error}=await supabase.rpc('approve_due_referrals');if(error)setMsg(error.message);else{setMsg(`${data} commission(s) de parrainage validée(s).`);loadMonetizationControl()}}
 async function markPayment(id:string,status:'successful'|'failed'|'cancelled'|'refunded'){if(!supabase)return;const {error}=await supabase.from('payment_intents').update({status}).eq('id',id);if(error)setMsg(error.message);else loadMonetizationControl()}
 if(loading)return <Loading/>;
 return <><Section title="Tarifs PRO (configurables)"><form className="tender" onSubmit={savePricing}><div className="tendermain" style={{display:'grid',gap:10}}><label>Mensuel Cameroun/Afrique centrale (FCFA)<input type="number" value={pricing?.monthly_amount||0} onChange={e=>setPricing(p=>p&&({...p,monthly_amount:Number(e.target.value)}))}/></label><label>Annuel Cameroun/Afrique centrale (FCFA)<input type="number" value={pricing?.annual_amount||0} onChange={e=>setPricing(p=>p&&({...p,annual_amount:Number(e.target.value)}))}/></label><label>Mensuel International (EUR)<input type="number" value={pricing?.monthly_amount_intl||0} onChange={e=>setPricing(p=>p&&({...p,monthly_amount_intl:Number(e.target.value)}))}/></label><label>Annuel International (EUR)<input type="number" value={pricing?.annual_amount_intl||0} onChange={e=>setPricing(p=>p&&({...p,annual_amount_intl:Number(e.target.value)}))}/></label></div><button className="primary" disabled={busy}>{busy?'Enregistrement…':'Enregistrer les tarifs'}</button></form></Section>
 <Section title="Commission DulyAgrivia (configurable)"><form className="tender" onSubmit={saveCommission}><div className="tendermain"><label>Taux appliqué aux nouvelles ventes (%)<input type="number" step="0.1" min="0" max="100" value={commission?.rate_percent||0} onChange={e=>setCommission(c=>c&&({...c,rate_percent:Number(e.target.value)}))}/></label></div><button className="primary" disabled={busy}>{busy?'Enregistrement…':'Mettre à jour le taux'}</button></form><p className="muted">Ce taux ne s’applique qu’aux ventes futures. Le taux réellement appliqué à chaque vente passée reste inscrit dans son historique.</p></Section>
 <Section title="Prix de référence DulyAgrivia (par culture / espèce)"><form className="tender" onSubmit={saveRefPrice}><div className="tendermain"><label>Secteur<select value={rpForm.sector} onChange={e=>setRpForm({...rpForm,sector:e.target.value as Sector,item:''})}><option value="agriculture">Agriculture</option><option value="elevage">Élevage</option></select></label><label>{rpForm.sector==='agriculture'?'Culture':'Espèce'}<select value={rpForm.item} onChange={e=>setRpForm({...rpForm,item:e.target.value})}><option value="">Choisir…</option>{(rpForm.sector==='agriculture'?crops:livestockTypes).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Prix de référence (par kg, FCFA)<input type="number" min="0" value={rpForm.price} onChange={e=>setRpForm({...rpForm,price:e.target.value})}/></label></div><button className="primary" disabled={rpBusy||!rpForm.item}>{rpBusy?'Enregistrement…':'Enregistrer ce prix de référence'}</button></form>
  {refPrices.length>0&&<div className="adminlist" style={{marginTop:12}}>{refPrices.map((r:any)=><div key={r.id}><b>{r.crops?.name||r.livestock_types?.name}</b><span className="badge">{Number(r.price_per_kg).toLocaleString('fr-FR')} {r.currency}/kg</span></div>)}</div>}
 </Section>
 <Section title="Programme de parrainage — configuration & suivi"><form className="tender" onSubmit={saveRefConfig}><div className="tendermain"><label>Taux de commission de parrainage (%)<input type="number" step="0.1" min="0" max="100" value={refConfig?.rate_percent||0} onChange={e=>setRefConfig(c=>c&&({...c,rate_percent:Number(e.target.value)}))}/></label><label>Délai de validation anti-fraude (jours)<input type="number" min="0" value={refConfig?.validation_delay_days||0} onChange={e=>setRefConfig(c=>c&&({...c,validation_delay_days:Number(e.target.value)}))}/></label></div><button className="primary" disabled={busy}>{busy?'Enregistrement…':'Enregistrer'}</button></form>
  <div className="farmsummary" style={{marginTop:12}}><div><span>Filleuls (total)</span><b>{allReferrals.length}</b></div><div><span>Conversions PRO</span><b>{allReferrals.filter((r:any)=>r.pro_conversion_at).length}</b></div><div><span>En attente</span><b>{allReferrals.filter((r:any)=>r.status==='pending').length}</b></div><div><span>Validées</span><b>{allReferrals.filter((r:any)=>r.status==='approved').length}</b></div><div><span>Payées</span><b>{allReferrals.filter((r:any)=>r.status==='paid').length}</b></div></div>
  <button className="secondary" style={{marginTop:10}} onClick={approveDue}>Valider les commissions dont le délai anti-fraude est écoulé</button>
  {allReferrals.length>0&&<div className="adminlist" style={{marginTop:12}}>{allReferrals.map((r:any)=><div key={r.id}><b>{r.referrer?.full_name||'—'} → {r.referred?.full_name||'—'}</b><span className={'badge '+(r.status==='paid'||r.status==='approved'?'green':'')}>{referralStatusLabel[r.status]}{r.commission_amount?` • ${Number(r.commission_amount).toLocaleString('fr-FR')} ${r.currency}`:''}</span></div>)}</div>}
 </Section>
 <Section title="Paiements en attente de confirmation manuelle"><p className="muted">Tant que la passerelle (Flutterwave/CinetPay) n’est pas branchée, chaque demande doit être validée ici après vérification manuelle du paiement reçu.</p>
  {pendingPayments.length>0?<div className="adminlist">{pendingPayments.map((p:any)=><div key={p.id}><b>{p.profiles?.full_name||'—'} • {Number(p.amount).toLocaleString('fr-FR')} {p.currency} • {p.provider}</b><span className="row"><button className="secondary" onClick={()=>markPayment(p.id,'successful')}>Confirmer</button> <button className="secondary" onClick={()=>markPayment(p.id,'failed')}>Rejeter</button></span></div>)}</div>:<Empty text="Aucun paiement en attente."/>}
 </Section>
 {msg&&<div className="notice">{msg}</div>}
 </>;
}
function AdminInputProducts(){
 const [rows,setRows]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');
 const [form,setForm]=useState({sector:'agriculture' as Sector,category:'',name:'',supplier_name:'',price_note:'',region:'',description:'',price_fcfa:'',sale_unit:''});const [pfiles,setPfiles]=useState<File[]>([]);
 async function load(){if(!supabase)return;setLoading(true);const {data}=await supabase.from('input_products').select('*').order('created_at',{ascending:false});setRows((data||[]) as any[]);setLoading(false)}
 useEffect(()=>{load()},[]);
 async function add(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setMsg('');
  const paths:string[]=[];
  try{for(const f of pfiles.slice(0,4)){const blob=await compressImage(f,1280,0.82);const path=`intrants/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;const up=await supabase.storage.from('product-labels').upload(path,blob,{contentType:'image/jpeg'});if(up.error)throw new Error(up.error.message);paths.push(path)}}catch(err:any){setBusy(false);setMsg('Photo non envoyée : '+err.message);return}
  const {price_fcfa,sale_unit,...rest}=form;const {error}=await supabase.from('input_products').insert({...rest,price_fcfa:price_fcfa===''?null:Number(price_fcfa),sale_unit:sale_unit.trim()||null,photo_paths:paths,active:true});setBusy(false);
  if(error)setMsg(error.message);else{setForm({sector:'agriculture',category:'',name:'',supplier_name:'',price_note:'',region:'',description:'',price_fcfa:'',sale_unit:''});setPfiles([]);load()}
 }
 async function toggle(id:string,active:boolean){if(!supabase)return;await supabase.from('input_products').update({active:!active}).eq('id',id);load()}
 return <Section title="Intrants — ajout et gestion">
  <form className="tender" onSubmit={add}><div className="tendermain" style={{display:'grid',gap:10}}>
   <label>Secteur<select value={form.sector} onChange={e=>setForm({...form,sector:e.target.value as Sector})}><option value="agriculture">Agriculture</option><option value="elevage">Élevage</option></select></label>
   <label>Catégorie *<input required placeholder="Ex : Phytosanitaire, Semence, Engrais…" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label>
   <label>Nom du produit *<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
   <label>Caractéristiques<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Composition, usage, précautions…"/></label>
   <label>Fournisseur<input value={form.supplier_name} onChange={e=>setForm({...form,supplier_name:e.target.value})}/></label>
   <div className="gpsrow"><label>Prix (FCFA)<input type="number" min="0" step="any" value={form.price_fcfa} onChange={e=>setForm({...form,price_fcfa:e.target.value})}/></label><label>Par (sac, litre, pièce…)<input maxLength={40} value={form.sale_unit} onChange={e=>setForm({...form,sale_unit:e.target.value})}/></label></div>
   <label>Photos du produit (jusqu’à 4)<input type="file" accept="image/*" multiple onChange={e=>setPfiles(Array.from(e.target.files||[]).slice(0,4))}/></label>
   <label>Indication de prix<input value={form.price_note} onChange={e=>setForm({...form,price_note:e.target.value})} placeholder="Ex : à partir de 2 500 FCFA"/></label>
   <label>Zone<input value={form.region} onChange={e=>setForm({...form,region:e.target.value})}/></label>
  </div><button className="primary" disabled={busy}>{busy?'Ajout…':'＋ Ajouter cet intrant'}</button></form>
  {msg&&<div className="notice">{msg}</div>}
  {loading?<Loading/>:<div className="adminlist" style={{marginTop:12}}>{rows.map((r:any)=><div key={r.id}><b>{r.name} <span className="muted">({r.category} • {r.sector})</span></b><span className="row"><span className={'badge '+(r.active?'green':'')}>{r.active?'ACTIF':'MASQUÉ'}</span> <button className="secondary" onClick={()=>toggle(r.id,r.active)}>{r.active?'Masquer':'Réactiver'}</button></span></div>)}</div>}
 </Section>;
}
function AdminMarketModeration(){
 const [photos,setPhotos]=useState<Record<string,string[]>>({});
 const [pending,setPending]=useState<any[]>([]);const [published,setPublished]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [msg,setMsg]=useState('');
 async function load(){if(!supabase)return;setLoading(true);
  const [p,pub]=await Promise.all([
   supabase.from('market_listings').select('*, crops(*), livestock_types(*), profiles(full_name)').in('moderation_status',['soumise','en_controle']).order('created_at'),
   supabase.from('market_listings').select('*, crops(*), livestock_types(*), profiles(full_name)').eq('moderation_status','publiee').order('created_at',{ascending:false}).limit(20)
  ]);
  setPending((p.data||[]) as any[]);setPublished((pub.data||[]) as any[]);
  setPhotos(await loadPhotosByListing(supabase,[...((p.data||[]) as any[]),...((pub.data||[]) as any[])].map((x:any)=>x.id)));setLoading(false);
 }
 useEffect(()=>{load()},[]);
 async function toControl(id:string){if(!supabase)return;await supabase.from('market_listings').update({moderation_status:'en_controle'}).eq('id',id);load()}
 async function validateAndPublish(id:string){if(!supabase)return;const {error:e1}=await supabase.from('market_listings').update({moderation_status:'validee'}).eq('id',id);if(e1){setMsg(e1.message);return}const {error:e2}=await supabase.from('market_listings').update({moderation_status:'publiee'}).eq('id',id);if(e2)setMsg(e2.message);load()}
 async function requestChange(id:string){if(!supabase)return;const note=window.prompt('Motif de la demande de modification (obligatoire) :');if(!note)return;const {error}=await supabase.from('market_listings').update({moderation_status:'modification_demandee',moderation_note:note}).eq('id',id);if(error)setMsg(error.message);load()}
 async function refuse(id:string){if(!supabase)return;const note=window.prompt('Motif du refus (obligatoire) :');if(!note)return;const {error}=await supabase.from('market_listings').update({moderation_status:'refusee',moderation_note:note}).eq('id',id);if(error)setMsg(error.message);load()}
 async function suspend(id:string){if(!supabase)return;const {error}=await supabase.from('market_listings').update({moderation_status:'suspendue'}).eq('id',id);if(error)setMsg(error.message);load()}
 if(loading)return <Loading/>;
 return <Section title="Modération du Marché">
  {msg&&<div className="notice">{msg}</div>}
  <p className="muted">En attente ({pending.length})</p>
  {pending.length?<div className="tenderlist">{pending.map((l:any)=>{const label=l.crops?.name||l.livestock_types?.name;return <div className="tender" key={l.id}><div className="cropicon">🕵️</div><div className="tendermain"><span className="badge">{l.moderation_status==='soumise'?'SOUMISE':'EN CONTRÔLE'}</span><h3>{label||'—'} — {Number(l.volume_kg).toLocaleString('fr-FR')} kg à {Number(l.price_per_kg).toLocaleString('fr-FR')} {l.currency}/kg</h3><p>Vendeur : {l.profiles?.full_name||'—'} • 📷 {(photos[l.id]||[]).length} photo(s)</p>{(photos[l.id]||[]).length>0&&<div className="thumbstrip">{photos[l.id].map(p=><img key={p} src={photoUrl(supabase as any,p)} alt="" loading="lazy"/>)}</div>}<div className="quick">{l.moderation_status==='soumise'&&<Quick label="Mettre en contrôle" onClick={()=>toControl(l.id)}/>}<Quick label="Valider et publier" onClick={()=>validateAndPublish(l.id)}/><Quick label="Demander une modification" onClick={()=>requestChange(l.id)}/><Quick label="Refuser" onClick={()=>refuse(l.id)}/></div></div></div>})}</div>:<Empty text="Rien en attente de modération."/>}
  <p className="muted" style={{marginTop:16}}>Publiées récemment</p>
  {published.length?<div className="adminlist">{published.map((l:any)=><div key={l.id}><b>{(l.crops?.name||l.livestock_types?.name)||'—'} — {l.profiles?.full_name||'—'}</b><span className="row"><span className="badge green">PUBLIÉE</span> <button className="secondary" onClick={()=>suspend(l.id)}>Suspendre</button></span></div>)}</div>:<Empty text="Aucune offre publiée pour le moment."/>}
 </Section>;
}
function Admin(){const [stats,setStats]=useState({profiles:0,farms:0,tenders:0,fields:0,herds:0});const [users,setUsers]=useState<any[]>([]);const [q,setQ]=useState('');
 useEffect(()=>{(async()=>{if(!supabase)return;const [a,b,c,d,e,u]=await Promise.all([supabase.from('profiles').select('id',{count:'exact',head:true}),supabase.from('farms').select('id',{count:'exact',head:true}),supabase.from('tenders').select('id',{count:'exact',head:true}),supabase.from('fields').select('id',{count:'exact',head:true}),supabase.from('herds').select('id',{count:'exact',head:true}),supabase.from('profiles').select('id,full_name,phone,role,plan,pro_expires_at').order('full_name').limit(200)]);setStats({profiles:a.count||0,farms:b.count||0,tenders:c.count||0,fields:d.count||0,herds:e.count||0});setUsers((u.data||[]) as any[])})()},[]);
 const shown=users.filter((u:any)=>(u.full_name||'').toLowerCase().includes(q.toLowerCase())||(u.phone||'').includes(q));
 return <><div className="pageintro"><div><span className="eyebrow">SUPER ADMINISTRATEUR</span><h1>Vue plateforme</h1><p>Statistiques issues de la base réelle. Le rôle admin ne peut être attribué que manuellement dans Supabase, jamais par inscription publique.</p></div></div><div className="grid4"><Stat title="Utilisateurs" value={String(stats.profiles)} note="Profils enregistrés"/><Stat title="Fermes" value={String(stats.farms)} note="Exploitations"/><Stat title="Champs" value={String(stats.fields)} note="Parcelles"/><Stat title="Troupeaux" value={String(stats.herds)} note="Élevage"/></div><AdminDemo/><AdminCreateProducer/><AdminMonetization/><AdminMarketModeration/><AdminInputProducts/>
 <Section title="Utilisateurs (lecture seule — 200 derniers)"><div className="search">⌕<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher un nom ou téléphone…"/></div><div className="adminlist" style={{marginTop:12}}>{shown.map((u:any)=><div key={u.id}><b>{u.full_name||'—'} <span className="muted">({u.phone||'sans téléphone'})</span></b><span className={'badge '+(u.plan==='pro'?'green':'')}>{u.role.toUpperCase()} • {u.plan==='pro'?'PRO':'GRATUIT'}</span></div>)}</div><p className="muted">Changement de rôle/forçage de statut : à faire manuellement dans Supabase pour l’instant (pas encore d’action depuis cette interface).</p></Section>
 </>}

function AdminDemo(){
 const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);
 async function run(fn:'seed_demo_data'|'purge_demo_data'){
  if(!supabase||busy)return;
  if(fn==='purge_demo_data'&&!window.confirm('Supprimer TOUTES les données DÉMO (appels d’offres, marché, coopérative, échanges, intrants, financements, diagnostics d’exemple) ? Les vraies données ne sont pas touchées.'))return;
  setBusy(true);setMsg('');const {data,error}=await supabase.rpc(fn);setBusy(false);setMsg(error?error.message:String(data||'Terminé.'));
 }
 return <Section title="Données de démonstration"><p className="muted">Charge des exemples (appels d’offres, marché, coopérative, échanges, intrants, financements, diagnostics) marqués « DÉMO » pour tester chaque écran. Ils sont fictifs et se suppriment en un bouton, sans toucher aux vraies données.</p><div className="quick"><button className="secondary" disabled={busy} onClick={()=>run('seed_demo_data')}>Charger la démonstration</button><button className="secondary" disabled={busy} onClick={()=>run('purge_demo_data')}>Supprimer la démonstration</button></div>{msg&&<div className="notice">{msg}</div>}</Section>;
}

createRoot(document.getElementById('root')!).render(<App/>);
