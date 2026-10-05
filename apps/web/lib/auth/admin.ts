import 'server-only';
import { forbidden, redirect } from 'next/navigation';
import { ensureSchema, isAdminEmail } from '@minnow/db';
import { auth } from './server';

// Same session as the user app; admin only adds the email allowlist.
export async function requireAdmin() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect('/auth/sign-in?next=/admin');
  if (!isAdminEmail(session.user.email, process.env.OBSERVATORY_ADMIN_EMAILS ?? '')) forbidden();
  await ensureSchema();
  return session.user;
}
