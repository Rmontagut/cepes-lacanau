import { NextResponse } from 'next/server';

// Météo par point (~2-3 km) via Open-Meteo « best match » : en France, Météo-France AROME/ARPEGE
// sur les premiers jours, puis ECMWF pour la fin de la prévision.
// Les jours passés viennent des premières heures de chaque run du modèle (recalées sur
// les observations à chaque run) : ce n'est pas une projection figée, la donnée est
// remplacée à chaque nouveau run. Les jours futurs sont la prévision du dernier run.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const lat = Math.round(Number(searchParams.get('lat')) * 100) / 100;
  const lon = Math.round(Number(searchParams.get('lon')) * 100) / 100;
  if (!isFinite(lat) || !isFinite(lon)) return NextResponse.json({ error: 'coordonnees' }, { status: 400 });
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max'
    + '&past_days=30&forecast_days=10&timezone=Europe%2FParis';
  const r = await fetch(url, { next: { revalidate: 3600 } });
  if (!r.ok) return NextResponse.json({ error: 'open_meteo', status: r.status }, { status: 502 });
  const j = await r.json();
  const d = j.daily;
  const pick = (k) => d[k] || d[`${k}_meteofrance_seamless`];
  // Les derniers jours de prévision peuvent manquer côté AROME : on coupe aux jours complets
  const time = d.time; const tmax = pick('temperature_2m_max'); const tmin = pick('temperature_2m_min');
  const rain = pick('precipitation_sum'); const wind = pick('wind_speed_10m_max');
  let n = time.length;
  while (n > 0 && (tmax[n - 1] == null || tmin[n - 1] == null)) n--;
  const body = {
    lat, lon, model: 'Météo-France (AROME/ARPEGE) puis ECMWF au-delà', fetchedAt: new Date().toISOString(),
    time: time.slice(0, n), tmax: tmax.slice(0, n), tmin: tmin.slice(0, n),
    rain: rain.slice(0, n).map((v) => v ?? 0), wind: wind.slice(0, n).map((v) => v ?? 0),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=1800' } });
}
