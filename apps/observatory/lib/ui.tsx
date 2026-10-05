import Link from 'next/link';
export const date = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
export const duration = (start: string, end: string | null) => end ? `${Math.max(0,Math.round((Date.parse(end)-Date.parse(start))/1000))}s` : '—';
export const pageNumber = (value?: string) => Math.max(1,Math.min(10000,Number.parseInt(value ?? '1',10)||1));
export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function Pagination({ page, count, path, params = {} }: { page: number; count: number; path: string; params?: Record<string,string|undefined> }) { const url = (n: number) => { const search = new URLSearchParams(); Object.entries(params).forEach(([k,v]) => { if(v) search.set(k,v); }); search.set('page',String(n)); return `${path}?${search}`; }; return <div className="pagination"><span>Page {page} · {count} rows</span><div>{page>1 && <Link href={url(page-1)}>Previous</Link>}{count===25 && <Link href={url(page+1)}>Next</Link>}</div></div>; }
export function Empty({ table }: { table: string }) { return <div className="empty-table">The {table} table is empty for this view. Run a hunt in Minnow to generate real telemetry.</div>; }
