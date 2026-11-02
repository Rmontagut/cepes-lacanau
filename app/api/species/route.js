import { NextResponse } from 'next/server';
import { getStore } from '../../../lib/store';
import { DEFAULT_SPECIES } from '../../../lib/species';

export const dynamic = 'force-dynamic';
const KEY = 'species:v1';

async function load(store) {
  if (!store) return DEFAULT_SPECIES;
  const v = await store.get(KEY);
  return Array.isArray(v) && v.length ? v : DEFAULT_SPECIES;
}

export async function GET() {
  const store = getStore();
  return NextResponse.json({ species: await load(store), editable: !!store });
}

export async function POST(req) {
  const store = getStore();
  if (!store) return NextResponse.json({ error: 'pas_de_base' }, { status: 503 });
  const body = await req.json();
  if (!body || !body.nom) return NextResponse.json({ error: 'nom_requis' }, { status: 400 });
  const list = await load(store);
  const id = body.id || `${String(body.nom).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
  const next = list.filter((s) => s.id !== id).concat([{ ...body, id }]);
  await store.set(KEY, next);
  return NextResponse.json({ species: next });
}

export async function DELETE(req) {
  const store = getStore();
  if (!store) return NextResponse.json({ error: 'pas_de_base' }, { status: 503 });
  const id = new URL(req.url).searchParams.get('id');
  const next = (await load(store)).filter((s) => s.id !== id);
  await store.set(KEY, next);
  return NextResponse.json({ species: next });
}
