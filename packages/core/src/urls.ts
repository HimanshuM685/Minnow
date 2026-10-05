import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { SourceName } from './contracts';

export function publicUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    const host = url.hostname.toLowerCase();
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (!host.includes('.') || isIP(host.replace(/^\[|\]$/g, '')) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return null;
    if (url.port && !['80', '443'].includes(url.port)) return null;
    return url.href;
  } catch { return null; }
}

export function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|ref$|referrer$|source$|src$|tracking|fbclid$|gclid$|lever-source$)/i.test(key)) url.searchParams.delete(key);
  }
  if (/greenhouse\.io$/.test(url.hostname)) {
    url.hostname = 'job-boards.greenhouse.io';
    if (/\/jobs\/\d+/.test(url.pathname)) url.searchParams.delete('gh_jid');
  }
  url.pathname = url.pathname.replace(/\/(apply|application)\/?$/, '').replace(/\/$/, '') || '/';
  url.searchParams.sort();
  return url.href;
}

export const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 20);

export function sourceFor(value: string): SourceName {
  const host = new URL(value).hostname;
  if (/(^|\.)greenhouse\.io$/.test(host)) return 'greenhouse';
  if (/(^|\.)lever\.co$/.test(host)) return 'lever';
  if (/(^|\.)ashbyhq\.com$/.test(host)) return 'ashby';
  if (/(^|\.)(indeed\.com|wellfound\.com|builtin\.com|internshala\.com|remoteok\.com|weworkremotely\.com|remotive\.com|glassdoor\.com|ziprecruiter\.com)$/.test(host)) return 'portal';
  return 'careers';
}

export function isJobUrl(value: string): boolean {
  const url = new URL(value);
  const path = url.pathname;
  if (sourceFor(value) === 'greenhouse') return /\/jobs\/\d+/.test(path) || url.searchParams.has('gh_jid');
  if (sourceFor(value) === 'lever') return /^\/[^/]+\/[a-f0-9-]{20,}/i.test(path);
  if (sourceFor(value) === 'ashby') return /^\/[^/]+\/[a-f0-9-]{20,}/i.test(path);
  if (sourceFor(value) === 'portal' && /^\/remote-jobs\/[^/]+/i.test(path)) return true;
  if (/^\/internship\/detail\/[^/]+/i.test(path)) return true;
  return /\/(jobs?|positions?|openings?|opportunities|requisitions)\/[^/?#]+/i.test(path)
    && !/\/(search|all|saved|categories|locations|teams|departments|benefits|students|early-careers?)\/?$/i.test(path)
    || /\/(job-detail|job-details|jobdescription|job_description)\b/i.test(path)
    || ['gh_jid', 'jobId', 'job_id', 'reqId', 'jk'].some(key => url.searchParams.has(key));
}

export function companyKey(value: string): string {
  const url = new URL(value);
  return ['greenhouse', 'lever', 'ashby'].includes(sourceFor(value))
    ? `${sourceFor(value)}:${url.pathname.split('/').filter(Boolean)[0]}`
    : url.hostname.replace(/^www\./, '');
}
