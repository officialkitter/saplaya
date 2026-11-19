import { NextRequest, NextResponse } from 'next/server';

const CANONICAL_HOST = 'www.saplaya.org';
const OFFICIAL_HOSTS = new Set(['saplaya.org', CANONICAL_HOST]);

export function middleware(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
  const host = (forwardedHost ?? request.nextUrl.host).replace(/:\d+$/, '').toLowerCase();
  if (!OFFICIAL_HOSTS.has(host)) return NextResponse.next();

  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase();
  const protocol = forwardedProtocol ?? request.nextUrl.protocol.replace(/:$/, '').toLowerCase();
  if (host === CANONICAL_HOST && protocol === 'https') return NextResponse.next();

  const canonicalUrl = request.nextUrl.clone();
  canonicalUrl.protocol = 'https:';
  canonicalUrl.hostname = CANONICAL_HOST;
  canonicalUrl.port = '';
  return NextResponse.redirect(canonicalUrl, 301);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
