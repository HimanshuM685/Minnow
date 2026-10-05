'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, signUp, googleSignIn } from '@/app/auth/actions';
export function AuthForm({ mode, google }: { mode: 'sign-in' | 'sign-up'; google: boolean }) {
  const [state, action, pending] = useActionState(mode === 'sign-up' ? signUp : signIn, null);
  const [googleState, googleAction, googlePending] = useActionState(googleSignIn, null);
  return <div className="auth-card"><h1>{mode === 'sign-up' ? 'Find your next current.' : 'Welcome back.'}</h1><p>{mode === 'sign-up' ? 'Create your Minnow account and make the hunt your own.' : 'Your next opportunity is waiting to be found.'}</p><form action={action}>
    {mode === 'sign-up' && <label>Name<input name="name" autoComplete="name" required maxLength={120} /></label>}
    <label>Email<input name="email" type="email" autoComplete="email" required /></label>
    <label>Password<input name="password" type="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} required minLength={mode === 'sign-up' ? 8 : 1} /></label>
    {state?.error && <div className="form-error" role="alert">{state.error}</div>}
    <button className="primary-button" disabled={pending}>{pending ? 'Connecting…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
  </form>{google && <form action={googleAction}>{googleState?.error && <p className="form-error" role="alert">{googleState.error}</p>}<button className="secondary-button" disabled={googlePending}>Continue with Google</button></form>}<div className="auth-switch">{mode === 'sign-up' ? 'Already have an account?' : 'New to Minnow?'} <Link href={mode === 'sign-up' ? '/auth/sign-in' : '/auth/sign-up'}>{mode === 'sign-up' ? 'Sign in' : 'Create an account'}</Link></div></div>;
}
