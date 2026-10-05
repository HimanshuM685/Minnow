'use server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/server';
export async function signIn(form: FormData) {
  const { error } = await auth.signIn.email({ email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') });
  if (error) redirect(`/auth/sign-in?error=${encodeURIComponent(error.code?.startsWith('NETWORK_') ? 'Check NEON_AUTH_BASE_URL' : error.message ?? 'Sign-in failed')}`);
  redirect('/');
}
export async function signOut() { await auth.signOut(); redirect('/auth/sign-in'); }
