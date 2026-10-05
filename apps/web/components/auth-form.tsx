'use client';
import { useActionState } from 'react';
import { signIn, signUp, googleSignIn } from '@/app/auth/actions';
import { GoogleMark } from './google-mark';
import { oauthMessage } from '@/lib/auth/errors';

export function AuthForm({ google, next, oauthError }: { google: boolean; next: string; oauthError?: string }) {
  const [state, signInAction, signInPending] = useActionState(signIn, null);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, null);
  const [googleState, googleAction, googlePending] = useActionState(googleSignIn, null);
  const admin = next.startsWith('/admin');
  const error = signUpState?.error ?? state?.error;
  return <div className="auth-card">
    <h1>{admin ? 'Sign in to Minnow Admin.' : 'Welcome to Minnow.'}</h1>
    <p>{admin ? 'Use an allowlisted account. You’ll return to the admin panel.' : 'Sign in, or create an account, to start your hunt.'}</p>
    {google && <form action={googleAction} className="google-auth-form">
      <input name="next" type="hidden" value={next} />
      <button className="google-auth-button" disabled={googlePending}><GoogleMark />{googlePending ? 'Connecting to Google…' : 'Continue with Google'}</button>
      {googleState?.error && <p className="form-error" role="alert">{googleState.error}</p>}
    </form>}
    {oauthError && <p className="form-error" role="alert">{oauthMessage(oauthError)}</p>}
    {google && <div className="auth-divider"><span>or use email</span></div>}
    <form action={signInAction} className="email-auth-form">
      <input name="next" type="hidden" value={next} />
      <label>Name <small>(new accounts only)</small><input name="name" autoComplete="name" maxLength={120} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className={google ? 'secondary-button' : 'primary-button'} disabled={signInPending || signUpPending}>{signInPending ? 'Connecting…' : 'Continue'}</button>
      <button formAction={signUpAction} className="secondary-button" disabled={signInPending || signUpPending}>{signUpPending ? 'Creating…' : 'Create account'}</button>
    </form>
  </div>;
}
