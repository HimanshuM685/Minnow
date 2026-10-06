// Shown instantly inside the dashboard shell while a page loads, so navigation never feels stuck.
export default function Loading() {
  return <div aria-busy="true" aria-live="polite">
    <div className="page-heading"><h1>Loading…</h1></div>
    <div className="skeleton-card" /><div className="skeleton-card" />
  </div>;
}
