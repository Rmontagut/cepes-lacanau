import { NextResponse } from 'next/server';

// Météo par maille de 0,1° (≈ 8 × 11 km), 30 jours passés + 10 jours de prévisions.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const lat = Math.round(Number(searchParams.get('lat')) * 10) / 10;
  const lon = Math.round(Number(searchParams.get('lon')) * 10) / 10;
  if (!isFinite(lat) || !isFinite(lon)) return NextResponse.json({ error: 'coordonnees' }, { status: 400 });
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max'
    + '&past_days=30&forecast_days=10&timezone=Europe%2FParis';
  const r = await fetch(url, { next: { revalidate: 3 * 3600 } });
  if (!r.ok) return NextResponse.json({ error: 'open_meteo', status: r.status }, { status: 502 });
  const j = await r.json();
  const d = j.daily;
  const body = {
    lat, lon, fetchedAt: new Date().toISOString(),
    time: d.time, tmax: d.temperature_2m_max, tmin: d.temperature_2m_min,
    rain: d.precipitation_sum.map((v) => v ?? 0), wind: d.wind_speed_10m_max,
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 's-maxage=10800, stale-while-revalidate=3600' } });
}
