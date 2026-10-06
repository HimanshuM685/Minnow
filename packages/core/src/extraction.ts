import { decodeHTML } from 'entities';
import { marked } from 'marked';
import { z } from 'zod';
import { listingSchema, seniorities, workModes, visaSignals, type Listing, type Preferences } from './contracts';
import { canonicalUrl, hash, isJobUrl, publicUrl, sourceFor } from './urls';
import { roleFit } from './matching';
import { inferFacts, parsePostedAt } from './facts';

export interface FetchPage {
  url: string; final_url?: string; title?: string | null; description?: string | null;
  text: string | object | null; links?: string[]; published_date?: string | null;
}

export function plain(value: string): string {
  return decodeHTML(value.replace(/<[^>]*>/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^[#>*\s-]+/gm, '').replace(/[*_`]/g, '')).replace(/\s+/g, ' ').trim();
}

const genericTitle = /^(careers?|jobs?|job application|apply( now| for this job)?|open (roles|positions)|current openings|opportunities|join (us|our team)|back to (all )?jobs|learn more|view (all )?jobs|search jobs|skip to .+)$/i;
export function cleanTitle(raw: string): string {
  return plain(raw).replace(/^Job Application for\s+/i, '').replace(/\s+at\s+[^|]+(?:\s*\|.*)?$/i, '')
    .replace(/\s*[|]\s*.+$/, '').replace(/\s+[-–—]\s+(?:Careers|Jobs|Greenhouse|Lever|Ashby).*$/i, '').trim().slice(0, 200);
}

export function inferSeniority(title: string, text = ''): Listing['seniority'] {
  if (/\b(intern(ship)?|co[ -]?op|placement student)\b/i.test(title)) return 'intern';
  if (/\b(new[ -]?grad(uate)?|early[ -]?career|entry[ -]?level|junior|graduate|apprentice|trainee)\b/i.test(title)) return 'new_grad';
  if (/\b(senior|sr\.?|staff|principal|lead|head|director|manager|vp)\b/i.test(title)) return 'senior';
  if (/\b(mid[ -]?level|intermediate)\b/i.test(title)) return 'mid';
  const years = text.match(/\b([2-9])\+?\s*(?:to|[-–])?\s*\d?\s*years?\s+(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+|hands-on\s+)?experience\b/i);
  if (years) return Number(years[1]) >= 7 ? 'senior' : 'mid';
  return 'unknown';
}

export function inferVisa(text: string): { signal: Listing['visa_signal']; evidence: string } {
  const statements = text.split(/(?<=[.!?])\s+|\n/).map(plain).filter(Boolean);
  const negative = /(?:\b(no|without)\s+(?:visa\s+|immigration\s+|employment\s+)?sponsorship\b|(?:cannot|can't|do not|does not|will not|won't|unable to|not able to|not eligible for|not offer|not provide|not available)[^.]{0,70}\bsponsor|sponsorship[^.]{0,40}(?:not (?:available|provided|offered)|unavailable)|(?:must|should)[^.]{0,80}without[^.]{0,30}sponsorship)/i;
  const positive = /(?:\b(?:we|company|employer)\s+(?:(?:can|will|do|may)\s+)?(?:offer|provide|support|sponsor)[^.]{0,50}(?:visa|immigration|sponsorship)|(?:visa|immigration|employment)\s+sponsorship\s+(?:is\s+)?(?:available|provided|offered|supported)|eligible for (?:visa )?sponsorship|(?:we|company|employer)[^.]{0,40}open to[^.]{0,30}sponsor)/i;
  for (const statement of statements) {
    if (negative.test(statement) && !statement.endsWith('?')) return { signal: 'no_sponsor', evidence: statement.slice(0, 700) };
  }
  for (const statement of statements) {
    if (/\?|\b(do you|will you|would you|require|need)\b[^.]*sponsorship/i.test(statement)) continue;
    if (positive.test(statement)) return { signal: 'sponsors', evidence: statement.slice(0, 700) };
  }
  return { signal: 'unknown', evidence: '' };
}

function inferWorkMode(location: string, title: string, text: string): Listing['work_mode'] {
  const header = `${location} ${title}`;
  if (/\bhybrid\b/i.test(header) || /(?:this (?:role|position)|work (?:mode|arrangement)|working model)[^.\n]{0,50}\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\bremote\b/i.test(header) || /(?:this (?:role|position) is|fully|100%|work (?:mode|arrangement):?)[^.\n]{0,40}\bremote\b/i.test(text)) return 'remote';
  if (/\bon[ -]?site\b|\bin[ -]?office\b/i.test(header) || /(?:this (?:role|position)|work (?:mode|arrangement))[^.\n]{0,50}\b(on[ -]?site|in[ -]?office)\b/i.test(text)) return 'onsite';
  return 'unknown';
}

export function isClosed(text: string): boolean {
  const top = plain(text.slice(0, 1800));
  return /(?:this (?:job|position|role|posting|opening) (?:is |has been )?(?:closed|filled|expired|no longer available)|no longer accepting applications|job (?:not found|unavailable)|position has been filled)/i.test(top);
}

function companyFrom(page: FetchPage, url: string): string {
  const title = page.title ?? '';
  const at = title.match(/\s+at\s+([^|]+?)(?:\s*[|]|$)/i) ?? title.match(/(?:careers|jobs|openings)\s+(?:at|with)\s+(.+)/i);
  if (at) return plain(at[1]).slice(0, 120);
  const parsed = new URL(url);
  const source = sourceFor(url);
  const slug = ['greenhouse', 'lever', 'ashby'].includes(source)
    ? parsed.pathname.split('/').filter(Boolean)[0]
    : parsed.hostname.replace(/^(www|jobs|careers)\./, '').split('.')[0];
  return (slug || 'Employer not stated').split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ').slice(0, 120);
}

function locationFrom(text: string, title: string, prefs: Preferences): string {
  const rawLines = text.split('\n').map(plain).filter(Boolean);
  // Use the opening's header/metadata, not all the office locations in the description.
  const titleIndex = rawLines.findIndex(line => cleanTitle(line).toLowerCase() === title.toLowerCase());
  const lines = rawLines.slice(Math.max(0, titleIndex), Math.max(0, titleIndex) + 24);
  const nonValue = /^(apply|employment type|department|team|compensation|about|overview|responsibilities|requirements|full[ -]time|part[ -]time)/i;
  for (let i = 0; i < lines.length; i++) {
    const labelled = lines[i].match(/^(?:job )?locations?\s*[:：|]\s*(.+)$/i);
    if (labelled && !nonValue.test(labelled[1])) return labelled[1].slice(0, 250);
    if (/^(?:job )?locations?$/i.test(lines[i]) && lines[i + 1] && !nonValue.test(lines[i + 1])) return lines[i + 1].slice(0, 250);
  }
  const geo = /\b(?:remote|hybrid|United States|United Kingdom|India|Canada|Germany|France|Singapore|Australia|Netherlands|Bengaluru|Bangalore|Hyderabad|Mumbai|Delhi|Pune|London|New York|San Francisco|Seattle|Austin|Boston|Berlin|Paris|Toronto|Vancouver|Sydney|Melbourne|Dublin|Amsterdam)\b/i;
  for (const line of lines.slice(0, 12)) {
    if (line === title || line.length > 180 || nonValue.test(line)) continue;
    if (geo.test(line) && !/\b(we |our |you |company |team |looking |join |benefits |offices |opportunity |based in )/i.test(line)) return line.slice(0, 250);
  }
  const parenthetical = title.match(/\(([^)]+)\)/g)?.map(part => part.slice(1, -1)).find(part => geo.test(part));
  if (parenthetical) return parenthetical;
  for (const place of prefs.location.split(/\s+or\s+|;/i).map(item => item.trim()).filter(Boolean)) {
    const line = lines.slice(0, 10).find(line => line !== title && line.length < 120 && line.toLowerCase().includes(place.toLowerCase()) && !/\b(we|our|you|office|team)\b/i.test(line));
    if (line) return line;
  }
  const cityState = lines.slice(0, 10).find(line => /^[\p{L} .'-]+,\s*[A-Z]{2}(?:\s*[,;|].*)?$/u.test(line));
  return cityState?.slice(0, 250) ?? 'Not stated';
}

function excerpt(text: string, description?: string | null): string {
  if (description && description.length > 60) return plain(description).slice(0, 800);
  const paragraphs = text.split(/\n\s*\n/).map(plain);
  const chosen = paragraphs.filter(p => p.length > 90 && !/cookie|privacy policy|equal opportunity|voluntary self|race|veteran|disability|gender|submit application/i.test(p));
  return chosen.slice(0, 2).join(' ').slice(0, 800);
}

function makeListing(input: Partial<Listing> & Pick<Listing, 'title' | 'company' | 'apply_url' | 'source_url'>): Listing {
  return listingSchema.parse({
    id: hash(canonicalUrl(input.apply_url)), location: 'Not stated', seniority: 'unknown', work_mode: 'unknown',
    visa_signal: 'unknown', visa_evidence: '', snippet: '', sources: [input.source_url], posted_at: null,
    checked_at: new Date().toISOString(), extraction: 'fetch', verification: 'board', match_score: 0,
    match_reasons: [], uncertainties: [], source_name: sourceFor(input.apply_url), ...input,
  });
}

export function extractPage(page: FetchPage, prefs: Preferences): { listings: Listing[]; thin: boolean; closed: boolean } {
  const url = publicUrl(page.final_url ?? page.url);
  const text = typeof page.text === 'string' ? page.text : '';
  if (!url) return { listings: [], thin: false, closed: false };
  if (isClosed(text)) return { listings: [], thin: false, closed: true };
  const listings: Listing[] = [];
  const headings = [...text.matchAll(/^#{1,2}\s+(.+)$/gm)].map(match => cleanTitle(match[1]));
  const metadataTitle = cleanTitle(page.title ?? '');
  const jobHeadings = headings.filter(value => !genericTitle.test(value) && value.length > 3 && !/^(about|overview|description|requirements|responsibilities|who we|what you|benefits|compensation|location|department|employment)/i.test(value));
  const title = jobHeadings.find(value => value.toLowerCase() === metadataTitle.toLowerCase())
    ?? jobHeadings.find(value => roleFit(value, prefs.role) >= 0.5)
    ?? jobHeadings[0] ?? metadataTitle;
  if ((isJobUrl(url) || isJobUrl(page.url)) && title.length > 3 && !genericTitle.test(title) && text.length > 180 && /apply|responsibilit|requirements|qualifications|employment|salary|position|role\b/i.test(text)) {
    const visa = inferVisa(text);
    const location = locationFrom(text, title, prefs);
    listings.push(makeListing({
      title, company: companyFrom(page, url), location, apply_url: url, source_url: page.url,
      seniority: inferSeniority(title, plain(text)), work_mode: inferWorkMode(location, title, text),
      visa_signal: visa.signal, visa_evidence: visa.evidence, snippet: excerpt(text, page.description),
      posted_at: parsePostedAt(text, page.published_date),
      facts: { ...inferFacts(title, plain(text), prefs.filters.skills), ...(visa.signal === 'sponsors' ? { benefits: [...new Set([...(inferFacts(title, plain(text)).benefits ?? []), 'visa_support' as const])] } : {}) },
      verification: 'detail',
    }));
  } else {
    const seen = new Set<string>();
    const tokens = marked.lexer(text.slice(0, 250_000));
    marked.walkTokens(tokens, token => {
      if (token.type !== 'link') return;
      const link = token as { href: string; text: string };
      const target = publicUrl(link.href, url);
      if (!target || !isJobUrl(target)) return;
      const key = canonicalUrl(target);
      const title = cleanTitle(link.text);
      if (seen.has(key) || title.length < 4 || genericTitle.test(title) || title.length > 180) return;
      seen.add(key);
      listings.push(makeListing({ title, company: companyFrom({ ...page, title: null }, target), apply_url: target, source_url: page.url, seniority: inferSeniority(title) }));
    });
  }
  return { listings, thin: listings.length === 0 && !/\b(no (?:open|available|current) (?:positions|jobs|roles)|no jobs found|0 (?:jobs|openings))\b/i.test(text), closed: false };
}

const agentItem = z.object({
  title: z.string().min(3).max(200), company: z.string().min(1).max(120), location: z.string().max(250),
  apply_url: z.string(), snippet: z.string().max(800), visa_evidence: z.string().max(700),
  seniority: z.enum(seniorities), work_mode: z.enum(workModes), visa_signal: z.enum(visaSignals),
});

export function extractAgent(result: unknown, sourceUrl: string, skills: string[] = []): Listing[] {
  if (typeof result === 'string') { try { result = JSON.parse(result); } catch { return []; } }
  const parsed = z.object({ listings: z.array(z.unknown()).max(15) }).safeParse(result);
  if (!parsed.success) return [];
  return parsed.data.listings.flatMap(raw => {
    const item = agentItem.safeParse(raw);
    if (!item.success) return [];
    const url = publicUrl(item.data.apply_url, sourceUrl);
    if (!url || !isJobUrl(url) || genericTitle.test(item.data.title)) return [];
    const visa = inferVisa(item.data.visa_evidence);
    return [makeListing({
      ...item.data, title: cleanTitle(item.data.title), apply_url: url, source_url: sourceUrl,
      visa_signal: visa.signal, visa_evidence: visa.evidence, location: item.data.location || 'Not stated',
      facts: inferFacts(item.data.title, `${item.data.snippet} ${item.data.visa_evidence}`, skills),
      extraction: 'agent', verification: 'detail',
    })];
  });
}
