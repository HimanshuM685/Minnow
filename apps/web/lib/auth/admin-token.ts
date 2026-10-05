import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_CONTEXT_HEADER = 'x-minnow-admin-context';
export const ADMIN_CONTINUATION_COOKIE = 'minnow-admin-return';
const origin = 'https://minnow.internal';
const allowedParams = new Set(['page', 'company', 'location', 'source', 'hidden', 'id']);
export type AdminSecrets = { key: string | undefined; secret: string | undefined };
export const adminSecrets = (): AdminSecrets => ({ key: process.env.ADMIN_ACCESS_KEY, secret: process.env.NEON_AUTH_COOKIE_SECRET });
const configured = (config: AdminSecrets) => Boolean(config.key?.trim() && config.secret && config.secret.length >= 32);
const equal = (a: string, b: string) => {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export const isAdminPath = (path: string) => path === '/admin' || path.startsWith('/admin/');

export function validAdminKey(params: URLSearchParams, config = adminSecrets()) {
  const keys = params.getAll('key');
  return configured(config) && keys.length === 1 && equal(keys[0], config.key!);
}

// Store only an internal path and known view parameters. Never store the key or an OAuth verifier.
export function adminDestination(input: string) {
  if (!input.startsWith('/') || input.startsWith('//') || input.includes('\\') || input.length > 2000) return null;
  const url = new URL(input, origin);
  if (url.origin !== origin || !isAdminPath(url.pathname) || /%|[\r\n]/.test(url.pathname)) return null;
  const params = new URLSearchParams();
  for (const name of allowedParams) {
    const value = url.searchParams.get(name);
    if (value) params.set(name, value);
  }
  return `${url.pathname}${params.size ? `?${params}` : ''}`;
}

export function adminHref(path: string, config = adminSecrets()) {
  const destination = adminDestination(path);
  if (!destination || !configured(config)) throw new Error('Invalid admin destination or configuration.');
  const url = new URL(destination, origin);
  url.searchParams.set('key', config.key!);
  return `${url.pathname}${url.search}`;
}

export function signAdminToken(path: string, purpose: 'request' | 'login', config = adminSecrets(), now = Date.now()) {
  const destination = adminDestination(path);
  if (!configured(config) || !destination) throw new Error('Admin access is not configured.');
  const payload = Buffer.from(JSON.stringify({ destination, expires: now + 10 * 60_000 })).toString('base64url');
  const signature = createHmac('sha256', config.secret!).update(JSON.stringify([purpose, config.key, payload])).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyAdminToken(token: string | undefined | null, purpose: 'request' | 'login', config = adminSecrets(), now = Date.now()) {
  if (!configured(config) || !token || token.length > 4000) return null;
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return null;
    const expected = createHmac('sha256', config.secret!).update(JSON.stringify([purpose, config.key, payload])).digest('base64url');
    if (!equal(signature, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.destination !== 'string' || typeof data.expires !== 'number' || data.expires <= now || data.expires > now + 10 * 60_000) return null;
    return adminDestination(data.destination) === data.destination ? data.destination as string : null;
  } catch { return null; }
}
