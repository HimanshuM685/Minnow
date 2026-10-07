import { getSearch, getSearchEvents } from '@minnow/db';
import { requireAdmin } from '@/lib/auth/admin';
import { TraceTimeline } from '@/components/admin/trace';
import { isUuid } from '@/lib/admin/ui';
export default async function Trace({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireAdmin();
  const { id } = await searchParams;
  const run = id && isUuid(id) ? await getSearch(id) : null;
  const events = run ? await getSearchEvents(run.id) : [];
  return <><header className="page-heading"><h1>Trace</h1><p>One search ID in. Its actual persisted timeline out.</p></header><form className="filter-bar"><input name="id" aria-label="Search UUID" placeholder="Search UUID" defaultValue={id} required className="trace-input mono" /><button>Load trace</button></form>{!id ? <div className="empty-table">Enter a search ID from Hunts to inspect Search, Fetch, Agent, parse and rank events.</div> : !run ? <div className="empty-table">No stored search matches this ID.</div> : <><div className="run-summary"><span className="mono">{run.id}</span><span>{run.status}</span><span>{run.search_count} S / {run.fetch_count} F / {run.agent_count} A</span></div><TraceTimeline events={events} /></>}</>;
}
