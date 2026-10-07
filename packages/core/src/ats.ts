import type { Listing, ListingFacts } from './contracts';
import { inferSeniority, inferWorkMode, makeListing, plain } from './extraction';
import { inferFacts } from './facts';
import { cityCoords } from './geography';

// Public ATS job-board APIs, read through TinyFish Fetch. Every posting on these feeds is open right now, with a
// structured title, location, apply link and posted date, which is far better than scraping board HTML.
export type Vendor = 'greenhouse' | 'lever' | 'ashby';
export interface Board { vendor: Vendor; token: string }

export function boardFromUrl(value: string): Board | null {
  try {
    const url = new URL(value);
    const token = url.pathname.split('/').filter(Boolean)[0];
    if (!token || token === 'embed') return null;
    if (/(^|\.)greenhouse\.io$/.test(url.hostname)) return { vendor: 'greenhouse', token };
    if (/(^|\.)lever\.co$/.test(url.hostname) && url.hostname.startsWith('jobs.')) return { vendor: 'lever', token };
    if (url.hostname === 'jobs.ashbyhq.com') return { vendor: 'ashby', token };
  } catch { /* not a URL */ }
  return null;
}
export const boardKey = (board: Board) => `${board.vendor}:${board.token}`;
export function boardApiUrl(board: Board): string {
  const token = encodeURIComponent(board.token);
  if (board.vendor === 'greenhouse') return `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`;
  if (board.vendor === 'lever') return `https://api.lever.co/v0/postings/${token}?mode=json&limit=250`;
  return `https://api.ashbyhq.com/posting-api/job-board/${token}`;
}
// Boards ranked by how many Search hits pointed at them (the strongest signal that they hold matching roles).
export function boardsFromHits(urls: string[], limit: number): Board[] {
  const counts = new Map<string, { board: Board; hits: number }>();
  for (const url of urls) {
    const board = boardFromUrl(url);
    if (!board) continue;
    const entry = counts.get(boardKey(board)) ?? { board, hits: 0 };
    entry.hits++; counts.set(boardKey(board), entry);
  }
  return [...counts.values()].sort((a, b) => b.hits - a.hits).slice(0, limit).map(entry => entry.board);
}

// Fetch wraps JSON in code fences and may leave raw control characters inside strings.
function looseJson(text: string): unknown {
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').replace(/[\u0000-\u001f]+/g, ' ');
  try { return JSON.parse(cleaned); } catch { return undefined; }
}
const text = (value: unknown) => typeof value === 'string' ? value : '';
const iso = (value: unknown) => {
  const date = typeof value === 'number' ? new Date(value) : typeof value === 'string' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};
const company = (board: Board, name?: string) => name || board.token.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
const employment: Record<string, ListingFacts['employment_type']> = { fulltime: 'full_time', 'full-time': 'full_time', parttime: 'part_time', 'part-time': 'part_time', intern: 'internship', internship: 'internship', contract: 'contract', contractor: 'contract', temporary: 'temporary', freelance: 'freelance', apprenticeship: 'apprenticeship' };
const workMode = (value: unknown): Listing['work_mode'] | undefined => {
  const mode = text(value).toLowerCase().replace(/[^a-z]/g, '');
  return mode === 'remote' ? 'remote' : mode === 'hybrid' ? 'hybrid' : mode === 'onsite' ? 'onsite' : undefined;
};
const interval: Record<string, 'hourly' | 'monthly' | 'annual'> = { 'per-hour-wage': 'hourly', hourly: 'hourly', 'per-month-salary': 'monthly', monthly: 'monthly', 'per-year-salary': 'annual', yearly: 'annual', annual: 'annual' };

function build(board: Board, job: { title: string; url: string; location: string; company?: string; mode?: Listing['work_mode']; posted: string | null; type?: ListingFacts['employment_type']; description?: string; salary?: ListingFacts['salary']; department?: string }): Listing | null {
  const title = plain(job.title).slice(0, 200);
  if (title.length < 3 || !job.url.startsWith('http')) return null;
  const location = plain(job.location).slice(0, 250) || 'Not stated';
  const body = plain(job.description ?? '');
  const base = inferFacts(title, body);
  return makeListing({
    title, company: company(board, job.company), location, apply_url: job.url, source_url: job.url, source_name: board.vendor,
    seniority: inferSeniority(title, body), work_mode: job.mode ?? inferWorkMode(location, title, body), posted_at: job.posted,
    snippet: body.slice(0, 600), verification: 'detail',
    facts: { ...base, employment_type: job.type ?? base.employment_type, salary: job.salary ?? base.salary, department: base.department, open_on_board: true },
  });
}

