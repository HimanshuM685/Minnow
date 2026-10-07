import Link from 'next/link';
import { searchHistory } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { dropLines, searchSummary, searchTitle } from '@/lib/search-label';

// Every search is stored in Neon (searches + listings) and listed here, including ones that found nothing.
export default async function SearchesPage() {
  const user = await requireUser();
  const searches = await searchHistory(user.id);
  return <>
    <div className="page-heading"><h1>All searches</h1><p>Every hunt you have run is saved, with its filters and results. Open one to see its shortlist, or run it again with the same settings.</p></div>
    <nav className="view-tabs" aria-label="Shortlist views"><Link href="/dashboard/listings">Latest results</Link><Link href="/dashboard/listings?view=best">Best matches</Link><Link href="/dashboard/searches" className="active">All searches</Link></nav>
    {!searches.length ? <div className="empty-results"><h3>No searches yet.</h3><p>Your first hunt will be saved here automatically.</p><Link href="/dashboard" className="primary-button">Start a hunt</Link></div> :
      <div className="search-history">{searches.map(search => {
        const drops = dropLines(search.preference_snapshot);
        const state = search.status === 'running' ? 'Running' : search.status === 'error' ? 'Failed' : search.found ? `${search.found} jobs` : 'No matches';
        return <article className="content-card search-row" key={search.id}>
          <div>
            <h2>{searchTitle(search.preference_snapshot)}</h2>
            <p className="field-hint">{searchSummary(search.preference_snapshot)} · {new Date(search.created_at).toLocaleString()}{search.cache_hit ? ' · cache replay' : ''}</p>
            {search.status === 'error' && search.error && <p className="field-hint">{search.error}</p>}
            {search.status === 'done' && !search.found && drops.length > 0 && <p className="field-hint">After hard filters: {drops.join(', ')}.</p>}
          </div>
          <div className="search-row-meta"><span className={`badge${search.found ? '' : ' muted'}`}>{state}</span>{search.best !== null && <span className="match-pct">best {Math.round(search.best)}%</span>}</div>
          <div className="form-buttons">
            {search.status === 'done' && <Link className="secondary-button" href={`/dashboard/listings?search=${search.id}`}>View results</Link>}
            <Link className="secondary-button" href={`/dashboard?from=${search.id}`}>Run again</Link>
          </div>
        </article>;
      })}</div>}
  </>;
}
