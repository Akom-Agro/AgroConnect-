import React, { useEffect, useRef, useState } from 'react';

type Pt = { lat: number; lng: number };
export function areaHa(points: Pt[]): number {
  if (points.length < 3) return 0;
  const latRad = points.reduce((a, p) => a + p.lat, 0) / points.length * Math.PI / 180;
  const mLat = 111320, mLng = 111320 * Math.cos(latRad);
  const xy = points.map(p => ({ x: p.lng * mLng, y: p.lat * mLat }));
  let s = 0;
  for (let i = 0; i < xy.length; i++) { const a = xy[i], b = xy[(i + 1) % xy.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s / 2) / 10000;
}

// Carte d'un champ : contour tracé, superficie, position GPS. Éditable par le propriétaire / l'administrateur.
export function FieldMap({ db, field, canEdit, onSaved, onDraft }: { db: any; field: any; canEdit: boolean; onSaved?: () => void; onDraft?: (pts: Pt[], ha: number, lat: number, lng: number) => void }) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const baseRef = useRef<any>({});
  const shapeRef = useRef<any>(null);
  const drawRef = useRef<any>(null);
  const drawingRef = useRef(false);
  const [sat, setSat] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<Pt[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const boundary: Pt[] = Array.isArray(field.boundary) ? field.boundary : [];
  const [, setTick] = useState(0);
  const L = (window as any).L;
  useEffect(() => {
    if ((window as any).L) return;
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
    const sc = document.createElement('script'); sc.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; sc.onload = () => setTick(t => t + 1); document.body.appendChild(sc);
  }, []);

  useEffect(() => {
    if (!L || !divRef.current || mapRef.current) return;
    const c: [number, number] = field.latitude && field.longitude ? [field.latitude, field.longitude] : [5.48, 10.41];
    const m = L.map(divRef.current).setView(c, field.latitude || boundary.length ? 16 : 12);
    baseRef.current.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 });
    baseRef.current.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Imagery © Esri', maxZoom: 19 });
    baseRef.current.sat.addTo(m);
    shapeRef.current = L.layerGroup().addTo(m);
    drawRef.current = L.layerGroup().addTo(m);
    m.on('click', (e: any) => { if (drawingRef.current) setPoints(p => [...p, { lat: e.latlng.lat, lng: e.latlng.lng }]); });
    mapRef.current = m;
    return () => { m.remove(); mapRef.current = null; };
  }, [!!L]);

  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    m.removeLayer(baseRef.current.osm); m.removeLayer(baseRef.current.sat);
    (sat ? baseRef.current.sat : baseRef.current.osm).addTo(m).bringToBack();
  }, [sat, !!L]);

  useEffect(() => {
    if (!L || !shapeRef.current) return;
    shapeRef.current.clearLayers();
    if (boundary.length >= 3) {
      const poly = L.polygon(boundary.map(p => [p.lat, p.lng]), { color: '#22c55e', weight: 3, fillOpacity: 0.25 }).addTo(shapeRef.current);
      const a = field.boundary_area_ha || areaHa(boundary);
      poly.bindTooltip(`${field.name} — ${Number(a).toFixed(2)} ha`, { permanent: true, direction: 'center' });
      mapRef.current?.fitBounds(poly.getBounds(), { maxZoom: 18, padding: [20, 20] });
    } else if (field.latitude && field.longitude) {
      L.marker([field.latitude, field.longitude]).addTo(shapeRef.current).bindPopup(field.name);
    }
  }, [field.boundary, field.latitude, field.longitude, !!L]);

  useEffect(() => {
    if (!L || !drawRef.current) return;
    drawRef.current.clearLayers();
    if (points.length) L.polyline(points.map(p => [p.lat, p.lng]).concat(points.length > 2 ? [[points[0].lat, points[0].lng]] : []), { color: '#ef4444', weight: 3, dashArray: '6 6' }).addTo(drawRef.current);
    points.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', fillColor: '#ef4444', fillOpacity: 1 }).addTo(drawRef.current));
    if (points.length >= 3) L.marker([points.reduce((a, p) => a + p.lat, 0) / points.length, points.reduce((a, p) => a + p.lng, 0) / points.length], { icon: L.divIcon({ className: '', html: `<div style="background:#fff;padding:2px 8px;border-radius:10px;font-weight:700;white-space:nowrap">${areaHa(points).toFixed(2)} ha</div>` }) }).addTo(drawRef.current);
  }, [points, !!L]);

  function start() { setPoints([]); drawingRef.current = true; setDrawing(true); setMsg('Touchez la carte pour poser chaque coin du champ (3 points minimum).'); }
  function stop() { drawingRef.current = false; setDrawing(false); setPoints([]); }
  function locate() {
    if (!navigator.geolocation) { setMsg('GPS indisponible sur cet appareil.'); return; }
    setMsg('Recherche de la position…');
    navigator.geolocation.getCurrentPosition(p => { mapRef.current?.setView([p.coords.latitude, p.coords.longitude], 18); setMsg(`Position obtenue (± ${Math.round(p.coords.accuracy)} m). Vous pouvez tracer le champ ici.`); },
      () => setMsg('Autorisation GPS refusée ou position indisponible.'), { enableHighAccuracy: true, timeout: 15000 });
  }
  async function save() {
    if (points.length < 3) { setMsg('Il faut au moins 3 points.'); return; }
    setBusy(true);
    const a = Number(areaHa(points).toFixed(3));
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length, lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    if (onDraft) { setBusy(false); onDraft(points, a, Number(lat.toFixed(6)), Number(lng.toFixed(6))); setMsg(`Tracé gardé : ${a.toFixed(2)} ha. Terminez en enregistrant le champ.`); stop(); return; }
    const { error } = await db.from('fields').update({ boundary: points, boundary_area_ha: a, latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) }).eq('id', field.id);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setMsg(`Champ enregistré : ${a.toFixed(2)} ha, position GPS mise à jour.`); stop(); onSaved?.();
  }
  if (!L) return <div className="notice">Chargement de la carte… (connexion internet requise)</div>;
  return <div>
    <div className="quick" style={{ marginBottom: 8 }}>
      <button type="button" className="secondary" onClick={() => setSat(s => !s)}>{sat ? '🗺️ Plan' : '🛰️ Satellite'}</button>
      <button type="button" className="secondary" onClick={locate}>📍 Ma position</button>
      {canEdit && !drawing && <button type="button" className="primary" onClick={start}>✏️ {boundary.length ? 'Retracer le champ' : 'Tracer le champ'}</button>}
      {drawing && <>
        <button type="button" className="secondary" onClick={() => setPoints(p => p.slice(0, -1))} disabled={!points.length}>↩ Annuler le dernier point</button>
        <button type="button" className="primary" onClick={save} disabled={busy || points.length < 3}>{busy ? '…' : `✔ Enregistrer (${areaHa(points).toFixed(2)} ha)`}</button>
        <button type="button" className="secondary" onClick={stop}>✕</button>
      </>}
    </div>
    <div ref={divRef} style={{ width: '100%', height: 380, borderRadius: 12, overflow: 'hidden' }} />
    {boundary.length >= 3 && <small className="muted">Superficie tracée : {Number(field.boundary_area_ha || areaHa(boundary)).toFixed(2)} ha{field.latitude ? ` • GPS ${Number(field.latitude).toFixed(5)}, ${Number(field.longitude).toFixed(5)}` : ''}</small>}
    {msg && <div className="notice">{msg}</div>}
  </div>;
}
