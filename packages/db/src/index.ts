import { getSql } from './client';
import type { BestMatchRow, SearchHistoryRow, DbListingInput, ListingRow, PreferenceRow, ProfileRow, WalletRow, ResumeRow, SearchEventRow, SearchInput, SearchRow, SourceHealthRow } from './types';
export * from './types';
export { getSql } from './client';
export { ensureSchema } from './schema';
import { ensureSchema } from './schema';
export { isAdminEmail, hasGoogleAccount } from './access';

const normalizeRow = (row: unknown) => Object.fromEntries(Object.entries(row as Record<string,unknown>).map(([key,value])=>[key,value instanceof Date ? value.toISOString() : key==='score' ? Number(value) : value]));
const one = <T>(rows: unknown[]) => rows.length ? normalizeRow(rows[0]) as T : null;
const rows = <T>(value: unknown[]) => value.map(normalizeRow) as T[];

// One statement (a single round trip) creates the profile, preferences and wallet rows. Instances remember users
// they already ensured for 10 minutes, so ordinary page loads skip it entirely.
const ensured = new Map<string, number>();
export const forgetEnsuredProfiles = () => ensured.clear();
export async function ensureProfile(userId: string, name: string) {
  if ((ensured.get(userId) ?? 0) > Date.now()) return null;
  await ensureSchema();
  const result = await getSql()`WITH p AS (INSERT INTO profiles(user_id, display_name) VALUES(${userId}, ${name}) ON CONFLICT(user_id) DO UPDATE SET display_name = CASE WHEN profiles.display_name = '' THEN EXCLUDED.display_name ELSE profiles.display_name END RETURNING user_id, display_name, profession, headline, created_at, updated_at),
    pr AS (INSERT INTO preferences(user_id) VALUES(${userId}) ON CONFLICT(user_id) DO NOTHING),
    w AS (INSERT INTO wallets(user_id) VALUES(${userId}) ON CONFLICT(user_id) DO NOTHING RETURNING user_id, credits),
    l AS (INSERT INTO credit_ledger(user_id, delta, reason) SELECT user_id, credits, 'signup' FROM w)
    SELECT * FROM p`;
  ensured.set(userId, Date.now() + 600_000);
  return one<ProfileRow>(result);
}
export async function getProfile(userId: string) { return one<ProfileRow>(await getSql()`SELECT user_id, display_name, profession, headline, created_at, updated_at FROM profiles WHERE user_id=${userId}`); }
export const FREE_CREDITS = 10;
// Server-only: includes the stored TinyFish key. Pages must expose only hasKey.
export async function getWallet(userId: string) { return one<WalletRow>(await getSql()`SELECT user_id, credits, tinyfish_key, updated_at FROM wallets WHERE user_id=${userId}`); }
// ---- Credits -------------------------------------------------------------------------------------
// Every balance change is ONE SQL statement that also writes a credit_ledger row, so the wallet and its history can
// never disagree (creditAudit proves it). Charges, refunds and top-ups never read-then-write.
export const DEEP_SEARCH_COST = 2;
export const SEARCH_COST = 1;
export const STALE_HUNT_MINUTES = 6;
export class SearchConflictError extends Error {}

// Atomic debit. Returns remaining credits, or null when the wallet holds fewer than `amount` (nothing changes).
export async function spendCredits(userId: string, amount: number, reason = 'search') {
  const result = await getSql()`WITH w AS (UPDATE wallets SET credits=credits-${amount}, updated_at=now() WHERE user_id=${userId} AND credits>=${amount} RETURNING user_id, credits),
    l AS (INSERT INTO credit_ledger(user_id,delta,reason) SELECT user_id, ${-amount}, ${reason} FROM w)
    SELECT credits FROM w`;
  return result.length ? Number((result[0] as { credits: number }).credits) : null;
}
export const spendCredit = (userId: string) => spendCredits(userId, SEARCH_COST);
// Exact top-up or removal. A removal larger than the balance changes nothing (returns false).
export async function addCredits(userId: string, amount: number, reason = 'adjustment') {
  const delta = Math.trunc(amount);
  if (!delta) return true;
  const result = await getSql()`WITH w AS (UPDATE wallets SET credits=credits+${delta}, updated_at=now() WHERE user_id=${userId} AND credits+${delta}>=0 RETURNING user_id),
    l AS (INSERT INTO credit_ledger(user_id,delta,reason) SELECT user_id, ${delta}, ${reason} FROM w)
    SELECT user_id FROM w`;
  return result.length > 0;
}

