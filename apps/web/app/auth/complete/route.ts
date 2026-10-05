import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/next';
// Landing URL after Google. The proxy has already exchanged the verifier for session cookies.
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get('next')), request.url));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
