'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, signUp, googleSignIn } from '@/app/auth/actions';
import { GoogleMark } from './google-mark';

export function AuthForm({ mode, google, intent = 'web', oauthError = false }: {
  mode: 'sign-in' | 'sign-up'; google: boolean; intent?: 'web' | 'observatory'; oauthError?: boolean;
}) {
  const [state, action, pending] = useActionState(mode === 'sign-up' ? signUp : signIn, null);
  const [googleState, googleAction, googlePending] = useActionState(googleSignIn, null);
  const admin = intent === 'observatory';
  return <div className="auth-card">
    <h1>{admin ? 'Sign in to Observatory.' : mode === 'sign-up' ? 'Find your next current.' : 'Welcome back.'}</h1>
    <p>{admin ? 'Continue with your allowlisted Google account. You’ll return to the admin panel after sign-in.' : mode === 'sign-up' ? 'Create your Minnow account and make the hunt your own.' : 'Your next opportunity is waiting to be found.'}</p>
    {google && <form action={googleAction} className="google-auth-form">
      <input name="intent" type="hidden" value={intent} />
      <button className="google-auth-button" disabled={googlePending}><GoogleMark />{googlePending ? 'Connecting to Google…' : 'Continue with Google'}</button>
      {!admin && <span className="auth-recommendation">Recommended · one less password to remember</span>}
      {googleState?.error && <p className="form-error" role="alert">{googleState.error}</p>}
    </form>}
    {oauthError && <p className="form-error" role="alert">Google sign-in did not finish. Try again with your Google account.</p>}
    {admin && !google && <p className="form-error" role="alert">Google sign-in is not enabled in this app. Enable it on the Neon branch and set NEON_AUTH_GOOGLE_ENABLED=true.</p>}
    {!admin && <>
      {google && <div className="auth-divider"><span>or use email</span></div>}
      <form action={action} className="email-auth-form">
        <input name="intent" type="hidden" value="web" />
        {mode === 'sign-up' && <label>Name<input name="name" autoComplete="name" required maxLength={120} /></label>}
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} required minLength={mode === 'sign-up' ? 8 : 1} /></label>
        {state?.error && <div className="form-error" role="alert">{state.error}</div>}
        <button className={google ? 'secondary-button' : 'primary-button'} disabled={pending}>{pending ? 'Connecting…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
      </form>
      <div className="auth-switch">{mode === 'sign-up' ? 'Already have an account?' : 'New to Minnow?'} <Link href={mode === 'sign-up' ? '/auth/sign-in' : '/auth/sign-up'}>{mode === 'sign-up' ? 'Sign in' : 'Create an account'}</Link></div>
    </>}
  </div>;
}