export function parseBoard(board: Board, raw: string): Listing[] {
  const parsed = looseJson(raw) as Record<string, unknown> | unknown[] | undefined;
  const out: (Listing | null)[] = [];
  if (board.vendor === 'greenhouse') {
    const jobs = (parsed as { jobs?: Record<string, unknown>[] } | undefined)?.jobs ?? [];
    for (const job of jobs) out.push(build(board, { title: text(job.title), url: `https://job-boards.greenhouse.io/${board.token}/jobs/${job.id}`, location: text((job.location as { name?: string } | undefined)?.name), company: text(job.company_name), posted: iso(job.first_published) ?? iso(job.updated_at) }));
  } else if (board.vendor === 'lever') {
    for (const job of Array.isArray(parsed) ? parsed as Record<string, unknown>[] : []) {
      const categories = (job.categories ?? {}) as Record<string, string>;
      const pay = job.salaryRange as { min?: number; max?: number; currency?: string; interval?: string } | undefined;
      out.push(build(board, {
        title: text(job.text), url: text(job.hostedUrl), location: text(categories.location) || text((categories as unknown as { allLocations?: string[] }).allLocations?.[0]), posted: iso(job.createdAt),
        mode: workMode(job.workplaceType), type: employment[text(categories.commitment).toLowerCase().replace(/\s+/g, '')] ?? employment[text(categories.commitment).toLowerCase()], department: text(categories.team),
        description: text(job.descriptionPlain) || text(job.additionalPlain),
        salary: pay && typeof pay.min === 'number' && typeof pay.max === 'number' ? { min: pay.min, max: pay.max, currency: (pay.currency ?? 'USD').toUpperCase(), period: interval[text(pay.interval).toLowerCase()] ?? 'annual' } : undefined,
      }));
    }
  } else {
    let jobs = (parsed as { jobs?: Record<string, unknown>[] } | undefined)?.jobs;
    if (!jobs) {
      // The feed can arrive without its opening braces; every posting's head (up to its description) still parses.
      jobs = [];
      for (const part of raw.split(/(?=\{"id":"[0-9a-f-]{36}","title":)/)) {
        if (!part.startsWith('{"id"')) continue;
        const head = part.split(',"descriptionHtml"')[0].replace(/[\u0000-\u001f]+/g, ' ');
        try { jobs.push({ ...(JSON.parse(`${head}}`) as Record<string, unknown>), descriptionPlain: /"descriptionPlain":"((?:[^"\\]|\\.)*)"/.exec(part)?.[1] ?? '' }); } catch { /* skip a posting that does not parse */ }
      }
    }
    for (const job of jobs) {
      if (job.isListed === false) continue;
      out.push(build(board, {
        title: text(job.title), url: text(job.jobUrl) || text(job.applyUrl), location: text(job.location), posted: iso(job.publishedAt),
        mode: job.isRemote === true ? 'remote' : workMode(job.workplaceType), type: employment[text(job.employmentType).toLowerCase()], description: text(job.descriptionPlain),
      }));
    }
  }
  return out.filter((job): job is Listing => job !== null);
}

// A Search hit that is already a job page becomes a (board-level) listing, so nothing Search found is thrown away.
export function listingFromHit(hit: { url: string; title: string; snippet: string }): Listing | null {
  const board = boardFromUrl(hit.url);
  let title = plain(hit.title).replace(/^.*?\bCareers\s*\|\s*/i, '').replace(/\s+(?:at|@)\s+[^|]+$/i, '').trim();
  // "Software Engineering Internship - San Francisco": the suffix is a place when it is a known city or "City, ST".
  let location = 'Not stated';
  const suffix = title.match(/\s+[-–|]\s+([A-Z][\p{L} .,'&-]+)$/u);
  if (suffix && (cityCoords(suffix[1]) || /,\s*[A-Z]{2}\b/.test(suffix[1]) || /\b(remote|hybrid)\b/i.test(suffix[1]))) { location = suffix[1].trim(); title = title.slice(0, suffix.index).trim(); }
  else title = title.replace(/\s*[|–-]\s*[A-Z][\w .&-]+$/, '').trim();
  if (title.length < 3) return null;
  const url = hit.url.replace(/^http:/, 'https:');
  return makeListing({
    title: title.slice(0, 200), company: company(board ?? { vendor: 'greenhouse', token: new URL(url).hostname.split('.')[0] }), apply_url: url, source_url: url, location,
    snippet: plain(hit.snippet).slice(0, 600), seniority: inferSeniority(title), work_mode: inferWorkMode(location, title, hit.snippet),
    facts: inferFacts(title, plain(hit.snippet)), verification: 'board',
  });
}
