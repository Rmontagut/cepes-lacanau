import { NextResponse } from 'next/server';
import { COOKIE, expectedToken } from './lib/auth';

export async function middleware(req) {
  const token = await expectedToken();
  if (!token) return NextResponse.next(); // pas de mot de passe défini : accès libre
  if (req.cookies.get(COOKIE)?.value === token) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'non_connecte' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|api/login|_next|manifest.webmanifest|icon-|apple-touch-icon|favicon).*)'],
};
