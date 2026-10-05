import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';

// Neon Auth only turns the OAuth verifier into session cookies when this runs on the landing URL,
// so it must run on every path that can receive one, not just /app and /admin.
export default async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const guarded = ['/dashboard', '/credits', '/admin'].some(root => pathname === root || pathname.startsWith(`${root}/`));
  if (!guarded && !searchParams.has('neon_auth_session_verifier')) return NextResponse.next();
  const response = await auth.middleware({ loginUrl: '/auth/sign-in' })(request);
  const location = response.headers.get('location');
  if (guarded && location && new URL(location, request.url).pathname === '/auth/sign-in') {
    response.headers.set('location', new URL(`/auth/sign-in?next=${encodeURIComponent(pathname)}`, request.url).toString());
  }
  return response;
}
export const config = { matcher: ['/((?!_next/|api/|favicon.ico|minnow.svg).*)'] };
