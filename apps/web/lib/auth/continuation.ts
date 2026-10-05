import 'server-only';
import { cookies } from 'next/headers';
import { ADMIN_CONTINUATION_COOKIE, adminHref, verifyAdminToken } from './admin-token';

export async function hasAdminContinuation() {
  return Boolean(verifyAdminToken((await cookies()).get(ADMIN_CONTINUATION_COOKIE)?.value, 'login'));
}
export async function clearAdminContinuation() { (await cookies()).delete(ADMIN_CONTINUATION_COOKIE); }
export async function loginDestination(admin: boolean) {
  const store = await cookies();
  const destination = admin ? verifyAdminToken(store.get(ADMIN_CONTINUATION_COOKIE)?.value, 'login') : null;
  store.delete(ADMIN_CONTINUATION_COOKIE);
  return destination ? adminHref(destination) : '/app';
}
