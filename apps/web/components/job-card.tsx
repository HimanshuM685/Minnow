import { ArrowUpRight, Check, Clock3, MapPin } from 'lucide-react';
import type { ListingRow } from '@minnow/db/types';

const names: Record<string, string> = { role: 'Role', place: 'Location', experience: 'Experience', mode: 'Work mode', skills: 'Skills', prefs: 'Your other filters', quality: 'Posting quality' };
// Native tooltip: points earned out of points possible, only for the dimensions this user set.
const breakdown = (facts: Record<string, unknown>) => Object.entries((facts.breakdown ?? {}) as Record<string, { earned: number; possible: number }>).map(([key, part]) => `${names[key] ?? key}: ${part.earned}/${part.possible}`).join('\n') || 'Match score';

export function JobCard({ job, isNew = false, from }: { job: ListingRow; isNew?: boolean; from?: string }) {
  return <article className="job-card persisted-card">
    <div className="company-avatar blue">{job.company.slice(0, 2).toUpperCase()}</div>
    <div className="job-main">
      <div className="job-company"><span>{job.company}</span><span className="source-tag">{job.source_name}</span>{job.facts.open_on_board === true ? <span className="new-badge">Open on the company’s board</span> : job.uncertainties?.some(note => /not inspected/.test(note)) && <span className="source-tag">Not verified open</span>}{Array.isArray(job.facts.relaxed) && job.facts.relaxed.length > 0 && <span className="source-tag">Near match</span>}{isNew && <span className="new-badge">New since last hunt</span>}{from && <span className="source-tag">From: {from}</span>}</div>
      <h3>{job.title}</h3>
      <div className="job-meta"><span><MapPin size={14} />{job.location || 'Not stated'}</span><span>{job.seniority.replace('_', ' ')}</span><span>{job.work_mode}</span></div>
      <p className="job-snippet">{job.snippet}</p>
      <div className="match-reasons">{job.match_reasons.map(reason => <span key={reason}><Check size={12} />{reason}</span>)}</div>
      {job.uncertainties?.length > 0 && <p className="field-hint">{job.uncertainties.join(' · ')}</p>}
      <div className="job-foot"><span>{job.visa_signal === 'sponsors' ? 'Sponsorship mentioned' : job.visa_signal === 'no_sponsor' ? 'No sponsorship' : 'Sponsorship not stated'}</span><span><Clock3 size={12} /> Read {new Date(job.fetched_at).toLocaleString()}</span><a href={job.source_url} target="_blank" rel="noreferrer">Source</a></div>
    </div>
    <div className="job-actions"><span className="match-pct" title={breakdown(job.facts)}>{Math.round(Number(job.score))}% match</span><a className="apply-button" href={job.apply_url} target="_blank" rel="noreferrer">Apply <ArrowUpRight size={15} /></a></div>
  </article>;
}
