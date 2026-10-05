'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/server';
import { authError } from '@/lib/auth/errors';
import { safeNext } from '@/lib/auth/next';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const failure = (error: unknown, fallback: string) => ({ error: error instanceof Error ? error.message : fallback });
type State = { error: string } | null;

export async function signIn(_state: State, form: FormData): Promise<State> {
  try {
    const { error } = await auth.signIn.email({ email: text(form, 'email'), password: String(form.get('password') ?? '') });
    if (error) return { error: authError(error) };
  } catch (error) { return failure(error, 'Authentication failed. Check NEON_AUTH_BASE_URL.'); }
  redirect(safeNext(text(form, 'next')));
}

export async function signUp(_state: State, form: FormData): Promise<State> {
  const email = text(form, 'email');
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return { error: 'Use a password of at least 8 characters.' };
  try {
    const { error } = await auth.signUp.email({ email, name: text(form, 'name') || email.split('@')[0], password });
    if (error) {
      // Account already exists: sign in with the same credentials instead of reporting "already signed up".
      const retry = await auth.signIn.email({ email, password });
      if (retry.error) return { error: /exist|already/i.test(error.message ?? '') ? 'An account with this email exists. Check your password, or continue with Google.' : authError(error) };
    }
  } catch (error) { return failure(error, 'Could not create account. Check NEON_AUTH_BASE_URL.'); }
  redirect(safeNext(text(form, 'next')));
}

// Google signs in an existing account or creates one; same flow either way.
export async function googleSignIn(_state: State, form: FormData): Promise<State> {
  if (process.env.NEON_AUTH_GOOGLE_ENABLED !== 'true') return { error: 'Google sign-in is not enabled on this branch.' };
  const next = safeNext(text(form, 'next'));
  let url: string | undefined;
  try {
    const h = await headers();
    const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
    const { data, error } = await auth.signIn.social({
      provider: 'google',
      callbackURL: `${origin}/auth/complete?next=${encodeURIComponent(next)}`,
      errorCallbackURL: `${origin}/auth/sign-in?next=${encodeURIComponent(next)}`,
    });
    if (error) return { error: authError(error) };
    url = data?.url;
  } catch { return { error: 'Google sign-in could not connect. Check NEON_AUTH_BASE_URL.' }; }
  if (url) redirect(url);
  return { error: 'Google sign-in returned no authorization URL.' };
}

export async function signOut() { await auth.signOut(); redirect('/auth/sign-in'); }