// Charge and create the search in ONE statement: either both happen or neither (no charge without a hunt, no hunt
// without a charge). A unique index allows one running hunt per user, so a second click or tab can never double-charge.
// `requestId` makes a retried click idempotent: it returns the search the first click created.
export async function startSearch(input: { userId: string; snapshot: Record<string, unknown>; cacheHit: boolean; cost: number; reason: string; requestId?: string }): Promise<{ search: SearchRow; existing: boolean } | null> {
  if (input.requestId) { const existing = await searchByRequest(input.userId, input.requestId); if (existing) return { search: existing, existing: true }; }
  const snapshot = JSON.stringify({ ...input.snapshot, credits_charged: input.cost, ...(input.requestId ? { request_id: input.requestId } : {}) });
  const sql = getSql();
  try {
    const rowsOut = input.cost > 0
      ? await sql`WITH spent AS (UPDATE wallets SET credits=credits-${input.cost}, updated_at=now() WHERE user_id=${input.userId} AND credits>=${input.cost} RETURNING user_id),
          s AS (INSERT INTO searches(user_id,preference_snapshot,cache_hit) SELECT ${input.userId}, ${snapshot}::jsonb, ${input.cacheHit} FROM spent RETURNING id,user_id,preference_snapshot,status,error,cache_hit,search_count,fetch_count,agent_count,created_at,finished_at),
          l AS (INSERT INTO credit_ledger(user_id,delta,reason,search_id) SELECT ${input.userId}, ${-input.cost}, ${input.reason}, s.id FROM s)
          SELECT * FROM s`
      : await sql`INSERT INTO searches(user_id,preference_snapshot,cache_hit) VALUES(${input.userId},${snapshot}::jsonb,${input.cacheHit}) RETURNING id,user_id,preference_snapshot,status,error,cache_hit,search_count,fetch_count,agent_count,created_at,finished_at`;
    const search = one<SearchRow>(rowsOut);
    return search ? { search, existing: false } : null; // null = not enough credits
  } catch (error) {
    if (!/23505|duplicate key|unique/i.test(String((error as { code?: string }).code ?? '') + String((error as Error).message))) throw error;
    // The statement rolled back as a whole, so nothing was charged. Either this exact click already created a search, or another hunt is running.
    const existing = input.requestId ? await searchByRequest(input.userId, input.requestId) : null;
    if (existing) return { search: existing, existing: true };
    throw new SearchConflictError('A hunt is already running for your account.');
  }
}
export async function searchByRequest(userId: string, requestId: string) { return one<SearchRow>(await getSql()`SELECT id,user_id,preference_snapshot,status,error,cache_hit,search_count,fetch_count,agent_count,created_at,finished_at FROM searches WHERE user_id=${userId} AND preference_snapshot->>'request_id'=${requestId}`); }

// Finish a hunt and (optionally) refund what it charged, in one statement. Only the running -> finished transition
// pays out, so a refund can happen at most once no matter which path (run, stale cleanup, retry) gets there first.
export async function settleSearch(id: string, status: 'done' | 'error', error: string | null, counts: { search: number; fetch: number; agent: number }, refund: boolean) {
  const result = await getSql()`WITH s AS (UPDATE searches SET status=${status}, error=${error}, search_count=${counts.search}, fetch_count=${counts.fetch}, agent_count=${counts.agent}, finished_at=now() WHERE id=${id} AND status='running' RETURNING user_id, COALESCE((preference_snapshot->>'credits_charged')::int, CASE WHEN preference_snapshot->>'charged'='true' THEN 1 ELSE 0 END) AS charged),
    w AS (UPDATE wallets SET credits=credits+s.charged, updated_at=now() FROM s WHERE wallets.user_id=s.user_id AND ${refund}::boolean AND s.charged>0 RETURNING wallets.user_id, s.charged),
    l AS (INSERT INTO credit_ledger(user_id,delta,reason,search_id) SELECT user_id, charged, 'refund', ${id}::uuid FROM w)
    SELECT (SELECT count(*) FROM s)::int AS settled, COALESCE((SELECT sum(charged) FROM w),0)::int AS refunded`;
  const row = result[0] as { settled: number; refunded: number };
  return { settled: row.settled > 0, refunded: row.refunded };
}

