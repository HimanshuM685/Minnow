import { redirect } from 'next/navigation';
import { appOrigin, hasGoogleAccount, isAdminEmail } from '@minnow/db';
import { auth } from '@/lib/auth/server';
export const dynamic = 'force-dynamic';
export default async function ObservatoryCallback() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect('/auth/sign-in?intent=observatory');
  if (!isAdminEmail(session.user.email, process.env.OBSERVATORY_ADMIN_EMAILS ?? '')) {
    return <section className="content-card"><h1>Observatory access is restricted.</h1><p>Your Google email is not in OBSERVATORY_ADMIN_EMAILS. Sign in with an allowlisted account to use the admin panel.</p><a className="secondary-button" href="/auth/sign-in?intent=observatory">Use another Google account</a></section>;
  }
  const { data: accounts, error } = await auth.listAccounts();
  if (error || !hasGoogleAccount(accounts)) redirect('/auth/sign-in?intent=observatory&error=google_required');
  redirect(appOrigin(process.env.OBSERVATORY_APP_URL, 'http://localhost:3001'));
}
