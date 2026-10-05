'use server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/server';
import { authError } from '@/lib/auth/errors';
import { authIntent } from '@minnow/db';

export async function signIn(_state: { error: string } | null, form: FormData) {
  if (authIntent(form.get('intent')) === 'observatory') return { error: 'Use Google to sign in to Observatory.' };
  try {
    const { error } = await auth.signIn.email({ email: String(form.get('email') ?? '').trim(), password: String(form.get('password') ?? '') });
    if (error) return { error: authError(error) };
  } catch (error) { return { error: error instanceof Error ? error.message : 'Authentication failed. Check NEON_AUTH_BASE_URL.' }; }
  redirect('/app');
}
export async function signUp(_state: { error: string } | null, form: FormData) {
  if (authIntent(form.get('intent')) === 'observatory') return { error: 'Use Google to sign in to Observatory.' };
  const name = String(form.get('name') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!name || password.length < 8) return { error: 'Enter your name and a password of at least 8 characters.' };
  try {
    const { error } = await auth.signUp.email({ email: String(form.get('email') ?? '').trim(), name, password });
    if (error) return { error: authError(error) };
  } catch (error) { return { error: error instanceof Error ? error.message : 'Could not create account. Check NEON_AUTH_BASE_URL.' }; }
  redirect('/app');
}
export async function googleSignIn(_state: { error: string } | null, form: FormData) {
  if (process.env.NEON_AUTH_GOOGLE_ENABLED !== 'true') return { error: 'Google sign-in is not enabled on this branch.' };
  let url: string | undefined;
  try {
    const intent = authIntent(form.get('intent'));
    const { data, error } = await auth.signIn.social({
      provider: 'google',
      callbackURL: intent === 'observatory' ? '/app/observatory' : '/app',
      errorCallbackURL: intent === 'observatory' ? '/auth/sign-in?intent=observatory&error=google' : '/auth/sign-in?error=google',
    });
    if (error) return { error: authError(error) };
    url = data?.url;
  } catch { return { error: 'Google sign-in could not connect. Check NEON_AUTH_BASE_URL.' }; }
  if (url) redirect(url);
  return { error: 'Google sign-in returned no authorization URL.' };
}
export async function signOut() { await auth.signOut(); redirect('/auth/sign-in'); }