// Hunts killed mid-run (serverless timeout, crash) stay 'running'. Close them and refund what they charged, once.
export async function reconcileStaleSearches(userId: string) {
  const result = await getSql()`WITH s AS (UPDATE searches SET status='error', error='The hunt did not finish (timed out). Your credits were refunded.', finished_at=now() WHERE user_id=${userId} AND status='running' AND created_at < now()-make_interval(mins => ${STALE_HUNT_MINUTES}) RETURNING id, user_id, COALESCE((preference_snapshot->>'credits_charged')::int, CASE WHEN preference_snapshot->>'charged'='true' THEN 1 ELSE 0 END) AS charged),
    w AS (UPDATE wallets SET credits=credits+(SELECT COALESCE(sum(charged),0) FROM s), updated_at=now() WHERE user_id=${userId} AND EXISTS(SELECT 1 FROM s WHERE charged>0) RETURNING user_id),
    l AS (INSERT INTO credit_ledger(user_id,delta,reason,search_id) SELECT user_id, charged, 'refund', id FROM s WHERE charged>0)
    SELECT COALESCE(sum(charged),0)::int AS refunded FROM s`;
  return Number((result[0] as { refunded: number }).refunded);
}
// Balance vs. the sum of its ledger. drift must always be 0.
export async function creditAudit(userId: string) {
  const row = one<{ balance: number; ledger: number }>(await getSql()`SELECT w.credits AS balance, COALESCE((SELECT sum(c.delta) FROM credit_ledger c WHERE c.user_id=w.user_id),0)::int AS ledger FROM wallets w WHERE w.user_id=${userId}`);
  return row ? { balance: Number(row.balance), ledger: Number(row.ledger), drift: Number(row.balance) - Number(row.ledger) } : null;
}
export async function creditLedger(userId: string, limit = 50) { return rows<{ id: number; delta: number; reason: string; search_id: string | null; created_at: string }>(await getSql()`SELECT id, delta, reason, search_id, created_at FROM credit_ledger WHERE user_id=${userId} ORDER BY id DESC LIMIT ${limit}`); }

