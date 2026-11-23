import { NextRequest, NextResponse } from 'next/server';

const CANONICAL_HOST = 'www.saplaya.org';
const OFFICIAL_HOSTS = new Set(['saplaya.org', CANONICAL_HOST]);

export function middleware(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
  const host = (forwardedHost ?? request.nextUrl.host).replace(/:\d+$/, '').toLowerCase();
  if (!OFFICIAL_HOSTS.has(host)) return NextResponse.next();

  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase();
  const protocol = forwardedProtocol ?? request.nextUrl.protocol.replace(/:$/, '').toLowerCase();
  if (host === CANONICAL_HOST && protocol === 'https') {
    const response = NextResponse.next();
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(self)');
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    return response;
  }

  if (host === 'saplaya.org') {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.protocol = 'https:';
    canonicalUrl.hostname = CANONICAL_HOST;
    canonicalUrl.port = '';
    return NextResponse.redirect(canonicalUrl, 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
