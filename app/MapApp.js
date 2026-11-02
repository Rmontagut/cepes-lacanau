'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evalSpecies, STATUS_LABEL, fmtD, todayParis, dayIndex } from '../lib/engine';
import { HABITATS } from '../lib/species';

const TILE = 0.03;
const MIN_ZOOM_FOREST = 11.5;
const CENTER = [-1.11, 44.99];
const IGN = (layer, fmt) => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${fmt}`;
const STATUS_COLOR = { ouverte: '#13A538', faible: '#A3CF3A', prepare: '#F2A007', fermee: '#D9472B', annulee: '#8E2F23', rien: '#8A8F86', hors: '#B7BDAF', na: '#B7BDAF' };
const STATUS_FILL = ['match', ['get', 'st'], 'ouverte', '#13A538', 'faible', '#A3CF3A', 'prepare', '#F2A007', 'fermee', '#D9472B', 'annulee', '#8E2F23', 'rien', '#8A8F86', '#B7BDAF'];
const HAB_FILL = ['match', ['get', 'hab'], 'pin', '#2F6B3C', 'conifere', '#6FA46A', 'chene', '#B9771A', 'chene_vert', '#7B5530', 'feuillus', '#D8B530', 'melange', '#6E7FC0', '#B4B8AE'];
const FILL_OPACITY = ['case', ['!', ['get', 'fit']], 0, ['match', ['get', 'st'], 'ouverte', ['interpolate', ['linear'], ['get', 'sc'], 45, 0.55, 100, 0.85], 'faible', 0.5, 'prepare', 0.55, 'fermee', 0.45, 'annulee', 0.45, 0.22]];
const FILL_OPACITY_SOFT = ['case', ['!', ['get', 'fit']], 0, ['match', ['get', 'st'], 'ouverte', 0.3, 'faible', 0.22, 'prepare', 0.2, 0.08]];
export const HAB_COLOR = { pin: '#2F6B3C', conifere: '#6FA46A', chene: '#B9771A', chene_vert: '#7B5530', feuillus: '#D8B530', melange: '#6E7FC0', autre: '#B4B8AE' };
function pointInGeom(pt, geom) {
  const [x, y] = pt;
  for (const poly of geom.coordinates) {
    let inside = false;
    poly.forEach((ring, ri) => {
      let c = false;
      for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
        const [xi, yi] = ring[a]; const [xj, yj] = ring[b];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      if (ri === 0) inside = c; else if (c) inside = false;
    });
    if (inside) return true;
  }
  return false;
}
const WEEKDAY = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const RES = { rien: 'Rien', quelques: 'Quelques-uns', bonne: 'Belle récolte' };
// Météo par tuile (~2,5 × 3,3 km), au centre de la tuile
const cellKey = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;
const tileCenterKey = (lat, lon) => cellKey((Math.floor(lat / 0.03) + 0.5) * 0.03, (Math.floor(lon / 0.03) + 0.5) * 0.03);
// ++ : score haut ET aucune condition défavorable ce jour-là
const tierOf = (sc, pen = 0) => (sc >= 85 && pen === 0 ? 3 : sc >= 65 ? 2 : 1);
const SPECIES_COLOR = { cepes: ['#7A4A24', '#F2E6D2'], girolle: ['#E8A317', '#F6D27A'], 'chanterelle-tube': ['#5E5444', '#E2C54B'], 'lactaire-delicieux': ['#E2662A', '#F4B07E'] };
function colorFor(id) {
  if (SPECIES_COLOR[id]) return SPECIES_COLOR[id];
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return [`hsl(${h} 55% 38%)`, `hsl(${h} 50% 85%)`];
}

// Icône champignon dessinée en canvas (chapeau + pied), contour clair pour se lire sur tous les fonds
function mushroomImage(cap, stem, tier = 1) {
  const S = 64; const W = tier >= 2 ? 92 : 64; const c = document.createElement('canvas'); c.width = W; c.height = S;
  const g = c.getContext('2d');
  g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = '#FFFFFF';
  const drawStem = () => { g.beginPath(); g.moveTo(25, 34); g.quadraticCurveTo(22, 54, 26, 58); g.lineTo(38, 58); g.quadraticCurveTo(42, 54, 39, 34); g.closePath(); };
  const drawCap = () => { g.beginPath(); g.moveTo(8, 36); g.bezierCurveTo(8, 10, 56, 10, 56, 36); g.quadraticCurveTo(32, 42, 8, 36); g.closePath(); };
  drawStem(); g.stroke(); drawCap(); g.stroke();
  drawStem(); g.fillStyle = stem; g.fill();
  drawCap(); g.fillStyle = cap; g.fill();
  g.beginPath(); g.ellipse(24, 22, 5, 3, -0.4, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.35)'; g.fill();
  if (tier >= 2) {
    const label = tier === 3 ? '++' : '+';
    g.beginPath(); g.roundRect(54, 2, tier === 3 ? 36 : 26, 24, 12); g.fillStyle = tier === 3 ? '#13A538' : '#1F2A1C'; g.fill();
    g.lineWidth = 3; g.strokeStyle = '#FFFFFF'; g.stroke();
    g.fillStyle = '#FFFFFF'; g.font = 'bold 20px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, tier === 3 ? 72 : 67, 15);
  }
  return g.getImageData(0, 0, W, S);
}

// Plusieurs espèces mûres sur une même parcelle : champignons groupés en paquet
function bundleImage(ids, tier) {
  if (ids.length === 1) { const [cap, stem] = colorFor(ids[0]); return mushroomImage(cap, stem, tier); }
  const S = 64; const step = 18; const W = 64 + step * (ids.length - 1) + (tier >= 2 ? 30 : 0);
  const c = document.createElement('canvas'); c.width = W; c.height = S;
  const g = c.getContext('2d'); g.lineJoin = 'round';
  // du fond vers l'avant : le meilleur score devant, à gauche
  for (let k = ids.length - 1; k >= 0; k--) {
    const [cap, stem] = colorFor(ids[k]);
    const sc = k === 0 ? 1 : 0.86;
    g.save(); g.translate(k * step + (1 - sc) * 32, (1 - sc) * 60); g.scale(sc, sc);
    const drawStem = () => { g.beginPath(); g.moveTo(25, 34); g.quadraticCurveTo(22, 54, 26, 58); g.lineTo(38, 58); g.quadraticCurveTo(42, 54, 39, 34); g.closePath(); };
    const drawCap = () => { g.beginPath(); g.moveTo(8, 36); g.bezierCurveTo(8, 10, 56, 10, 56, 36); g.quadraticCurveTo(32, 42, 8, 36); g.closePath(); };
    g.lineWidth = 5; g.strokeStyle = '#FFFFFF';
    drawStem(); g.stroke(); drawCap(); g.stroke();
    drawStem(); g.fillStyle = stem; g.fill(); drawCap(); g.fillStyle = cap; g.fill();
    g.restore();
  }
  if (tier >= 2) {
    const label = tier === 3 ? '++' : '+'; const bx = W - (tier === 3 ? 38 : 28);
    g.beginPath(); g.roundRect(bx, 2, tier === 3 ? 36 : 26, 24, 12); g.fillStyle = tier === 3 ? '#13A538' : '#1F2A1C'; g.fill();
    g.lineWidth = 3; g.strokeStyle = '#FFFFFF'; g.stroke();
    g.fillStyle = '#FFFFFF'; g.font = 'bold 20px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, bx + (tier === 3 ? 18 : 13), 15);
  }
  return g.getImageData(0, 0, W, S);
}

// Point intérieur d'un polygone : milieu du plus long segment horizontal au niveau du centroïde
function interiorPoint(geom) {
  let best = null; let bestA = -1;
  for (const poly of geom.coordinates) {
    const ring = poly[0]; let a = 0;
    for (let k = 0; k < ring.length - 1; k++) a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = poly; }
  }
  if (!best) return null;
  const ring = best[0];
  let y = 0; for (const p of ring) y += p[1]; y /= ring.length;
  const xs = [];
  for (const r of best) for (let k = 0; k < r.length - 1; k++) {
    const [x1, y1] = r[k]; const [x2, y2] = r[k + 1];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
  }
  xs.sort((a, b) => a - b);
  let mx = null; let w = -1;
  for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > w) { w = xs[k + 1] - xs[k]; mx = (xs[k] + xs[k + 1]) / 2; }
  return mx == null ? ring[0] : [mx, y];
}

export default function MapApp() {
  const mapEl = useRef(null);
  const map = useRef(null);
  const features = useRef(new Map()); // fid -> feature
  const tilesLoaded = useRef(new Set());
  const meteoRef = useRef(new Map()); // cellKey -> meteo | 'loading'
  const geoPos = useRef(null);
  const centerKey = useRef(null);

  const [species, setSpecies] = useState([]);
  const [editable, setEditable] = useState(false);
  const [spOff, setSpOff] = useState([]); // espèces masquées
  const [drawer, setDrawer] = useState(false);
  const [offset, setOffset] = useState(0);
  const [meteoTick, setMeteoTick] = useState(0);
  const [featTick, setFeatTick] = useState(0);
  const [zoomOk, setZoomOk] = useState(true);
  const [loading, setLoading] = useState(0);
  const [error, setError] = useState('');
  const [base, setBase] = useState('plan');
  const [view, setView] = useState('champis'); // 'champis' | 'zones' | 'essences'
  const [habOff, setHabOff] = useState([]); // essences masquées
  const findForest = useCallback((pos) => {
    if (!pos) return null;
    for (const f of features.current.values()) if (pointInGeom([pos.lon, pos.lat], f.geometry)) return f.properties;
    return null;
  }, []);
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
      const r = await fetch(`/api/forest?tx=${tx}&ty=${ty}&v=2`);
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
    const ck0 = tileCenterKey(c.lat, c.lng);
    centerKey.current = ck0;
    ensureMeteo(ck0);
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
    const c = meteoRef.current.get(centerKey.current);
    if (c && c !== 'loading') return c;
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
  const evalFeatureOn = useCallback((f, iso, onlySel = true) => {
    const M = meteoRef.current.get(f.properties.ck);
    if (!M || M === 'loading') return null;
    const i = dayIndex(M, iso);
    const h = f.properties.h || 0;
    const list = species.filter((s) => (s.habitats || []).includes(f.properties.hab));
    const pick = onlySel ? list.filter((s) => !spOff.includes(s.id)) : list;
    if (!pick.length) return { best: null, all: [] };
    const all = pick.map((s) => ({ s, r: evalSpecies(s, M, i, h) }));
    const best = all.reduce((a, b) => (b.r.score > a.r.score ? b : a), all[0]);
    return { best, all };
  }, [species, spOff]);
  const evalFeature = useCallback((f, onlySel = true) => evalFeatureOn(f, dayIso, onlySel), [evalFeatureOn, dayIso]);

  // Potentiel de chaque jour sur la zone chargée : score atteint par les 10 % meilleures parcelles
  const dayPotential = useMemo(() => {
    if (!refMeteo) return {};
    const i0 = dayIndex(refMeteo, todayIso);
    const feats = [...features.current.values()];
    const step = Math.max(1, Math.floor(feats.length / 1500));
    const out = {};
    for (let o = -7; o <= 9; o++) {
      const i = i0 + o; if (i < 0 || i >= refMeteo.time.length) continue;
      const iso = refMeteo.time[i];
      const scores = [];
      for (let k = 0; k < feats.length; k += step) {
        const e = evalFeatureOn(feats[k], iso);
        if (e && e.best) scores.push(e.best.r.status === 'ouverte' || e.best.r.status === 'faible' ? e.best.r.score : 0);
      }
      scores.sort((a, b) => b - a);
      out[o] = scores.length ? scores[Math.floor(scores.length * 0.1)] : 0;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refMeteo, featTick, meteoTick, evalFeatureOn, todayIso]);
  const bestDay = useMemo(() => {
    let b = null; let v = 44;
    for (const [o, sc] of Object.entries(dayPotential)) if (Number(o) >= 0 && sc > v) { v = sc; b = Number(o); }
    return b;
  }, [dayPotential]);

  useEffect(() => {
    const m = map.current; if (!m || !m.isStyleLoaded() || !m.getSource('forest')) return;
    const out = [];
    const ripe = [];
    for (const f of features.current.values()) {
      const e = evalFeature(f);
      const st = !e ? 'na' : e.best ? e.best.r.status : 'na';
      const sc = e && e.best ? e.best.r.score : 0;
      out.push({ ...f, properties: { ...f.properties, st, sc, fit: !!(e && e.best) } });
      const ripeSp = e && e.all ? e.all.filter((x) => x.r.status === 'ouverte').sort((x, y) => y.r.score - x.r.score) : [];
      if (ripeSp.length) {
        if (!f.properties._ip) f.properties._ip = interiorPoint(f.geometry);
        const ip = f.properties._ip;
        if (ip) {
          const ids = ripeSp.slice(0, 3).map((x) => x.s.id);
          const tier = tierOf(ripeSp[0].r.score, ripeSp[0].r.pen);
          const img = `mush-${ids.join('+')}-${tier}`;
          if (!m.hasImage(img)) m.addImage(img, bundleImage(ids, tier), { pixelRatio: 2 });
          ripe.push({ type: 'Feature', properties: { fid: f.properties.fid, hab: f.properties.hab, icon: img, sc: ripeSp[0].r.score, tier, n: ripeSp.length }, geometry: { type: 'Point', coordinates: ip } });
        }
      }
    }
    m.getSource('forest').setData({ type: 'FeatureCollection', features: out });
    m.getSource('ripe').setData({ type: 'FeatureCollection', features: ripe });
  }, [featTick, meteoTick, evalFeature]);

  useEffect(() => {
    const m = map.current; if (!m || !m.getLayer('ripe')) return;
    ['ripe', 'ripe-heat', 'ripe-glow'].forEach((l) => m.setLayoutProperty(l, 'visibility', view === 'champis' ? 'visible' : 'none'));
    m.setPaintProperty('forest-fill', 'fill-opacity', view === 'champis' ? FILL_OPACITY_SOFT : view === 'essences' ? 0.6 : FILL_OPACITY);
    m.setPaintProperty('forest-fill', 'fill-color', view === 'essences' ? HAB_FILL : STATUS_FILL);
    m.setFilter('forest-line', view === 'essences' ? null : ['==', ['get', 'fit'], true]);
  }, [view, featTick]);

  useEffect(() => {
    const m = map.current; if (!m || !m.getLayer('forest-fill')) return;
    const f = habOff.length ? ['!', ['in', ['get', 'hab'], ['literal', habOff]]] : null;
    m.setFilter('forest-fill', f);
    m.setFilter('ripe', f);
    m.setFilter('ripe-heat', f);
    m.setFilter('ripe-glow', f ? ['all', f, ['==', ['get', 'tier'], 3]] : ['==', ['get', 'tier'], 3]);
  }, [habOff, featTick]);

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
            ripe: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          },
          layers: [
            // Plan IGN grisé : ses forêts vertes ne doivent pas concurrencer l'indice
            { id: 'plan', type: 'raster', source: 'plan', paint: { 'raster-saturation': -0.9, 'raster-contrast': -0.05, 'raster-brightness-min': 0.08 } },
            { id: 'ortho', type: 'raster', source: 'ortho', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.6 } },
            {
              id: 'forest-fill', type: 'fill', source: 'forest',
              paint: {
                'fill-color': STATUS_FILL,
                'fill-opacity': FILL_OPACITY_SOFT,
              },
            },
            { id: 'forest-line', type: 'line', source: 'forest', filter: ['==', ['get', 'fit'], true], paint: { 'line-color': '#2B3A26', 'line-opacity': 0.3, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 16, 1] } },
            { id: 'selected-line', type: 'line', source: 'selected', paint: { 'line-color': '#1F2A1C', 'line-width': 3 } },
            {
              // Nappe de probabilité : se lit de loin, s'efface en zoomant au profit des icônes
              id: 'ripe-heat', type: 'heatmap', source: 'ripe', maxzoom: 15,
              paint: {
                'heatmap-weight': ['interpolate', ['linear'], ['get', 'sc'], 45, 0.15, 85, 0.7, 100, 1],
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 1.2],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 10, 12, 26, 15, 40],
                'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(242,160,7,0)', 0.25, 'rgba(242,160,7,0.25)', 0.55, 'rgba(232,110,20,0.45)', 0.85, 'rgba(200,50,20,0.6)', 1, 'rgba(150,20,10,0.7)'],
                'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.9, 15, 0.15],
              },
            },
            {
              id: 'ripe-glow', type: 'circle', source: 'ripe', filter: ['==', ['get', 'tier'], 3],
              paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 10, 16, 22], 'circle-color': '#FFD23F', 'circle-opacity': 0.45, 'circle-blur': 0.8, 'circle-translate': [0, -9] },
            },
            {
              id: 'ripe', type: 'symbol', source: 'ripe',
              layout: {
                'icon-image': ['get', 'icon'],
                'icon-size': ['match', ['get', 'tier'], 3, 1.05, 2, 0.8, 0.55],
                'icon-allow-overlap': ['step', ['zoom'], false, 14, true],
                'icon-anchor': 'bottom-left',
                'icon-offset': [-16, 0],
                'symbol-sort-key': ['-', 100, ['get', 'sc']],
              },
              paint: {
                'icon-opacity': ['match', ['get', 'tier'], 3, 1, 2, 0.95, 0.7],
              },
            },
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
      m.on('click', 'ripe', (e) => {
        const f = e.features && e.features[0]; if (!f) return;
        e.originalEvent.stopPropagation();
        const full = features.current.get(f.properties.fid);
        m.getSource('selected').setData(full ? { type: 'FeatureCollection', features: [full] } : { type: 'FeatureCollection', features: [] });
        setPanel({ type: 'parcelle', fid: f.properties.fid, lngLat: { lat: e.lngLat.lat, lon: e.lngLat.lng } });
      });
      m.on('mouseenter', 'ripe', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'ripe', () => { m.getCanvas().style.cursor = ''; });
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
      arr.push({ o, iso: refMeteo.time[i], wd: o === 0 ? 'auj.' : WEEKDAY[d.getDay()], n: d.getDate(), rain: refMeteo.rain[i], long: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) });
    }
    return arr;
  })() : [];

  return (
    <div className="app">
      <div id="map" ref={mapEl} />

      <div className="topbar">
        {days.length > 0 && (
          <DayStrip days={days} offset={offset} setOffset={setOffset} dayPotential={dayPotential} meteo={refMeteo} />
        )}
        {!zoomOk && <div className="hint">Zoome pour afficher les parcelles forestières</div>}
        {zoomOk && loading > 0 && <div className="hint">Chargement des parcelles IGN…</div>}
        {error && <div className="hint" role="status" onClick={() => setError('')}>{error}</div>}
      </div>

      <button type="button" className="basebtn" onClick={() => setBase(base === 'plan' ? 'ortho' : 'plan')}>{base === 'plan' ? 'Photo' : 'Plan'}</button>

      {!panel && (
        <div className="dock2">
          {drawer && (
            <div className="drawer" role="region" aria-label={`Réglages ${view}`}>
              {(view === 'champis' || view === 'zones') && (
                <>
                  <span className="label">Espèces affichées</span>
                  {species.map((s) => (
                    <label key={s.id} className="check">
                      <input type="checkbox" checked={!spOff.includes(s.id)} onChange={(e) => setSpOff(e.target.checked ? spOff.filter((x) => x !== s.id) : [...spOff, s.id])} />
                      <i className="mush" style={{ background: colorFor(s.id)[0] }} />{s.nom}
                    </label>
                  ))}
                </>
              )}
              {view === 'champis' && (
                <p className="note"><b>+</b> bonnes chances · <b>++</b> tout est réuni ce jour-là. La nappe orange montre où ça se concentre. ★ sur les jours : meilleur jour à venir.</p>
              )}
              {view === 'zones' && (
                <div className="swatches">
                  <span><i style={{ background: STATUS_COLOR.ouverte }} />Ouverte</span>
                  <span><i style={{ background: STATUS_COLOR.faible }} />Faible</span>
                  <span><i style={{ background: STATUS_COLOR.prepare }} />Se prépare</span>
                  <span><i style={{ background: STATUS_COLOR.fermee }} />Se ferme</span>
                  <span><i style={{ background: STATUS_COLOR.rien }} />Rien</span>
                </div>
              )}
              {view === 'essences' && (
                <>
                  <span className="label">Essences affichées</span>
                  {Object.entries(HABITATS).map(([k, v]) => (
                    <label key={k} className="check">
                      <input type="checkbox" checked={!habOff.includes(k)} onChange={(e) => setHabOff(e.target.checked ? habOff.filter((x) => x !== k) : [...habOff, k])} />
                      <i style={{ background: HAB_COLOR[k] }} />{v}
                    </label>
                  ))}
                </>
              )}
            </div>
          )}
          <div className="tabs" role="tablist" aria-label="Affichage">
            {[['champis', 'Champis', spOff.length], ['zones', 'Zones', spOff.length], ['essences', 'Essences', habOff.length]].map(([k, l, off]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} aria-expanded={view === k && drawer}
                onClick={() => { if (view === k) setDrawer(!drawer); else { setView(k); setDrawer(true); } }}>
                {l}{off > 0 && <span className="badge">{off}</span>}<span className="caret" aria-hidden="true">{view === k && drawer ? '▾' : '▴'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!panel && (
        <div className="fabs">
          <button type="button" className="fab" onClick={() => setPanel({ type: 'especes' })} aria-label="Espèces et seuils"><GearIcon /></button>
          <button type="button" className="fab primary" onClick={() => setPanel({ type: 'carnet' })} aria-label="Carnet de sorties"><PencilIcon /></button>
        </div>
      )}


      {panel?.type === 'parcelle' && (
        <Parcelle f={features.current.get(panel.fid)} evalFeature={evalFeature} species={species} dayIso={dayIso}
          onClose={closePanel} onNote={() => setPanel({ type: 'carnet', at: panel.lngLat })}
          onOpen={(sid) => setPanel({ ...panel, type: 'detail', sid })} />
      )}
      {panel?.type === 'detail' && (
        <Detail f={features.current.get(panel.fid)} sid={panel.sid} evalFeature={evalFeature} dayIso={dayIso}
          meteo={meteoRef.current.get(features.current.get(panel.fid)?.properties.ck)}
          onBack={() => setPanel({ ...panel, type: 'parcelle' })} onClose={closePanel} />
      )}
      {panel?.type === 'carnet' && (
        <Carnet sorties={sorties} species={species} enabled={carnetOn} at={panel.at} geoPos={geoPos} findForest={findForest}
          onClose={closePanel} reload={loadSorties} />
      )}
      {panel?.type === 'especes' && (
        <Especes species={species} editable={editable} sorties={sorties} onClose={closePanel} reload={loadSpecies} />
      )}
    </div>
  );
}

const medalOf = (sc) => (sc >= 85 ? 'gold' : sc >= 65 ? 'silver' : sc >= 45 ? 'bronze' : 'none');
const MEDAL_LABEL = { gold: 'Or : journée à champignons', silver: 'Argent : bonnes chances', bronze: 'Bronze : jouable', none: 'Peu de chances' };
const MEDAL = {
  gold: { stops: ['#FFF1B0', '#E8B923', '#A97A06'], stroke: '#6E4E04' },
  silver: { stops: ['#FFFFFF', '#C3C9D0', '#858C94'], stroke: '#5C6269' },
  bronze: { stops: ['#F6CFA6', '#BB7638', '#7A4520'], stroke: '#53301A' },
  none: { stops: ['#FFFFFF', '#FFFFFF', '#F2F2EE'], stroke: '#A6AD9E' },
};
const MUSH_CAP = 'M3 16 C3 4 29 4 29 16 Q16 19.5 3 16 Z';
const MUSH_STEM = 'M12 17.5 Q10.6 26.5 12.6 29 L19.4 29 Q21.4 26.5 20 17.5 Z';

// Silhouette de champignon médaillée (or, argent, bronze, vide) avec liseré métal
function MedalMush({ medal = 'none', size = 24 }) {
  const m = MEDAL[medal] || MEDAL.none;
  const id = `g-${medal}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="medal-mush">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={m.stops[0]} /><stop offset=".55" stopColor={m.stops[1]} /><stop offset="1" stopColor={m.stops[2]} />
        </linearGradient>
      </defs>
      <path d={MUSH_STEM} fill={`url(#${id})`} stroke={m.stroke} strokeWidth="1.6" strokeLinejoin="round" />
      <path d={MUSH_CAP} fill={`url(#${id})`} stroke={m.stroke} strokeWidth="1.6" strokeLinejoin="round" />
      {medal !== 'none' && <path d="M9 10.5 Q12 7.5 16 7.2" fill="none" stroke="#FFFFFF" strokeOpacity=".7" strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}

