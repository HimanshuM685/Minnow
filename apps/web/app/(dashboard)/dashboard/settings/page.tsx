import { getProfile } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { signOut } from '@/app/auth/actions';
import { auth } from '@/lib/auth/server';
import { hasGoogleAccount } from '@minnow/db';
import { GoogleAccount } from '@/components/google-account';
import { ProfileForm } from '@/components/profile-form';
import { oauthError } from '@/lib/auth/errors';
export const dynamic = 'force-dynamic';
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; linkGoogle?: string }> }) {
  const user = await requireUser();
  const [profile, accounts, params] = await Promise.all([getProfile(user.id), auth.listAccounts(), searchParams]);
  return <>
    <div className="page-heading">
      <h1>Your settings</h1>
      <p>Your profile belongs to you.</p>
    </div>
    <ProfileForm
      initial={{
        name: profile?.display_name ?? user.name ?? '',
        profession: profile?.profession ?? '',
        headline: profile?.headline ?? '',
      }}
      email={user.email}
    />
    {accounts.error ? <p className="form-error" role="alert">Could not load sign-in methods. Refresh to try again.</p> : <GoogleAccount linked={hasGoogleAccount(accounts.data)} enabled={process.env.NEON_AUTH_GOOGLE_ENABLED === 'true'} error={oauthError(params.error)} recovery={params.linkGoogle === '1'} />}
    <form action={signOut} className="signout-form"><button className="secondary-button">Sign out</button></form>
  </>;
}

