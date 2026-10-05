export function authError(error: { code?: string; message?: string } | null | undefined) {
  if (error?.code?.startsWith('NETWORK_')) return 'Authentication could not connect. Check NEON_AUTH_BASE_URL in .env.local.';
  return error?.message ?? 'Authentication failed. Please try again.';
}
