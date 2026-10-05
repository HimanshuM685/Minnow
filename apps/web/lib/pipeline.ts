import { buildQueries, discover, diversify, extractAgent, extractPage, matchListings, canonicalUrl, companyKey, publicUrl, type Listing, type Preferences, type RunStats, type SearchEvent, type SearchResult, type SourceReport, type SearchHit } from '@minnow/core';
import { TinyFishClient, TinyFishError, type FetchResponse } from './tinyfish';

export function emptyStats(): RunStats {
  return { searchRequests: 0, fetchRequests: 0, fetchedPages: 0, agentRuns: 0, discoveredUrls: 0, extracted: 0, duplicatesRemoved: 0, filteredOut: 0, companies: 0, durationMs: 0 };
}

export async function runSearch(
  prefs: Preferences, runId: string, key: string, signal: AbortSignal,
  emit: (event: SearchEvent) => void,
  config: { maxAgentRuns: number; agentDuration: number; skippedHosts?: string[]; stats?: RunStats },
): Promise<SearchResult> {
  const started = Date.now();
  const stats = config.stats ?? emptyStats();
  const client = new TinyFishClient(key, stats, signal);
  const reports: SourceReport[] = [];
  const raw: Listing[] = [];
  const stale = new Set<string>();
  const stubborn = new Map<string, { url: string; priority: number }>();
  const report = (item: SourceReport) => { reports.push(item); emit({ type: 'source', report: item }); };
  const progress = (stage: 'search' | 'fetch' | 'agent' | 'rank', message: string) => emit({ type: 'progress', stage, message });
  const partial = () => emit({ type: 'partial', listings: matchListings(raw.filter(job => !stale.has(canonicalUrl(job.apply_url))), prefs).listings.slice(0, 60) });
  const queries = buildQueries(prefs);
  progress('search', `Discovering openings across ${queries.length} source ${queries.length === 1 ? 'family' : 'families'}…`);
  const hits: SearchHit[] = [];
  let successes = 0;
  let authError: TinyFishError | undefined;
  // The bounded source-family queries run in parallel before one selected Fetch batch.
    await Promise.all(queries.map(async query => {
      try {
        const found = await client.search(query, prefs);
        hits.push(...found); successes++;
        const searchUrl = new URL('https://api.search.tinyfish.ai');
        searchUrl.searchParams.set('query', query.query);
        report({ url: searchUrl.href, name: query.name, stage: 'search', status: found.length ? 'ok' : 'empty', message: found.length ? `${found.length} links discovered` : 'No links returned for these preferences', count: found.length });
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof TinyFishError && error.status === 401) authError = error;
        report({ url: 'https://api.search.tinyfish.ai', name: query.name, stage: 'search', status: 'error', message: error instanceof TinyFishError ? error.message : 'Search timed out or could not connect. Try again.', count: 0 });
      }
    }));
  if (authError) throw authError;
  signal.throwIfAborted();
  if (!successes && !prefs.careersUrls.length) throw new TinyFishError('No search source completed. Check the source activity below and retry.');
  const discovered = discover(hits, prefs);
  const candidates = discovered.filter(item => !(config.skippedHosts ?? []).some(host => new URL(item.url).hostname === host || new URL(item.url).hostname.endsWith(`.${host}`))).slice(0, 10);
  for (const candidate of discovered) if (!candidates.includes(candidate)) {
    report({ url: candidate.url,name: new URL(candidate.url).hostname,stage: 'fetch',status: 'skipped',message: (config.skippedHosts ?? []).some(host=>new URL(candidate.url).hostname===host||new URL(candidate.url).hostname.endsWith(`.${host}`)) ? 'Host skipped by Observatory' : 'Fetch page budget reached',count: 0 });
  }
  stats.discoveredUrls = candidates.length;
  if (!candidates.length) {
    progress('rank', 'No suitable careers pages were discovered for these preferences.');
  }

  async function readBatch(urls: string[]) {
    let response: FetchResponse;
    try { response = await client.fetchPages(urls, prefs); }
    catch (error) {
      signal.throwIfAborted();
      if (error instanceof TinyFishError && error.status === 401) throw error;
      for (const url of urls) report({ url, name: new URL(url).hostname, stage: 'fetch', status: 'error', message: error instanceof TinyFishError ? error.message : 'Fetch timed out or could not connect.', count: 0 });
      return;
    }
    signal.throwIfAborted();
    for (const page of response.results) {
      if (!publicUrl(page.url)) continue;
      const parsed = extractPage(page, prefs);
      raw.push(...parsed.listings);
      if (parsed.closed) stale.add(canonicalUrl(page.url));
      if (parsed.thin) stubborn.set(canonicalUrl(page.url), { url: page.url, priority: 20 });
      report({ url: page.url, name: new URL(page.url).hostname, stage: 'fetch', status: parsed.listings.length ? 'ok' : 'empty', message: parsed.closed ? 'Closed posting excluded' : parsed.listings.length ? `${parsed.listings.length} ${parsed.listings.length === 1 ? 'opening' : 'openings'} extracted${parsed.listings[0]?.verification === 'board' ? '; board links only, individual details not inspected' : ''}` : parsed.thin ? 'No readable listings; eligible for Agent scanning' : 'No current openings on this page', count: parsed.listings.length });
    }
    for (const failure of response.errors) {
      if (!publicUrl(failure.url)) continue;
      if (['page_not_found', 'login_required'].includes(failure.error) || [404, 410].includes(failure.status ?? 0)) stale.add(canonicalUrl(failure.url));
      if (['bot_blocked', 'empty_content', 'timeout'].includes(failure.error) || failure.error === 'target_http_error' && failure.status === 403) {
        stubborn.set(canonicalUrl(failure.url), { url: failure.url, priority: 15 });
      }
      const descriptions: Record<string, string> = {
        page_not_found: 'Page no longer exists; excluded', login_required: 'Sign-in required; skipped',
        bot_blocked: 'Page blocked the reader; eligible for Agent scanning', empty_content: 'No readable content; eligible for Agent scanning',
        timeout: 'Page timed out; eligible for Agent scanning',
      };
      report({ url: failure.url, name: new URL(failure.url).hostname, stage: 'fetch', status: 'error', message: descriptions[failure.error] ?? `Page could not be read (${failure.error})`, count: 0 });
    }
    partial();
  }

  if (candidates.length) {
    progress('fetch', `Reading ${candidates.length} live job and careers pages…`);
    await readBatch(candidates.map(item => item.url));
  }

  const scanLimit = prefs.useAgent ? config.maxAgentRuns : 0;
  const distinctBoards = new Map<string, { url: string; priority: number }>();
  for (const page of [...stubborn.values()].sort((a, b) => b.priority - a.priority)) {
    if (!distinctBoards.has(companyKey(page.url))) distinctBoards.set(companyKey(page.url), page);
  }
  const agentPages = diversify([...distinctBoards.values()], scanLimit);
  const agentCompanies = new Set<string>();
  for (const candidate of agentPages) {
    signal.throwIfAborted();
    if (agentCompanies.has(companyKey(candidate.url))) continue;
    agentCompanies.add(companyKey(candidate.url));
    const host = new URL(candidate.url).hostname;
    progress('agent', `Scanning ${host} with TinyFish Agent…`);
    try {
      const result = await client.agent(candidate.url, prefs, config.agentDuration, message => progress('agent', `${host}: ${message}`));
      const jobs = extractAgent(result, candidate.url);
      raw.push(...jobs);
      report({ url: candidate.url, name: host, stage: 'agent', status: jobs.length ? 'ok' : 'empty', message: jobs.length ? `${jobs.length} openings extracted by Agent` : 'Agent found no structured matching openings', count: jobs.length });
      partial();
    } catch (error) {
      signal.throwIfAborted();
      report({ url: candidate.url, name: host, stage: 'agent', status: 'error', message: error instanceof TinyFishError ? error.message : 'Agent scan timed out or was interrupted; other sources are retained.', count: 0 });
    }
  }
  for (const candidate of stubborn.values()) {
    if (agentCompanies.has(companyKey(candidate.url))) continue;
    report({ url: candidate.url, name: new URL(candidate.url).hostname, stage: 'agent', status: 'skipped', message: scanLimit ? 'Agent run cap reached' : 'Agent scanning is disabled', count: 0 });
  }
  signal.throwIfAborted();
  if (candidates.length && stats.fetchedPages===0 && !reports.some(item=>item.stage==='agent' && ['ok','empty'].includes(item.status))) {
    throw new TinyFishError('No careers page could be read. Review the source failures and retry.');
  }
  progress('rank', 'Removing duplicates and matching your preferences…');
  const matched = matchListings(raw.filter(job => !stale.has(canonicalUrl(job.apply_url))), prefs);
  stats.extracted = raw.length;
  stats.duplicatesRemoved = matched.duplicatesRemoved;
  stats.filteredOut = matched.filteredOut;
  stats.companies = new Set(matched.listings.map(job => job.company.toLowerCase())).size;
  stats.durationMs = Date.now() - started;
  return { runId, preferences: prefs, listings: matched.listings.slice(0, 60), reports, stats, checkedAt: new Date().toISOString(), cached: false };
}
