'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { authError, oauthMessage } from '@/lib/auth/errors';
import { GoogleMark } from './google-mark';

export function GoogleAccount({ linked, enabled, error, recovery }: { linked: boolean; enabled: boolean; error?: string; recovery: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(oauthMessage(error));
  async function connect() {
    setPending(true);
    setMessage('');
    try {
      const result = await authClient.linkSocial({
        provider: 'google',
        callbackURL: '/dashboard/settings?google=connected',
        errorCallbackURL: '/dashboard/settings',
        disableRedirect: true,
      });
      if (result.error) setMessage(authError(result.error));
      else if (result.data?.url) { window.location.assign(result.data.url); return; }
      else setMessage('Google returned no authorization URL. Please try again.');
    } catch { setMessage('Google could not connect. Please try again.'); }
    setPending(false);
  }
  return <section className="content-card google-account">
    <h2>Sign-in methods</h2>
    <p>{linked ? 'Google is connected. You can use it to sign in to this same Minnow account.' : recovery ? 'Connect the Google account with your Minnow email to finish sign-in recovery.' : 'Connect Google to sign in without another password. Choose the account with your Minnow email.'}</p>
    {!linked && enabled && <button className="google-auth-button" onClick={connect} disabled={pending}><GoogleMark />{pending ? 'Connecting…' : 'Connect Google'}</button>}
    {!linked && !enabled && <p>Google is not enabled on this branch.</p>}
    {message && <p className="form-error" role="alert">{message}</p>}
  </section>;
}
