import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from './server';

// Server Components cannot set cookies. When the SDK tries to refresh or clear a stale
// session cookie there, it throws; treat that as "no session" (the proxy refreshes cookies).
// cache() makes layouts and pages in one request share a single session lookup.
export const getUser = cache(async () => {
  try {
    const { data: session } = await auth.getSession();
    return session?.user ?? null;
  } catch { return null; }
});
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/auth/sign-in');
  return user;
}
