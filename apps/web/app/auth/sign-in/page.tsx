import { AuthForm } from '@/components/auth-form';
import { authIntent } from '@minnow/db';
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ intent?: string; error?: string }> }) {
  const params = await searchParams;
  return <main className="auth-page"><AuthForm mode="sign-in" google={process.env.NEON_AUTH_GOOGLE_ENABLED === 'true'} intent={authIntent(params.intent)} oauthError={Boolean(params.error)} /></main>;
}
