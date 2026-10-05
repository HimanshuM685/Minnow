export function isAdminEmail(email: string, allowlist: string) {
  return allowlist.split(',').map(value=>value.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}

export function hasGoogleAccount(accounts: unknown) {
  return Array.isArray(accounts) && accounts.some(account => account && typeof account === 'object' && account.providerId === 'google');
}

export function authIntent(value: unknown): 'web' | 'observatory' {
  return value === 'observatory' ? 'observatory' : 'web';
}

export function appOrigin(value: string | undefined, fallback: string) {
  const url = new URL(value || fallback);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('App URLs must be HTTP or HTTPS origins without credentials, paths, or query parameters.');
  }
  return url.origin;
}

export function observatoryGoogleEntry(webUrl: string | undefined) {
  return `${appOrigin(webUrl, 'http://localhost:3000')}/auth/sign-in?intent=observatory`;
}
