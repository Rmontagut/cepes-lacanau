'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evalSpecies, STATUS_LABEL, fmtD, todayParis, dayIndex } from '../lib/engine';
import { HABITATS } from '../lib/species';

const TILE = 0.03;
const MIN_ZOOM_FOREST = 11.5;
const CENTER = [-1.11, 44.99];
const IGN = (layer, fmt) => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${fmt}`;
const STATUS_COLOR = { ouverte: '#2F9A44', faible: '#9CC46A', prepare: '#E2A43A', fermee: '#C2553F', annulee: '#8E2F23', rien: '#9AA390', hors: '#B7BDAF', na: '#B7BDAF' };
const WEEKDAY = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const RES = { rien: 'Rien', quelques: 'Quelques-uns', bonne: 'Belle récolte' };
const cellKey = (lat, lon) => `${Math.round(lat * 10) / 10},${Math.round(lon * 10) / 10}`;

export default function MapApp() {
  const mapEl = useRef(null);
  const map = useRef(null);
  const features = useRef(new Map()); // fid -> feature
  const tilesLoaded = useRef(new Set());
  const meteoRef = useRef(new Map()); // cellKey -> meteo | 'loading'
  const geoPos = useRef(null);

  const [species, setSpecies] = useState([]);
  const [editable, setEditable] = useState(false);
  const [sel, setSel] = useState('best');
  const [offset, setOffset] = useState(0);
  const [meteoTick, setMeteoTick] = useState(0);
  const [featTick, setFeatTick] = useState(0);
  const [zoomOk, setZoomOk] = useState(true);
  const [loading, setLoading] = useState(0);
  const [error, setError] = useState('');
  const [base, setBase] = useState('plan');
  const [panel, setPanel] = useState(null); // {type:'parcelle', fid, lngLat} | {type:'carnet'} | {type:'especes'}
  const [sorties, setSorties] = useState([]);
  const [carnetOn, setCarnetOn] = useState(false);

  /* ---------- Données ---------- */
  const loadSpecies = useCallback(async () => {
    const r = await fetch('/api/species');
    if (r.ok) { const j = await r.json(); setSpecies(j.species); setEditable(j.editable); }
  }, []);
  const loadSorties = useCallback(async () => {
    const r = await fetch('/api/sorties');
    if (r.ok) { const j = await r.json(); setSorties(j.sorties); setCarnetOn(j.enabled); }
  }, []);
  useEffect(() => { loadSpecies(); loadSorties(); }, [loadSpecies, loadSorties]);

  const ensureMeteo = useCallback(async (key) => {
    if (meteoRef.current.has(key)) return;
    meteoRef.current.set(key, 'loading');
    const [lat, lon] = key.split(',').map(Number);
    try {
      const r = await fetch(`/api/meteo?lat=${lat}&lon=${lon}`);
      if (!r.ok) throw new Error();
      meteoRef.current.set(key, await r.json());
      setMeteoTick((t) => t + 1);
    } catch { meteoRef.current.delete(key); setError('Météo indisponible pour le moment.'); }
  }, []);

  const loadTile = useCallback(async (tx, ty) => {
    const k = `${tx}:${ty}`;
    if (tilesLoaded.current.has(k)) return;
    tilesLoaded.current.add(k);
    const ck = cellKey((ty + 0.5) * TILE, (tx + 0.5) * TILE);
    ensureMeteo(ck);
    setLoading((n) => n + 1);
    try {
      const r = await fetch(`/api/forest?tx=${tx}&ty=${ty}`);
      if (!r.ok) throw new Error();
      const j = await r.json();
      for (const f of j.features) {
        const ex = features.current.get(f.properties.fid);
        if (ex) continue;
        f.properties.ck = ck;
        features.current.set(f.properties.fid, f);
      }
      setFeatTick((t) => t + 1);
    } catch {
      tilesLoaded.current.delete(k);
      setError('Les parcelles IGN ne répondent pas, réessaie en bougeant la carte.');
    } finally { setLoading((n) => n - 1); }
  }, [ensureMeteo]);

  const loadVisible = useCallback(() => {
    const m = map.current; if (!m) return;
    const z = m.getZoom();
    setZoomOk(z >= MIN_ZOOM_FOREST);
    const c = m.getCenter();
    ensureMeteo(cellKey(c.lat, c.lng));
    if (z < MIN_ZOOM_FOREST) return;
    const b = m.getBounds();
    const x0 = Math.floor(b.getWest() / TILE); const x1 = Math.floor(b.getEast() / TILE);
    const y0 = Math.floor(b.getSouth() / TILE); const y1 = Math.floor(b.getNorth() / TILE);
    const tiles = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push([x, y]);
    const cx = c.lng / TILE; const cy = c.lat / TILE;
    tiles.sort((a, b2) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b2[0] - cx, b2[1] - cy));
    tiles.slice(0, 16).forEach(([x, y]) => loadTile(x, y));
  }, [ensureMeteo, loadTile]);

  /* ---------- Météo de référence (centre) ---------- */
  const refMeteo = useMemo(() => {
    for (const v of meteoRef.current.values()) if (v && v !== 'loading') return v;
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meteoTick]);
  const todayIso = todayParis();
  const dayIso = useMemo(() => {
    if (!refMeteo) return todayIso;
    const i = Math.max(0, Math.min(refMeteo.time.length - 1, dayIndex(refMeteo, todayIso) + offset));
    return refMeteo.time[i];
  }, [refMeteo, offset, todayIso]);

  /* ---------- Calcul des scores ---------- */
  const evalFeature = useCallback((f, onlySel = true) => {
    const M = meteoRef.current.get(f.properties.ck);
    if (!M || M === 'loading') return null;
    const i = dayIndex(M, dayIso);
    const h = f.properties.h || 0;
    const list = species.filter((s) => (s.habitats || []).includes(f.properties.hab));
    const pick = onlySel && sel !== 'best' ? list.filter((s) => s.id === sel) : list;
    if (!pick.length) return { best: null, all: [] };
    const all = pick.map((s) => ({ s, r: evalSpecies(s, M, i, h) }));
    const best = all.reduce((a, b) => (b.r.score > a.r.score ? b : a), all[0]);
    return { best, all };
  }, [species, sel, dayIso]);

  useEffect(() => {
    const m = map.current; if (!m || !m.isStyleLoaded() || !m.getSource('forest')) return;
    const out = [];
    for (const f of features.current.values()) {
      const e = evalFeature(f);
      const st = !e ? 'na' : e.best ? e.best.r.status : 'na';
      const sc = e && e.best ? e.best.r.score : 0;
      out.push({ ...f, properties: { ...f.properties, st, sc, fit: !!(e && e.best) } });
    }
    m.getSource('forest').setData({ type: 'FeatureCollection', features: out });
  }, [featTick, meteoTick, evalFeature]);

  useEffect(() => {
    const m = map.current; if (!m || !m.getSource('sorties')) return;
    m.getSource('sorties').setData({
      type: 'FeatureCollection',
      features: sorties.filter((s) => s.lat != null).map((s) => ({ type: 'Feature', properties: { r: s.resultat }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })),
    });
  }, [sorties, featTick]);

  /* ---------- Carte ---------- */
  useEffect(() => {
    let m;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      m = new maplibregl.Map({
        container: mapEl.current,
        center: CENTER, zoom: 12.3, minZoom: 8, maxZoom: 18, attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            plan: { type: 'raster', tiles: [IGN('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png')], tileSize: 256, maxzoom: 19, attribution: '© IGN Géoplateforme' },
            ortho: { type: 'raster', tiles: [IGN('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg')], tileSize: 256, maxzoom: 19, attribution: '© IGN Géoplateforme' },
            forest: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
            sorties: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
            selected: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          },
          layers: [
            { id: 'plan', type: 'raster', source: 'plan' },
            { id: 'ortho', type: 'raster', source: 'ortho', layout: { visibility: 'none' } },
            {
              id: 'forest-fill', type: 'fill', source: 'forest',
              paint: {
                'fill-color': ['match', ['get', 'st'], 'ouverte', STATUS_COLOR.ouverte, 'faible', STATUS_COLOR.faible, 'prepare', STATUS_COLOR.prepare, 'fermee', STATUS_COLOR.fermee, 'annulee', STATUS_COLOR.annulee, 'rien', STATUS_COLOR.rien, STATUS_COLOR.na],
                'fill-opacity': ['case', ['!', ['get', 'fit']], 0.08, ['match', ['get', 'st'], 'ouverte', ['interpolate', ['linear'], ['get', 'sc'], 45, 0.4, 100, 0.72], 'faible', 0.38, 'prepare', 0.42, 'fermee', 0.35, 'annulee', 0.35, 0.18]],
              },
            },
            { id: 'forest-line', type: 'line', source: 'forest', paint: { 'line-color': '#2B3A26', 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 16, 1] } },
            { id: 'selected-line', type: 'line', source: 'selected', paint: { 'line-color': '#1F2A1C', 'line-width': 3 } },
            { id: 'sorties', type: 'circle', source: 'sorties', paint: { 'circle-radius': 6, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff', 'circle-color': ['match', ['get', 'r'], 'bonne', '#B9771A', 'quelques', '#E2A43A', '#6E7867'] } },
          ],
        },
      });
      map.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      const geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true });
      geo.on('geolocate', (e) => { geoPos.current = { lat: e.coords.latitude, lon: e.coords.longitude }; });
      m.addControl(geo, 'top-right');
      m.on('load', () => { loadVisible(); setFeatTick((t) => t + 1); });
      m.on('moveend', loadVisible);
      m.on('click', 'forest-fill', (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        const full = features.current.get(f.properties.fid);
        m.getSource('selected').setData(full ? { type: 'FeatureCollection', features: [full] } : { type: 'FeatureCollection', features: [] });
        setPanel({ type: 'parcelle', fid: f.properties.fid, lngLat: { lat: e.lngLat.lat, lon: e.lngLat.lng } });
      });
      m.on('mouseenter', 'forest-fill', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'forest-fill', () => { m.getCanvas().style.cursor = ''; });
    })();
    return () => { if (m) m.remove(); };
  }, [loadVisible]);

  useEffect(() => {
    const m = map.current; if (!m || !m.getLayer('plan')) return;
    m.setLayoutProperty('plan', 'visibility', base === 'plan' ? 'visible' : 'none');
    m.setLayoutProperty('ortho', 'visibility', base === 'ortho' ? 'visible' : 'none');
  }, [base]);

  const closePanel = () => {
    setPanel(null);
    map.current?.getSource('selected')?.setData({ type: 'FeatureCollection', features: [] });
  };

  /* ---------- Rendu ---------- */
  const days = refMeteo ? (() => {
    const i0 = dayIndex(refMeteo, todayIso);
    const arr = [];
    for (let o = -7; o <= 9; o++) {
      const i = i0 + o; if (i < 0 || i >= refMeteo.time.length) continue;
      const d = new Date(`${refMeteo.time[i]}T12:00:00`);
      arr.push({ o, iso: refMeteo.time[i], wd: o === 0 ? 'auj.' : WEEKDAY[d.getDay()], n: d.getDate(), rain: refMeteo.rain[i] });
    }
    return arr;
  })() : [];

  return (
    <div className="app">
      <div id="map" ref={mapEl} />

      <div className="topbar">
        <div className="row" role="group" aria-label="Espèce">
          <button type="button" className="chip" aria-pressed={sel === 'best'} onClick={() => setSel('best')}>Toutes</button>
          {species.slice().sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99)).map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={sel === s.id} onClick={() => setSel(s.id)}>{s.nom}</button>
          ))}
        </div>
        {days.length > 0 && (
          <div className="row" role="group" aria-label="Jour">
            {days.map((d) => (
              <button key={d.iso} type="button" className={`day${d.o > 0 ? ' fc' : ''}`} aria-pressed={offset === d.o} onClick={() => setOffset(d.o)} title={fmtD(d.iso)}>
                <small>{d.wd}</small><b>{d.n}</b><span className="rain">{d.rain >= 0.5 ? `${Math.round(d.rain)} mm` : ' '}</span>
              </button>
            ))}
          </div>
        )}
        {!zoomOk && <div className="hint">Zoome pour afficher les parcelles forestières</div>}
        {zoomOk && loading > 0 && <div className="hint">Chargement des parcelles IGN…</div>}
        {error && <div className="hint" role="status" onClick={() => setError('')}>{error}</div>}
      </div>

      <div className="legend" aria-label="Légende">
        <span><i style={{ background: STATUS_COLOR.ouverte }} />Fenêtre ouverte</span>
        <span><i style={{ background: STATUS_COLOR.faible }} />Ouverte, faible</span>
        <span><i style={{ background: STATUS_COLOR.prepare }} />Ça se prépare</span>
        <span><i style={{ background: STATUS_COLOR.fermee }} />Se ferme / cassée</span>
        <span><i style={{ background: STATUS_COLOR.rien }} />Rien en vue</span>
      </div>

      <div className="basemap">
        <button type="button" className="chip" onClick={() => setBase(base === 'plan' ? 'ortho' : 'plan')}>{base === 'plan' ? 'Photo aérienne' : 'Plan IGN'}</button>
      </div>

      {!panel && (
        <div className="dock">
          <button type="button" className="chip" onClick={() => setPanel({ type: 'carnet' })}>Carnet</button>
          <button type="button" className="chip" onClick={() => setPanel({ type: 'especes' })}>Espèces et seuils</button>
        </div>
      )}

      {panel?.type === 'parcelle' && (
        <Parcelle f={features.current.get(panel.fid)} evalFeature={evalFeature} species={species} dayIso={dayIso}
          onClose={closePanel} onNote={() => setPanel({ type: 'carnet', at: panel.lngLat })} />
      )}
      {panel?.type === 'carnet' && (
        <Carnet sorties={sorties} species={species} enabled={carnetOn} at={panel.at} geoPos={geoPos}
          onClose={closePanel} reload={loadSorties} />
      )}
      {panel?.type === 'especes' && (
        <Especes species={species} editable={editable} onClose={closePanel} reload={loadSpecies} />
      )}
    </div>
  );
}

function Sheet({ title, sub, onClose, children }) {
  return (
    <section className="sheet" aria-label={title}>
      <div className="sheet-head">
        <div><h2>{title}</h2>{sub && <p className="note">{sub}</p>}</div>
        <button type="button" className="close" onClick={onClose} aria-label="Fermer">×</button>
      </div>
      <div className="sheet-body">{children}</div>
    </section>
  );
}

function Parcelle({ f, evalFeature, species, dayIso, onClose, onNote }) {
  if (!f) return null;
  const p = f.properties;
  const e = evalFeature(f, false);
  const others = species.filter((s) => !(s.habitats || []).includes(p.hab));
  return (
    <Sheet title={HABITATS[p.hab] || 'Parcelle'} sub={`${p.tfv}${dayIso ? ` · ${fmtD(dayIso)}` : ''}`} onClose={onClose}>
      <div className="facts">
        <div className="fact"><span className="label">Humidité locale</span><b>{Math.round((p.h || 0) * 100)} %</b></div>
        <div className="fact"><span className="label">Eau la plus proche</span><b>{p.dw == null ? '> 1,5 km' : `${p.dw} m`}</b>{p.wn && <span className="note">{p.wn}</span>}</div>
      </div>
      {!e && <p className="note">Météo en cours de chargement…</p>}
      {e && e.all.length === 0 && <p className="note">Aucune des espèces suivies n'est associée à ce type de forêt.</p>}
      {e && e.all.slice().sort((a, b) => b.r.score - a.r.score).map(({ s, r }) => (
        <div className="sp" key={s.id}>
          <div className="sp-top">
            <div><h3>{s.nom}</h3><span className={`pill s-${r.status}`}>{STATUS_LABEL[r.status]}</span></div>
            <span className="score">{r.score}</span>
          </div>
          <ul className="reasons">{r.reasons.map((t) => <li key={t}>{t}</li>)}</ul>
          <div className="tips">
            {s.arbres && <p>{s.arbres}</p>}
            {s.conseils?.length > 0 && <ul>{s.conseils.map((c) => <li key={c}>{c}</li>)}</ul>}
          </div>
          {s.confusions && <p className="confusion"><strong>Confusions :</strong> {s.confusions}</p>}
        </div>
      ))}
      {others.length > 0 && <p className="note">Pas attendus sur ce type de forêt : {others.map((s) => s.nom).join(', ')}.</p>}
      <div className="actions"><button type="button" className="btn" onClick={onNote}>Noter une sortie ici</button></div>
    </Sheet>
  );
}

function Carnet({ sorties, species, enabled, at, geoPos, onClose, reload }) {
  const [form, setForm] = useState({ date: todayParis(), espece: species[0]?.id || 'autre', resultat: 'rien', kg: '', note: '' });
  const [where, setWhere] = useState(at ? 'parcelle' : 'aucun');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(null);
  const name = (id) => species.find((s) => s.id === id)?.nom || 'Autre';
  async function submit(e) {
    e.preventDefault();
    let pos = null;
    if (where === 'parcelle' && at) pos = at;
    if (where === 'gps') pos = geoPos.current;
    setBusy(true);
    const r = await fetch('/api/sorties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, lat: pos?.lat ?? null, lon: pos?.lon ?? null }) });
    setBusy(false);
    if (r.ok) { setMsg('Sortie ajoutée.'); setForm({ ...form, kg: '', note: '' }); reload(); } else setMsg("Ajout impossible pour le moment.");
  }
  async function del(id) {
    if (armed !== id) { setArmed(id); return; }
    await fetch(`/api/sorties?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setArmed(null); reload();
  }
  return (
    <Sheet title="Carnet de sorties" sub="Note chaque sortie, même bredouille : c'est ce qui cale les seuils." onClose={onClose}>
      {!enabled && <p className="banner">Le carnet a besoin de la base de données. Elle n'est pas encore branchée sur Vercel.</p>}
      <form className="grid" onSubmit={submit}>
        <label className="f">Date<input id="c-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
        <label className="f">Espèce
          <select id="c-sp" value={form.espece} onChange={(e) => setForm({ ...form, espece: e.target.value })}>
            {species.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}<option value="autre">Autre</option>
          </select>
        </label>
        <label className="f">Résultat
          <select id="c-res" value={form.resultat} onChange={(e) => setForm({ ...form, resultat: e.target.value })}>
            <option value="rien">Rien</option><option value="quelques">Quelques-uns</option><option value="bonne">Belle récolte</option>
          </select>
        </label>
        <label className="f">Poids (kg)<input id="c-kg" type="number" min="0" step="0.1" inputMode="decimal" value={form.kg} onChange={(e) => setForm({ ...form, kg: e.target.value })} /></label>
        <label className="f wide">Position
          <select id="c-where" value={where} onChange={(e) => setWhere(e.target.value)}>
            {at && <option value="parcelle">Parcelle sélectionnée</option>}
            <option value="gps">Ma position (bouton cible de la carte)</option>
            <option value="aucun">Sans position</option>
          </select>
        </label>
        <label className="f wide">Observations<input id="c-note" type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Sol, mousse, lisière, quantité…" /></label>
        <div className="wide actions"><button className="btn" disabled={busy || !enabled}>Ajouter la sortie</button></div>
      </form>
      {msg && <p className="note" role="status">{msg}</p>}
      <div>
        {sorties.length === 0 && <p className="note">Pas encore de sortie notée.</p>}
        {sorties.map((s) => (
          <div className="list-row" key={s.id}>
            <div><strong>{fmtD(s.date)} · {name(s.espece)}</strong><br /><span>{RES[s.resultat] || s.resultat}{s.kg != null ? ` · ${s.kg} kg` : ''}{s.lat != null ? ' · sur la carte' : ''}</span>{s.note && <p className="note">{s.note}</p>}</div>
            <button type="button" className="btn ghost" onClick={() => del(s.id)}>{armed === s.id ? 'Confirmer' : 'Retirer'}</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

const NUM_FIELDS = [
  ['pluieMm', 'Pluie déclenchante (mm)'], ['pluieJours', 'Sur combien de jours'],
  ['latenceMin', 'Ouverture (J+)'], ['latencePic', 'Pic (J+)'], ['latenceMax', 'Fermeture (J+)'],
  ['tmaxMin', 'Max idéale, bas (°C)'], ['tmaxMax', 'Max idéale, haut (°C)'],
  ['gelSeuil', 'Gel qui casse (min °C)'], ['chaleurMax', 'Chaleur qui casse (max °C)'], ['secJours', 'Jours secs tolérés'],
];

function Especes({ species, editable, onClose, reload }) {
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState('');
  const [armed, setArmed] = useState(null);
  const blank = { nom: '', latin: '', arbres: '', habitats: ['pin'], mois: [9, 10, 11], pluieMm: 25, pluieJours: 5, latenceMin: 7, latencePic: 10, latenceMax: 15, tmaxMin: 10, tmaxMax: 20, gelSeuil: -1, chaleurMax: 25, secJours: 6, conseils: [], confusions: '' };
  async function save(e) {
    e.preventDefault();
    const b = { ...edit };
    NUM_FIELDS.forEach(([k]) => { b[k] = Number(b[k]); });
    b.mois = String(b.moisTxt ?? b.mois.join(',')).split(/[,\s]+/).map(Number).filter((m) => m >= 1 && m <= 12);
    b.conseils = String(b.conseilsTxt ?? b.conseils.join('\n')).split('\n').map((s) => s.trim()).filter(Boolean);
    delete b.moisTxt; delete b.conseilsTxt;
    if (!(b.latenceMin <= b.latencePic && b.latencePic <= b.latenceMax)) { setMsg("Le délai doit aller dans l'ordre : ouverture ≤ pic ≤ fermeture."); return; }
    const r = await fetch('/api/species', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    if (r.ok) { setMsg('Espèce enregistrée.'); setEdit(null); reload(); } else setMsg('Enregistrement impossible.');
  }
  async function del(id) {
    if (armed !== id) { setArmed(id); return; }
    await fetch(`/api/species?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setArmed(null); reload();
  }
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  return (
    <Sheet title="Espèces et seuils" sub="Valeurs de départ, à ajuster avec le carnet." onClose={onClose}>
      {!editable && <p className="banner">Les modifications seront possibles une fois la base de données branchée sur Vercel.</p>}
      {!edit && (
        <div>
          {species.map((s) => (
            <div className="list-row" key={s.id}>
              <div><strong>{s.nom}</strong><br /><span className="note">{(s.habitats || []).map((h) => HABITATS[h]).join(', ')} · {s.pluieMm} mm · J+{s.latenceMin} à J+{s.latenceMax}</span></div>
              {editable && (
                <div className="actions">
                  <button type="button" className="btn ghost" onClick={() => setEdit({ ...s })}>Modifier</button>
                  <button type="button" className="btn danger" onClick={() => del(s.id)}>{armed === s.id ? 'Confirmer' : 'Suppr.'}</button>
                </div>
              )}
            </div>
          ))}
          {editable && <div className="actions" style={{ marginTop: 12 }}><button type="button" className="btn ghost" onClick={() => setEdit({ ...blank })}>Ajouter une espèce</button></div>}
        </div>
      )}
      {edit && (
        <form className="grid" onSubmit={save}>
          <label className="f wide">Nom<input id="e-nom" value={edit.nom} onChange={set('nom')} required /></label>
          <label className="f wide">Nom latin<input id="e-latin" value={edit.latin || ''} onChange={set('latin')} /></label>
          <div className="wide"><span className="label">Types de forêt</span>
            <div className="checks">
              {Object.entries(HABITATS).filter(([k]) => k !== 'autre').map(([k, v]) => (
                <label key={k}><input type="checkbox" checked={(edit.habitats || []).includes(k)} onChange={(e) => setEdit({ ...edit, habitats: e.target.checked ? [...(edit.habitats || []), k] : (edit.habitats || []).filter((x) => x !== k) })} />{v}</label>
              ))}
            </div>
          </div>
          <label className="f wide">Mois de pousse (ex. 9,10,11)<input id="e-mois" value={edit.moisTxt ?? (edit.mois || []).join(',')} onChange={(e) => setEdit({ ...edit, moisTxt: e.target.value })} /></label>
          {NUM_FIELDS.map(([k, l]) => (
            <label className="f" key={k}>{l}<input id={`e-${k}`} type="number" step="0.5" value={edit[k]} onChange={set(k)} required /></label>
          ))}
          <label className="f wide">Milieu<input id="e-arbres" value={edit.arbres || ''} onChange={set('arbres')} /></label>
          <label className="f wide">Conseils (un par ligne)<textarea id="e-conseils" value={edit.conseilsTxt ?? (edit.conseils || []).join('\n')} onChange={(e) => setEdit({ ...edit, conseilsTxt: e.target.value })} /></label>
          <label className="f wide">Confusions à éviter<textarea id="e-conf" value={edit.confusions || ''} onChange={set('confusions')} /></label>
          <div className="wide actions"><button className="btn">Enregistrer</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Annuler</button></div>
        </form>
      )}
      {msg && <p className="note" role="status">{msg}</p>}
    </Sheet>
  );
}