// The user's in-flight hunt, so a returning user (or another tab) can see and follow it.
export async function runningSearch(userId: string) { return one<{ id: string; deep: boolean; created_at: string }>(await getSql()`SELECT id, COALESCE(preference_snapshot->>'deep','false')='true' AS deep, created_at FROM searches WHERE user_id=${userId} AND status='running' AND created_at >= now()-make_interval(mins => ${STALE_HUNT_MINUTES}) ORDER BY created_at DESC LIMIT 1`); }
// Latest progress line of a hunt (for background runs the user is not streaming).
export async function lastSearchProgress(id: string) { const row = one<{ detail: string }>(await getSql()`SELECT detail FROM search_events WHERE search_id=${id} AND host IS NULL ORDER BY id DESC LIMIT 1`); return row?.detail ?? ''; }
export async function hasRunningSearch(userId: string) { return (await getSql()`SELECT 1 FROM searches WHERE user_id=${userId} AND status='running' AND created_at >= now()-make_interval(mins => ${STALE_HUNT_MINUTES}) LIMIT 1`).length > 0; }
export async function saveTinyfishKey(userId: string, key: string | null) { await getSql()`UPDATE wallets SET tinyfish_key=${key}, updated_at=now() WHERE user_id=${userId}`; }
export async function getPreferences(userId: string) { return one<PreferenceRow>(await getSql()`SELECT user_id, role, profession, location_label, location_country_code, seniority, work_mode, visa, keywords, filters, updated_at FROM preferences WHERE user_id=${userId}`); }
export async function savePreferences(userId: string, prefs: Omit<PreferenceRow, 'user_id' | 'updated_at'>) {
  const sql = getSql();
  await sql`INSERT INTO preferences(user_id, role, profession, location_label, location_country_code, seniority, work_mode, visa, keywords, filters) VALUES(${userId},${prefs.role},${prefs.profession},${prefs.location_label},${prefs.location_country_code},${prefs.seniority},${prefs.work_mode},${prefs.visa},${prefs.keywords},${JSON.stringify(prefs.filters ?? {})}::jsonb) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,profession=EXCLUDED.profession,location_label=EXCLUDED.location_label,location_country_code=EXCLUDED.location_country_code,seniority=EXCLUDED.seniority,work_mode=EXCLUDED.work_mode,visa=EXCLUDED.visa,keywords=EXCLUDED.keywords,filters=EXCLUDED.filters,updated_at=now()`;
  await sql`UPDATE profiles SET profession=${prefs.profession}, updated_at=now() WHERE user_id=${userId}`;
}
export async function updateProfile(userId: string, name: string, profession: string, headline: string) {
  const sql = getSql();
  await sql.transaction([
    sql`UPDATE profiles SET display_name=${name}, profession=${profession}, headline=${headline}, updated_at=now() WHERE user_id=${userId}`,
    sql`UPDATE preferences SET profession=${profession}, updated_at=now() WHERE user_id=${userId}`,
  ]);
}
export async function getResume(userId: string) { return one<ResumeRow>(await getSql()`SELECT id, user_id, file_name, mime, bytes, extracted_text, uploaded_at FROM resumes WHERE user_id=${userId}`); }
export async function upsertResume(userId: string, fileName: string, mime: string, data: Buffer, text: string) {
  await getSql()`INSERT INTO resumes(user_id,file_name,mime,bytes,file_data,extracted_text) VALUES(${userId},${fileName},${mime},${data.length},decode(${data.toString('base64')},'base64'),${text}) ON CONFLICT(user_id) DO UPDATE SET file_name=EXCLUDED.file_name,mime=EXCLUDED.mime,bytes=EXCLUDED.bytes,file_data=EXCLUDED.file_data,extracted_text=EXCLUDED.extracted_text,uploaded_at=now()`;
}
export async function downloadResume(userId: string) { return one<{ file_name: string; mime: string; data: string }>(await getSql()`SELECT file_name,mime,encode(file_data,'base64') AS data FROM resumes WHERE user_id=${userId}`); }
export async function createSearch(input: SearchInput) { return one<SearchRow>(await getSql()`INSERT INTO searches(user_id,preference_snapshot,cache_hit) VALUES(${input.userId},${JSON.stringify(input.preferenceSnapshot)}::jsonb,${input.cacheHit ?? false}) RETURNING id,user_id,preference_snapshot,status,error,cache_hit,search_count,fetch_count,agent_count,created_at,finished_at`)!; }
// Adds fields (hard-filter drop counts) to a finished search's snapshot without touching the rest.
export async function patchSearchSnapshot(id: string, patch: Record<string, unknown>) { await getSql()`UPDATE searches SET preference_snapshot = preference_snapshot || ${JSON.stringify(patch)}::jsonb WHERE id=${id}`; }
export async function finishSearch(id: string, status: 'done' | 'error', error: string | null, counts: { search: number; fetch: number; agent: number }) { await getSql()`UPDATE searches SET status=${status},error=${error},search_count=${counts.search},fetch_count=${counts.fetch},agent_count=${counts.agent},finished_at=now() WHERE id=${id}`; }
export async function addSearchEvent(searchId: string, step: SearchEventRow['step'], host: string | null, url: string | null, ok: boolean, detail: string) { await getSql()`INSERT INTO search_events(search_id,step,host,url,ok,detail) VALUES(${searchId},${step},${host},${url},${ok},${detail})`; }
// Many trace rows in one round trip.
export async function addSearchEvents(searchId: string, events: { step: SearchEventRow['step']; host: string | null; url: string | null; ok: boolean; detail: string }[]) {
  if (!events.length) return;
  await getSql()`INSERT INTO search_events(search_id,step,host,url,ok,detail) SELECT ${searchId}::uuid, step, host, url, ok, detail FROM unnest(${events.map(e => e.step)}::text[], ${events.map(e => e.host)}::text[], ${events.map(e => e.url)}::text[], ${events.map(e => e.ok)}::boolean[], ${events.map(e => e.detail)}::text[]) AS t(step, host, url, ok, detail)`;
}
export async function updateSourceHealth(host: string, ok: boolean, error: string | null) { await getSql()`INSERT INTO source_health(host,last_ok_at,last_error_at,last_error,ok_count,error_count) VALUES(${host},CASE WHEN ${ok} THEN now() ELSE NULL END,CASE WHEN ${ok} THEN NULL ELSE now() END,${error},CASE WHEN ${ok} THEN 1 ELSE 0 END,CASE WHEN ${ok} THEN 0 ELSE 1 END) ON CONFLICT(host) DO UPDATE SET last_ok_at=CASE WHEN ${ok} THEN now() ELSE source_health.last_ok_at END,last_error_at=CASE WHEN ${ok} THEN source_health.last_error_at ELSE now() END,last_error=CASE WHEN ${ok} THEN source_health.last_error ELSE ${error} END,ok_count=source_health.ok_count+CASE WHEN ${ok} THEN 1 ELSE 0 END,error_count=source_health.error_count+CASE WHEN ${ok} THEN 0 ELSE 1 END`; }
export async function skippedHosts() { return rows<{ host: string }>(await getSql()`SELECT host FROM source_health WHERE skipped=true`).map(item => item.host); }
export async function insertListings(items: DbListingInput[]) {
  const sql = getSql();
  if (!items.length) return;
  await sql.transaction(items.map(item=>sql`INSERT INTO listings(search_id,user_id,dedupe_key,title,company,location,seniority,work_mode,visa_signal,snippet,apply_url,source_url,source_name,score,match_reasons,uncertainties,facts,fetched_at) VALUES(${item.searchId},${item.userId},${item.dedupeKey},${item.title},${item.company},${item.location},${item.seniority},${item.workMode},${item.visaSignal},${item.snippet},${item.applyUrl},${item.sourceUrl},${item.sourceName},${item.score},${item.matchReasons},${item.uncertainties ?? []},${JSON.stringify(item.facts ?? {})}::jsonb,${item.fetchedAt ?? new Date().toISOString()}) ON CONFLICT(search_id,dedupe_key) DO UPDATE SET score=EXCLUDED.score,match_reasons=EXCLUDED.match_reasons`));
}
export async function getSearch(id: string, userId?: string) { return one<SearchRow>(await getSql()`SELECT id,user_id,preference_snapshot,status,error,cache_hit,search_count,fetch_count,agent_count,created_at,finished_at FROM searches WHERE id=${id} AND (${userId ?? null}::text IS NULL OR user_id=${userId ?? null})`); }
export async function latestSearch(userId: string) { return one<SearchRow>(await getSql()`SELECT id,user_id,preference_snapshot,status,error,cache_hit,search_count,fetch_count,agent_count,created_at,finished_at FROM searches WHERE user_id=${userId} AND status='done' ORDER BY created_at DESC LIMIT 1`); }
// Every search the user ever ran, newest first, with how many listings each kept. Rows are never deleted.
export async function searchHistory(userId: string, limit = 50) {
  const found = rows<SearchHistoryRow & { best: string | number | null }>(await getSql()`SELECT s.id,s.status,s.error,s.cache_hit,s.created_at,s.finished_at,s.preference_snapshot,
    (SELECT count(*)::int FROM listings l WHERE l.search_id=s.id AND NOT l.hidden) AS found,
    (SELECT max(l.score) FROM listings l WHERE l.search_id=s.id AND NOT l.hidden) AS best
    FROM searches s WHERE s.user_id=${userId} ORDER BY s.created_at DESC LIMIT ${limit}`);
  return found.map(row => ({ ...row, best: row.best === null ? null : Number(row.best) })) as SearchHistoryRow[];
}
// The shortlist must never go blank because the newest hunt found nothing: fall back to the last one that did.
export async function latestSearchWithResults(userId: string) { return one<SearchRow>(await getSql()`SELECT id,user_id,preference_snapshot,status,error,cache_hit,search_count,fetch_count,agent_count,created_at,finished_at FROM searches s WHERE user_id=${userId} AND status='done' AND EXISTS(SELECT 1 FROM listings l WHERE l.search_id=s.id AND NOT l.hidden) ORDER BY created_at DESC LIMIT 1`); }
// Best match logic across all searches: one row per job (highest score wins, newest breaks ties), best first.
export async function bestMatches(userId: string, limit = 60) {
  return rows<BestMatchRow>(await getSql()`SELECT * FROM (
    SELECT DISTINCT ON (l.dedupe_key) l.id,l.search_id,l.user_id,l.dedupe_key,l.title,l.company,l.location,l.seniority,l.work_mode,l.visa_signal,l.snippet,l.apply_url,l.source_url,l.source_name,l.score,l.match_reasons,l.uncertainties,l.facts,l.fetched_at,l.hidden,l.hidden_reason,
      s.preference_snapshot->>'role' AS search_role, s.created_at AS search_created_at
    FROM listings l JOIN searches s ON s.id=l.search_id
    WHERE l.user_id=${userId} AND NOT l.hidden AND s.status='done'
    ORDER BY l.dedupe_key, l.score DESC, l.fetched_at DESC) best
    ORDER BY score DESC, fetched_at DESC LIMIT ${limit}`);
}
export async function getSearchListings(id: string, userId?: string, includeHidden = false) { return rows<ListingRow>(await getSql()`SELECT id,search_id,user_id,dedupe_key,title,company,location,seniority,work_mode,visa_signal,snippet,apply_url,source_url,source_name,score,match_reasons,uncertainties,facts,fetched_at,hidden,hidden_reason FROM listings WHERE search_id=${id} AND (${userId ?? null}::text IS NULL OR user_id=${userId ?? null}) AND (${includeHidden} OR hidden=false) ORDER BY score DESC,company,title`); }
export async function getSearchEvents(id: string) { return rows<SearchEventRow>(await getSql()`SELECT id,search_id,step,host,url,ok,detail,created_at FROM search_events WHERE search_id=${id} ORDER BY created_at,id`); }
export async function findCachedSearch(userId: string, hash: string) { return one<SearchRow>(await getSql()`SELECT id,user_id,preference_snapshot,status,error,cache_hit,search_count,fetch_count,agent_count,created_at,finished_at FROM searches WHERE user_id=${userId} AND status='done' AND cache_hit=false AND preference_snapshot->>'hash'=${hash} AND preference_snapshot->>'deep' IS DISTINCT FROM 'true' AND created_at > now()-interval '15 minutes' AND EXISTS(SELECT 1 FROM listings l WHERE l.search_id=searches.id AND NOT l.hidden) ORDER BY created_at DESC LIMIT 1`); }
export async function copyCachedListings(from: string, to: string, userId: string) { await getSql()`INSERT INTO listings(search_id,user_id,dedupe_key,title,company,location,seniority,work_mode,visa_signal,snippet,apply_url,source_url,source_name,score,match_reasons,uncertainties,facts,fetched_at,hidden,hidden_reason) SELECT ${to},${userId},dedupe_key,title,company,location,seniority,work_mode,visa_signal,snippet,apply_url,source_url,source_name,score,match_reasons,uncertainties,facts,fetched_at,hidden,hidden_reason FROM listings WHERE search_id=${from} AND user_id=${userId}`; }
export async function previousDedupeKeys(userId: string, currentSearch: string) { return rows<{ dedupe_key: string }>(await getSql()`SELECT dedupe_key FROM listings WHERE search_id=(SELECT id FROM searches WHERE user_id=${userId} AND status='done' AND id<>${currentSearch} ORDER BY created_at DESC LIMIT 1)`).map(item => item.dedupe_key); }

