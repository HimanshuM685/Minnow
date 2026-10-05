import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { oauthError } from '@/lib/auth/errors';
import { safeNext } from '@/lib/auth/next';
import { getUser } from '@/lib/auth/session';
export const dynamic = 'force-dynamic';
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string | string[] }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getUser()) redirect(next);
  return <main className="auth-page"><AuthForm google={process.env.NEON_AUTH_GOOGLE_ENABLED === 'true'} next={next} oauthError={oauthError(params.error)} /></main>;
}
