import { forbidden, redirect } from 'next/navigation';
import { auth } from './server';
import { isAdminEmail } from '@minnow/db';
export async function requireAdmin() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect('/auth/sign-in');
  if (!isAdminEmail(session.user.email,process.env.OBSERVATORY_ADMIN_EMAILS ?? '')) forbidden();
  return session.user;
}
