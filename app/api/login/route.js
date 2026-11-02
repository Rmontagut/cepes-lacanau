import { NextResponse } from 'next/server';
import { COOKIE, expectedToken } from '../../../lib/auth';

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  const token = await expectedToken();
  if (!token) return NextResponse.json({ ok: true });
  if (password !== process.env.APP_PASSWORD) return NextResponse.json({ ok: false }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}
