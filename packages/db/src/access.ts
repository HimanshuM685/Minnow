export function isAdminEmail(email: string, allowlist: string) {
  return allowlist.split(',').map(value=>value.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}
