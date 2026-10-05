import { observatoryGoogleEntry } from '@minnow/db';
export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="access-page"><div className="instrument-label">Minnow Observatory</div><h1>Operator sign-in</h1><p>Google accounts only. Use the email listed in OBSERVATORY_ADMIN_EMAILS.</p>
    {error && <p className="error-message">{error === 'google_required' ? 'Sign in with Google before entering Observatory.' : 'Sign-in did not finish. Continue with Google to try again.'}</p>}
    <a className="operator-google-button" href={observatoryGoogleEntry(process.env.WEB_APP_URL)}>Continue with Google</a>
    <p className="operator-auth-note">Managed sign-in opens in Minnow and returns here. Observatory has no password form or separate sign-up.</p>
  </main>;
}
