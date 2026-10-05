import { listListings } from '@minnow/db';
import { requireAdmin } from '@/lib/auth/admin';
import { Empty, Pagination, pageNumber, date } from '@/lib/admin/ui';
import { setListingVisibility } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Listings({ searchParams }: { searchParams: Promise<{ page?: string; company?: string; source?: string; location?: string; hidden?: string }> }) {
  await requireAdmin();
  const filters = await searchParams;
  const page = pageNumber(filters.page);
  const jobs = await listListings(page, filters);
  return <><header className="page-heading"><h1>Listings</h1><p>Moderate stored results. Hidden rows are omitted from the web shortlist.</p></header>
    <form className="filter-bar"><input name="company" placeholder="Company" aria-label="Company" defaultValue={filters.company} /><input name="location" placeholder="Location" aria-label="Location" defaultValue={filters.location} /><select name="source" aria-label="Source" defaultValue={filters.source ?? ''}><option value="">All sources</option>{['careers', 'greenhouse', 'lever', 'ashby', 'portal'].map(source => <option key={source}>{source}</option>)}</select><select name="hidden" aria-label="Visibility" defaultValue={filters.hidden ?? ''}><option value="">Visible + hidden</option><option value="false">Visible</option><option value="true">Hidden</option></select><button>Filter</button></form>
    {!jobs.length ? <Empty table="listings" /> : <div className="table-scroll"><table><thead><tr><th>Opening</th><th>Location / source</th><th>Fit</th><th>Read</th><th>Visibility</th></tr></thead><tbody>{jobs.map(job => <tr key={job.id}><td><a href={job.apply_url} target="_blank" rel="noreferrer">{job.title}</a><small>{job.company}</small></td><td>{job.location}<small>{job.source_name}</small></td><td>{job.score}</td><td>{date(job.fetched_at)}</td><td><form action={setListingVisibility} className="row-action"><input type="hidden" name="id" value={job.id} /><input type="hidden" name="hidden" value={String(!job.hidden)} />{!job.hidden && <input name="reason" placeholder="Reason" maxLength={500} aria-label={`Hide reason for ${job.title}`} />}<button className={job.hidden ? '' : 'danger'}>{job.hidden ? 'Unhide' : 'Hide'}</button>{job.hidden_reason && <small>{job.hidden_reason}</small>}</form></td></tr>)}</tbody></table></div>}
    <Pagination page={page} count={jobs.length} path="/listings" params={filters} /></>;
}
