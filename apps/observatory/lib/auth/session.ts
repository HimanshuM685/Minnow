import { forbidden, redirect } from 'next/navigation';
import { auth } from './server';
import { isAdminEmail, hasGoogleAccount } from '@minnow/db';
export async function requireAdmin() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect('/auth/sign-in');
  if (!isAdminEmail(session.user.email,process.env.OBSERVATORY_ADMIN_EMAILS ?? '')) forbidden();
  const { data: accounts, error } = await auth.listAccounts();
  if (error || !hasGoogleAccount(accounts)) redirect('/auth/sign-in?error=google_required');
  return session.user;
}
