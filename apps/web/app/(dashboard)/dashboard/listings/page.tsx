import Link from 'next/link';
import { bestMatches, getSearch, getSearchListings, latestSearch, latestSearchWithResults, previousDedupeKeys } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { JobCard } from '@/components/job-card';
import { dropLines, searchSummary, searchTitle } from '@/lib/search-label';
const isId = (value?: string) => !!value && /^[0-9a-f-]{36}$/i.test(value);
const when = (value: string) => new Date(value).toLocaleString();

// Views: the last search that returned jobs (default, never blank because a newer search found nothing),
// the best matches across every search, or one specific past search.
export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ view?: string; search?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const tabs = (active: string) => <nav className="view-tabs" aria-label="Shortlist views">
    <Link href="/dashboard/listings" className={active === 'latest' ? 'active' : ''}>Latest results</Link>
    <Link href="/dashboard/listings?view=best" className={active === 'best' ? 'active' : ''}>Best matches</Link>
    <Link href="/dashboard/searches">All searches</Link>
  </nav>;

  if (params.view === 'best') {
    const jobs = await bestMatches(user.id);
    return <><div className="page-heading"><h1>Best matches</h1><p>The strongest {jobs.length} openings across all your searches, one row per job, best score first.</p></div>{tabs('best')}
      {!jobs.length ? <div className="empty-results"><h3>No matches saved yet.</h3><p>Run a hunt and its results are kept here for good.</p><Link href="/dashboard" className="primary-button">Start a hunt</Link></div>
        : <div className="job-list">{jobs.map(job => <JobCard key={job.id} job={job} from={`${job.search_role || 'search'} · ${new Date(job.search_created_at).toLocaleDateString()}`} />)}</div>}</>;
  }

  const [newest, withResults, chosen] = await Promise.all([latestSearch(user.id), latestSearchWithResults(user.id), isId(params.search) ? getSearch(params.search!, user.id) : null]);
  const run = chosen ?? withResults ?? newest;
  if (!run) return <><div className="page-heading"><h1>Your shortlist</h1></div><div className="empty-results"><h3>Your next step starts with a hunt.</h3><p>No completed hunts yet. Set your preferences and discover live openings.</p><Link href="/dashboard" className="primary-button">Start a hunt</Link></div></>;
  const [listings, previous] = await Promise.all([getSearchListings(run.id, user.id), previousDedupeKeys(user.id, run.id)]);
  const old = new Set(previous);
  const drops = dropLines(run.preference_snapshot);
  // The newest search found nothing, but an older one did: say so instead of showing a blank page.
  const fellBack = !chosen && newest && newest.id !== run.id;
  return <><div className="page-heading"><h1>{chosen ? searchTitle(run.preference_snapshot) : 'Your shortlist'}</h1><p>{listings.length} ranked openings{Number(run.preference_snapshot.near) > 0 ? ` (${Number(run.preference_snapshot.strict)} strict, ${Number(run.preference_snapshot.near)} near)` : ''} · {searchSummary(run.preference_snapshot)} · {run.cache_hit ? 'cached hunt' : 'live hunt'} · {when(run.created_at)}</p></div>{tabs(chosen ? 'search' : 'latest')}
    {fellBack && <p className="run-banner">Your latest search (“{searchTitle(newest.preference_snapshot)}”, {when(newest.created_at)}) found no matches{dropLines(newest.preference_snapshot).length ? `: ${dropLines(newest.preference_snapshot).join(', ')}` : ''}. Showing your last search that did. <Link href={`/dashboard?from=${newest.id}`}>Adjust that search</Link></p>}
    {!listings.length && <div className="empty-results"><h3>No matches in this current.</h3><p>{drops.length ? `After your hard filters: ${drops.join(', ')}. Nothing was widened. Loosen one and run again.` : 'Try broader preferences. Hidden listings are omitted from your shortlist.'}</p><Link className="secondary-button" href={`/dashboard?from=${run.id}`}>Adjust your hunt</Link></div>}
    <div className="job-list">{listings.map(job => <JobCard key={job.id} job={job} isNew={previous.length > 0 && !old.has(job.dedupe_key)} />)}</div>
    <div className="run-footer">{run.search_count} searches · {run.fetch_count} fetches · {run.agent_count} Agent runs {run.cache_hit && '· cache replay, no new endpoint calls'}</div></>;
}
