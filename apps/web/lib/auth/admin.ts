import 'server-only';
import { forbidden, redirect } from 'next/navigation';
import { ensureSchema, isAdminEmail } from '@minnow/db';
import { getUser } from './session';

// Same session as the user app; admin only adds the email allowlist.
export async function requireAdmin() {
  const user = await getUser();
  if (!user) redirect('/auth/sign-in?next=/admin');
  if (!isAdminEmail(user.email, process.env.OBSERVATORY_ADMIN_EMAILS ?? '')) forbidden();
  await ensureSchema();
  return user;
}
