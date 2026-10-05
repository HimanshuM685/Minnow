export function isAdminEmail(email: string, allowlist: string) {
  return allowlist.split(',').map(value=>value.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}

export function hasGoogleAccount(accounts: unknown) {
  return Array.isArray(accounts) && accounts.some(account => account && typeof account === 'object' && account.providerId === 'google');
}
