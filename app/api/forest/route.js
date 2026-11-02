import { NextResponse } from 'next/server';
import { habitatFromForest } from '../../../lib/species';

export const maxDuration = 30;

const TILE = 0.03; // degrés (~2,4 × 3,3 km)
const WFS = 'https://data.geopf.fr/wfs/ows';
const WATER_WEIGHT = { Lac: 1, Marais: 1, Mare: 0.8, 'Ecoulement naturel': 0.9, Canal: 0.7, Retenue: 0.6 };

async function wfsAll(typename, bbox, propertyName) {
  const out = [];
  const count = 2000;
  for (let start = 0; start < 20000; start += count) {
    const params = new URLSearchParams({
      SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: typename,
      OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', COUNT: String(count), STARTINDEX: String(start),
      BBOX: `${bbox.join(',')},urn:ogc:def:crs:EPSG::4326`,
    });
    if (propertyName) params.set('PROPERTYNAME', propertyName);
    const r = await fetch(`${WFS}?${params}`, { next: { revalidate: 30 * 86400 } });
    if (!r.ok) throw new Error(`WFS ${typename} ${r.status}`);
    const j = await r.json();
    out.push(...(j.features || []));
    if (!j.features || j.features.length < count) break;
  }
  return out;
}

// Douglas–Peucker sur un anneau [lon, lat]
function simplify(ring, tol) {
  if (ring.length < 5) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a]; const [bx, by] = ring[b];
    const dx = bx - ax; const dy = by - ay; const len = dx * dx + dy * dy;
    let maxD = -1; let idx = -1;
    for (let k = a + 1; k < b; k++) {
      const [px, py] = ring[k];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px; const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; idx = k; }
    }
    if (maxD > t2) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return ring.filter((_, k) => keep[k]);
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;

function cleanGeometry(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const out = [];
  for (const poly of polys) {
    const rings = [];
    for (const ring of poly) {
      const s = simplify(ring.map((p) => [p[0], p[1]]), 0.00004).map((p) => [r5(p[0]), r5(p[1])]);
      if (s.length >= 4) rings.push(s);
    }
    if (rings.length) out.push(rings);
  }
  return out.length ? { type: 'MultiPolygon', coordinates: out } : null;
}

function samplePoints(geom, max) {
  const pts = [];
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) for (const ring of poly) for (const p of ring) pts.push(p);
  if (pts.length <= max) return pts;
  const step = pts.length / max;
  const s = []; for (let k = 0; k < max; k++) s.push(pts[Math.floor(k * step)]);
  return s;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const tx = parseInt(searchParams.get('tx'), 10);
  const ty = parseInt(searchParams.get('ty'), 10);
  if (!isFinite(tx) || !isFinite(ty)) return NextResponse.json({ error: 'tuile' }, { status: 400 });
  const lon0 = tx * TILE; const lat0 = ty * TILE;
  const bbox = [lat0, lon0, lat0 + TILE, lon0 + TILE];
  const m = 0.02;
  const wbox = [lat0 - m, lon0 - m, lat0 + TILE + m, lon0 + TILE + m];

  try {
    const [forest, water] = await Promise.all([
      wfsAll('LANDCOVER.FORESTINVENTORY.V2:formation_vegetale', bbox),
      wfsAll('BDTOPO_V3:surface_hydrographique', wbox, 'geometrie,nature,persistance'),
    ]);

    const coslat = Math.cos(((lat0 + TILE / 2) * Math.PI) / 180);
    // Index spatial des points d'eau (cellules de 0,005° ≈ 400 m)
    const CELL = 0.005;
    const grid = new Map();
    for (const w of water) {
      const nat = w.properties?.nature;
      let weight = WATER_WEIGHT[nat];
      if (!weight || !w.geometry) continue;
      if (w.properties?.persistance === 'Intermittent') weight *= 0.8;
      for (const p of samplePoints(w.geometry, 150)) {
        const k = `${Math.floor(p[0] / CELL)}:${Math.floor(p[1] / CELL)}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push([p[0], p[1], weight, nat]);
      }
    }
    const R = 4; // ±4 cellules ≈ 1,6 km
    const near = (q) => {
      const cx = Math.floor(q[0] / CELL); const cy = Math.floor(q[1] / CELL);
      const out = [];
      for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
        const a = grid.get(`${cx + dx}:${cy + dy}`); if (a) out.push(...a);
      }
      return out;
    };

    const features = [];
    for (const f of forest) {
      if (!f.geometry) continue;
      const geometry = cleanGeometry(f.geometry);
      if (!geometry) continue;
      const p = f.properties || {};
      let best = 0; let bestDist = null; let bestNat = null;
      if (grid.size) {
        for (const q of samplePoints(f.geometry, 40)) {
          for (const w of near(q)) {
            const dx = (q[0] - w[0]) * coslat * 111320; const dy = (q[1] - w[1]) * 110540;
            const d = Math.sqrt(dx * dx + dy * dy);
            // 0–150 m : plein effet ; s'annule vers 1,5 km
            const h = w[2] * Math.max(0, Math.min(1, 1 - (d - 150) / 1350));
            if (h > best || (h === best && (bestDist === null || d < bestDist))) { best = h; bestDist = d; bestNat = w[3]; }
          }
        }
      }
      features.push({
        type: 'Feature',
        id: undefined,
        properties: {
          fid: String(f.id), hab: habitatFromForest(p), tfv: p.tfv || '', ess: p.essence || '',
          h: Math.round(best * 100) / 100, dw: bestDist == null ? null : Math.round(bestDist), wn: bestNat,
        },
        geometry,
      });
    }
    return NextResponse.json({ type: 'FeatureCollection', tile: [tx, ty], features },
      { headers: { 'Cache-Control': 's-maxage=2592000, stale-while-revalidate=604800' } });
  } catch (e) {
    return NextResponse.json({ error: 'ign', message: String(e.message || e) }, { status: 502 });
  }
}
