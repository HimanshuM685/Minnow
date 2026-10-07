// Live check against the real TinyFish APIs (uses TINYFISH_API_KEY from .env.local).
//   npm run verify:hunt --workspace=@minnow/web
// Fails if any case returns fewer than 6 open posts.
import { defaultPreferences, normalizeFilters, type Preferences } from '@minnow/core';
import { emptyStats, runSearch } from '../lib/pipeline';

const key = process.env.TINYFISH_API_KEY;
if (!key) { console.error('Set TINYFISH_API_KEY (apps/web/.env.local).'); process.exit(2); }

const cases: { name: string; prefs: Partial<Preferences>; filters?: object }[] = [
  { name: 'Software Engineer Intern, Remote, IN', prefs: { role: 'Software Engineer Intern', location: 'Remote', country: 'IN', seniority: 'intern' }, filters: { employmentType: 'full_time', experience: { band: 'entry' } } },
  { name: 'Intern (level only), Kolkata', prefs: { role: 'Intern', location: 'Kolkata', country: 'IN', seniority: 'intern', profession: 'Engineering' } },
  { name: 'AI Enginner (typo), Remote', prefs: { role: 'AI Enginner', location: 'Remote', country: 'US' }, filters: { experience: { band: 'entry' } } },
  { name: 'SWE Intern, United States', prefs: { role: 'SWE Intern', location: '', country: 'US', seniority: 'intern' } },
];

let failed = 0;
for (const testCase of cases) {
  const started = Date.now();
  const prefs = { ...defaultPreferences, ...testCase.prefs, filters: normalizeFilters(testCase.filters ?? {}) } as Preferences;
  const result = await runSearch(prefs, 'verify', key, AbortSignal.timeout(170_000), () => {}, { maxAgentRuns: 2, agentDuration: 60, budgetMs: 150_000, stats: emptyStats() });
  const ok = result.listings.length >= 6;
  if (!ok) failed++;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${testCase.name}: ${result.listings.length} posts (${result.strict} strict, ${result.near} near, relaxed: ${result.relaxed.join(',') || 'none'}) in ${Math.round((Date.now() - started) / 1000)}s · search ${result.stats.searchRequests} fetch ${result.stats.fetchRequests} agent ${result.stats.agentRuns}`);
  for (const job of result.listings.slice(0, 8)) console.log(`   ${String(job.match_score).padStart(3)}%  ${job.title.slice(0, 54).padEnd(54)} ${job.company.slice(0, 18).padEnd(18)} ${job.location.slice(0, 28).padEnd(28)} ${job.facts.open_on_board ? 'open✓' : 'unverified'}${job.facts.relaxed ? ' near' : ''}  ${job.apply_url}`);
  if (!ok) console.log('   drops:', JSON.stringify(result.drops), '| reports:', result.reports.filter(report => report.status === 'error').map(report => report.message).slice(0, 3));
}
process.exit(failed ? 1 : 0);