function WeatherGlyph({ rain }) {
  if (rain >= 1) {
    const drops = rain >= 8 ? 3 : rain >= 3 ? 2 : 1;
    return (
      <svg width="18" height="16" viewBox="0 0 18 16" aria-label={`${Math.round(rain)} mm`}>
        {[...Array(drops)].map((_, k) => (
          <path key={k} d={`M${4 + k * 5} 3 C${4 + k * 5} 3 ${1.5 + k * 5} 7.5 ${1.5 + k * 5} 9.5 A2.5 2.5 0 0 0 ${6.5 + k * 5} 9.5 C${6.5 + k * 5} 7.5 ${4 + k * 5} 3 ${4 + k * 5} 3 Z`} fill="#3C7FC0" />
        ))}
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-label="sec">
      <circle cx="8" cy="8" r="3.3" fill="#F2B21B" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="8" y1="1.6" x2="8" y2="3.2" stroke="#F2B21B" strokeWidth="1.4" strokeLinecap="round" transform={`rotate(${a} 8 8)`} />
      ))}
    </svg>
  );
}

const PencilIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8 4 20z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /><path d="M13.8 6.8l3.4 3.4" stroke="currentColor" strokeWidth="1.9" /></svg>
);
const GearIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.9" /><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
);

// Jour sélectionné en grand + frise des jours avec météo, médaille et repère
function DayStrip({ days, offset, setOffset, dayPotential, meteo }) {
  const sel = days.find((d) => d.o === offset) || days.find((d) => d.o === 0);
  const pot = dayPotential[sel.o] ?? 0;
  const medal = medalOf(pot);
  const i = meteo ? meteo.time.indexOf(sel.iso) : -1;
  return (
    <div className="daybox">
      <div className={`dayfocus medal-${medal}`}>
        <MedalMush medal={medal} size={40} />
        <div className="df-text">
          <span className="df-day">{sel.o === 0 ? "Aujourd'hui" : sel.long}</span>
          <span className="df-medal">{MEDAL_LABEL[medal]}</span>
        </div>
        <div className="df-right">
          <span className="df-score"><b>{pot}</b><small>/100</small></span>
          {i >= 0 && <span className="df-wx"><WeatherGlyph rain={meteo.rain[i]} /> {Math.round(meteo.tmin[i])}°/{Math.round(meteo.tmax[i])}°</span>}
        </div>
      </div>
      <div className="strip" role="group" aria-label="Jours">
        {days.map((d) => (
          <button key={d.iso} type="button" className={`sd${d.o === offset ? ' on' : ''}${d.o === 0 ? ' today' : ''}${d.o > 0 ? ' fc' : ''}`}
            aria-pressed={d.o === offset} onClick={() => setOffset(d.o)} title={`${fmtD(d.iso)} · indice ${dayPotential[d.o] ?? 0}`}>
            <span className="sd-wx"><WeatherGlyph rain={d.rain} /></span>
            <span className="sd-wd">{d.wd}</span>
            <span className="sd-n">{d.n}</span>
            <MedalMush medal={medalOf(dayPotential[d.o] ?? 0)} size={18} />
          </button>
        ))}
      </div>
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

function Parcelle({ f, evalFeature, species, dayIso, onClose, onNote, onOpen }) {
  if (!f) return null;
  const p = f.properties;
  const e = evalFeature(f, false);
  const list = e ? e.all.slice().sort((a, b) => b.r.score - a.r.score) : [];
  return (
    <Sheet title={HABITATS[p.hab] || 'Parcelle'} sub={dayIso ? fmtD(dayIso) : ''} onClose={onClose}>
      {!e && <p className="note">Météo en cours de chargement…</p>}
      {e && list.length === 0 && <p className="note">Aucune des espèces suivies ne pousse sur ce type de forêt.</p>}
      <div className="sp-list">
        {list.map(({ s, r }) => (
          <button key={s.id} type="button" className="sp-row" onClick={() => onOpen(s.id)}>
            <span className="sp-dot" style={{ background: colorFor(s.id)[0] }} />
            <span className="sp-name">{s.nom}</span>
            <MedalMush medal={medalOf(r.score)} size={22} />
            <span className="sp-score"><b>{r.score}</b><small>/100</small></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <div className="actions"><button type="button" className="btn ghost" onClick={onNote}><PencilIcon /> Noter une sortie ici</button></div>
    </Sheet>
  );
}

function Detail({ f, sid, evalFeature, dayIso, meteo, onBack, onClose }) {
  if (!f) return null;
  const p = f.properties;
  const e = evalFeature(f, false);
  const hit = e?.all.find((x) => x.s.id === sid);
  if (!hit) return null;
  const { s, r } = hit;
  const medal = medalOf(r.score);
  let ctx = null;
  if (meteo && meteo.time) {
    const i = dayIndex(meteo, dayIso);
    let r7 = 0; for (let k = Math.max(0, i - 6); k <= i; k++) r7 += meteo.rain[k];
    let dry = 0; for (let k = i; k >= 0 && meteo.rain[k] < 1; k--) dry++;
    let nextRain = null; for (let k = i + 1; k < meteo.time.length; k++) if (meteo.rain[k] >= 2) { nextRain = k; break; }
    ctx = { r7, dry, tmin: meteo.tmin[i], tmax: meteo.tmax[i], next: nextRain != null ? `${fmtD(meteo.time[nextRain])} (${Math.round(meteo.rain[nextRain])} mm)` : 'aucune sur 10 jours' };
  }
  return (
    <Sheet title={s.nom} sub={`${s.latin || ''} · ${fmtD(dayIso)}`} onClose={onClose}>
      <button type="button" className="back" onClick={onBack}>‹ Parcelle</button>
      <div className={`hero medal-${medal}`}>
        <MedalMush medal={medal} size={56} />
        <div>
          <div className="hero-score"><b>{r.score}</b><span>/100</span></div>
          <span className={`pill s-${r.status}`}>{STATUS_LABEL[r.status]}</span>
          <p className="note">{MEDAL_LABEL[medal]}. Indice d'adéquation des conditions, pas une probabilité.</p>
        </div>
      </div>
      <section><span className="label">Pourquoi ce score</span><ul className="reasons">{r.reasons.map((t) => <li key={t}>{t}</li>)}</ul></section>
      {ctx && (
        <section>
          <span className="label">Météo sur cette parcelle</span>
          <div className="facts">
            <div className="fact"><span className="label">Pluie 7 j</span><b>{ctx.r7.toFixed(0)} mm</b></div>
            <div className="fact"><span className="label">Jours secs</span><b>{ctx.dry}</b></div>
            <div className="fact"><span className="label">Min / max</span><b>{Math.round(ctx.tmin)}° / {Math.round(ctx.tmax)}°</b></div>
            <div className="fact"><span className="label">Prochaine pluie</span><b className="small">{ctx.next}</b></div>
          </div>
        </section>
      )}
      <section>
        <span className="label">Parcelle</span>
        <div className="facts">
          <div className="fact"><span className="label">Forêt</span><b className="small">{p.tfv || HABITATS[p.hab]}</b></div>
          <div className="fact"><span className="label">Humidité locale</span><b>{Math.round((p.h || 0) * 100)} %</b>{p.wn && <span className="note">{p.wn} à {p.dw} m</span>}</div>
        </div>
      </section>
      <section className="tips">
        <span className="label">Où et comment chercher</span>
        {s.arbres && <p>{s.arbres}</p>}
        {s.conseils?.length > 0 && <ul>{s.conseils.map((c) => <li key={c}>{c}</li>)}</ul>}
      </section>
      {s.confusions && <p className="confusion"><strong>Confusions :</strong> {s.confusions}</p>}
    </Sheet>
  );
}

function Carnet({ sorties, species, enabled, at, geoPos, findForest, onClose, reload }) {
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
    const r = await fetch('/api/sorties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, lat: pos?.lat ?? null, lon: pos?.lon ?? null, hab: findForest(pos)?.hab ?? null, tfv: findForest(pos)?.tfv ?? null }) });
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
            <div><strong>{fmtD(s.date)} · {name(s.espece)}</strong><br /><span>{RES[s.resultat] || s.resultat}{s.kg != null ? ` · ${s.kg} kg` : ''}{s.hab ? ` · ${HABITATS[s.hab] || s.hab}` : ''}{s.lat != null ? ' · sur la carte' : ''}</span>{s.note && <p className="note">{s.note}</p>}</div>
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

function Especes({ species, editable, sorties, onClose, reload }) {
  const hints = [];
  for (const s of species) {
    const found = {};
    for (const x of sorties) if (x.espece === s.id && x.resultat !== 'rien' && x.hab) found[x.hab] = (found[x.hab] || 0) + 1;
    for (const [h, n] of Object.entries(found)) if (!(s.habitats || []).includes(h) && h !== 'autre') hints.push({ s, h, n });
  }
  async function addHab(s, h) {
    await fetch('/api/species', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, habitats: [...(s.habitats || []), h] }) });
    reload();
  }
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
      {!edit && hints.map(({ s, h, n }) => (
        <div className="banner" key={s.id + h}>
          Tu as trouvé des {s.nom.toLowerCase()} {n} fois en « {HABITATS[h]} », un type de forêt qui n'est pas dans ses habitats.
          {editable && <div className="actions" style={{ marginTop: 8 }}><button type="button" className="btn" onClick={() => addHab(s, h)}>Ajouter « {HABITATS[h]} »</button></div>}
        </div>
      ))}
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
