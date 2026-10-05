export function authError(error: { code?: string; message?: string } | null | undefined) {
  if (error?.code?.startsWith('NETWORK_')) return 'Authentication could not connect. Check NEON_AUTH_BASE_URL in .env.local.';
  return error?.message ?? 'Authentication failed. Please try again.';
}

export function oauthError(value: string | string[] | undefined) {
  const errors = Array.isArray(value) ? value : value ? [value] : [];
  if (errors.includes('account_not_linked')) return 'account_not_linked';
  return errors.find(error => error !== 'google') ?? errors[0];
}

export function oauthMessage(error: string | undefined) {
  if (!error) return '';
  if (error === 'account_not_linked') return 'This email already has a Minnow account. Sign in with your email and password, then connect Google in Settings.';
  if (error === "email_doesn't_match" || error === 'LINKING_DIFFERENT_EMAILS_NOT_ALLOWED') return 'Choose the Google account with the same email as your Minnow account.';
  if (error === 'account_already_linked_to_different_user') return 'This Google account is already connected to another Minnow account.';
  if (error === 'unable_to_link_account' || error === 'LINKING_NOT_ALLOWED') return 'Google could not be connected. Check that account linking is enabled on this Neon Auth branch.';
  if (error === 'access_denied') return 'Google sign-in was cancelled. You can try again or use email.';
  return 'Google authentication did not finish. Please try again or use email.';
}
