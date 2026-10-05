// Post-login destination: internal /dashboard, /credits or /admin paths only (no open redirects).
export function safeNext(value: string | string[] | null | undefined) {
  const path = Array.isArray(value) ? value[0] : value;
  return path && /^\/(dashboard|credits|admin)(\/[\w\-./]*)?(\?[\w\-.=&%]*)?$/.test(path) && !path.includes('..') ? path : '/dashboard';
}
