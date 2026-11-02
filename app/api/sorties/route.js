import { NextResponse } from 'next/server';
import { getStore } from '../../../lib/store';

export const dynamic = 'force-dynamic';
const KEY = 'sorties:v1';

export async function GET() {
  const store = getStore();
  if (!store) return NextResponse.json({ sorties: [], enabled: false });
  const v = (await store.get(KEY)) || [];
  return NextResponse.json({ sorties: v, enabled: true });
}

export async function POST(req) {
  const store = getStore();
  if (!store) return NextResponse.json({ error: 'pas_de_base' }, { status: 503 });
  const b = await req.json();
  if (!b?.date || !b?.espece) return NextResponse.json({ error: 'champs' }, { status: 400 });
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: String(b.date).slice(0, 10), espece: String(b.espece), resultat: String(b.resultat || 'rien'),
    kg: b.kg === '' || b.kg == null ? null : Number(b.kg), note: String(b.note || '').slice(0, 500),
    lat: typeof b.lat === 'number' ? b.lat : null, lon: typeof b.lon === 'number' ? b.lon : null,
    hab: typeof b.hab === 'string' ? b.hab.slice(0, 20) : null, tfv: typeof b.tfv === 'string' ? b.tfv.slice(0, 120) : null,
    creeLe: new Date().toISOString(),
  };
  const list = (await store.get(KEY)) || [];
  list.unshift(entry);
  await store.set(KEY, list.slice(0, 2000));
  return NextResponse.json({ sortie: entry });
}

export async function DELETE(req) {
  const store = getStore();
  if (!store) return NextResponse.json({ error: 'pas_de_base' }, { status: 503 });
  const id = new URL(req.url).searchParams.get('id');
  const list = ((await store.get(KEY)) || []).filter((s) => s.id !== id);
  await store.set(KEY, list);
  return NextResponse.json({ ok: true });
}