// Observatory queries select only what their server-rendered tables display.
export async function overviewStats() {
  const sql = getSql();
  const [totals, locations, roles] = await Promise.all([
    sql`WITH fetch_rows AS (
      SELECT ok FROM search_events WHERE step='fetch' AND host IS NOT NULL
      AND detail NOT IN ('Host skipped by Observatory','Fetch page budget reached')
    ) SELECT
      (SELECT count(*)::int FROM searches WHERE created_at>=date_trunc('day',now())) AS hunts_today,
      (SELECT count(*)::int FROM listings) AS listings_stored,
      (SELECT coalesce(sum(agent_count),0)::int FROM searches) AS agent_runs,
      (SELECT count(*)::int FROM fetch_rows WHERE ok=false) AS fetch_errors,
      (SELECT count(*)::int FROM fetch_rows) AS fetch_events`,
    sql`SELECT location,count(*)::int AS count FROM listings GROUP BY location ORDER BY count DESC LIMIT 8`,
    sql`SELECT preference_snapshot->>'role' AS role,count(*)::int AS count FROM searches GROUP BY preference_snapshot->>'role' ORDER BY count DESC LIMIT 8`,
  ]);
  return { totals: one<{ hunts_today: number; listings_stored: number; agent_runs: number; fetch_errors: number; fetch_events: number }>(totals)!, locations: rows<{ location: string; count: number }>(locations), roles: rows<{ role: string; count: number }>(roles) };
}
export async function listSearches(page = 1) { return rows<SearchRow>(await getSql()`SELECT id,user_id,preference_snapshot,status,error,cache_hit,search_count,fetch_count,agent_count,created_at,finished_at FROM searches ORDER BY created_at DESC LIMIT 25 OFFSET ${Math.max(0,page-1)*25}`); }
export async function listListings(page = 1, filters: { company?: string; source?: string; location?: string; hidden?: string } = {}) { return rows<ListingRow>(await getSql()`SELECT id,search_id,user_id,dedupe_key,title,company,location,seniority,work_mode,visa_signal,snippet,apply_url,source_url,source_name,score,match_reasons,uncertainties,facts,fetched_at,hidden,hidden_reason FROM listings WHERE (${filters.company ?? ''}='' OR company ILIKE ${`%${filters.company ?? ''}%`}) AND (${filters.source ?? ''}='' OR source_name=${filters.source ?? ''}) AND (${filters.location ?? ''}='' OR location ILIKE ${`%${filters.location ?? ''}%`}) AND (${filters.hidden ?? ''}='' OR hidden=(${filters.hidden === 'true'})) ORDER BY fetched_at DESC LIMIT 25 OFFSET ${Math.max(0,page-1)*25}`); }
export async function hideListing(id: string, hidden: boolean, reason: string) {
  // Moderate the user's canonical opening across existing live/cache copies.
  await getSql()`UPDATE listings SET hidden=${hidden},hidden_reason=${hidden ? reason : null} WHERE (user_id,dedupe_key)=(SELECT user_id,dedupe_key FROM listings WHERE id=${id})`;
}
export async function listSources(page = 1) { return rows<SourceHealthRow & { last_step: string | null; last_detail: string | null }>(await getSql()`SELECT h.host,h.last_ok_at,h.last_error_at,h.last_error,h.ok_count,h.error_count,h.skipped,e.step AS last_step,e.detail AS last_detail FROM source_health h LEFT JOIN LATERAL (SELECT step,detail FROM search_events WHERE host=h.host ORDER BY created_at DESC LIMIT 1) e ON true ORDER BY h.host LIMIT 25 OFFSET ${Math.max(0,page-1)*25}`); }
export async function skipSource(host: string, skipped: boolean) { await getSql()`UPDATE source_health SET skipped=${skipped} WHERE host=${host}`; }
export async function listPeople(page = 1) { return rows<ProfileRow & { role: string; location_label: string; seniority: string; visa: string; hunts: number; credits: number }>(await getSql()`SELECT p.user_id,p.display_name,p.profession,p.headline,p.created_at,p.updated_at,r.role,r.location_label,r.seniority,r.visa,(SELECT count(*)::int FROM searches s WHERE s.user_id=p.user_id) AS hunts,COALESCE(w.credits,0) AS credits FROM profiles p LEFT JOIN preferences r ON r.user_id=p.user_id LEFT JOIN wallets w ON w.user_id=p.user_id ORDER BY p.created_at DESC LIMIT 25 OFFSET ${Math.max(0,page-1)*25}`); }
export async function resumePreview(userId: string) { return one<{ file_name: string; mime: string; bytes: number; uploaded_at: string; preview: string }>(await getSql()`SELECT file_name,mime,bytes,uploaded_at,left(extracted_text,240) AS preview FROM resumes WHERE user_id=${userId}`); }
