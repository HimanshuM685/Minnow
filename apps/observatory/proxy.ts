import { auth } from '@/lib/auth/server';
export default auth.middleware({ loginUrl: '/auth/sign-in' });
export const config = { matcher: ['/', '/hunts/:path*', '/listings/:path*', '/sources/:path*', '/people/:path*', '/trace/:path*'] };
