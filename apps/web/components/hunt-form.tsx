'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search, RefreshCw, LoaderCircle, Check, Sparkles } from 'lucide-react';
import type { PreferenceRow, SearchRow } from '@minnow/db/types';
import { followHunt, observationDelay, type HuntStatus } from '@/lib/hunt-observer';
import { activeDrawerCount, normalizeFilters, type HuntFilters } from '@minnow/core/filters';
import { PROFESSIONS, SKILLS } from '@/lib/suggestions';
import { TELEGRAM_HANDLE, TELEGRAM_URL } from '@/lib/links';
import { savePreferences } from '@/app/(dashboard)/dashboard/actions';
// Used only to prefill an empty country from the browser time zone; the user can change it.
const ZONES: Record<string, string> = { 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Europe/London': 'GB', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Asia/Singapore': 'SG', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US' };
const COUNTRIES = [['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['DE', 'Germany'], ['FR', 'France'], ['SG', 'Singapore'], ['AU', 'Australia']];
const OPTIONS = {
  experience: [['any', 'Any experience'], ['intern', 'Internship'], ['entry', 'Fresher / entry'], ['1-3', '1–3 years'], ['3-5', '3–5 years'], ['5-8', '5–8 years'], ['8+', '8+ years'], ['custom', 'Custom min / max']],
  employmentType: [['any', 'Any'], ['full_time', 'Full-time'], ['part_time', 'Part-time'], ['contract', 'Contract'], ['freelance', 'Freelance'], ['temporary', 'Temporary'], ['internship', 'Internship'], ['apprenticeship', 'Apprenticeship']],
  postedWithin: [['any', 'Any time'], ['24h', 'Last 24 hours'], ['3d', 'Last 3 days'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']],
  visa: [['any', 'No preference'], ['needs_sponsorship', 'Needs sponsorship'], ['no_sponsorship_needed', 'No sponsorship needed'], ['relocation_ok', 'Relocation OK'], ['open_globally', 'Open globally']],
  companySize: [['any', 'Any size'], ['startup_1_10', 'Startup 1–10'], ['11_50', '11–50'], ['51_200', '51–200'], ['201_1000', '201–1000'], ['enterprise', 'Enterprise']],
  companyStage: [['any', 'Any stage'], ['pre_seed', 'Pre-seed'], ['seed', 'Seed'], ['series_a', 'Series A'], ['series_b', 'Series B'], ['growth', 'Growth'], ['public', 'Public']],
  industry: [['any', 'Any industry'], ['ai', 'AI'], ['fintech', 'Fintech'], ['web3', 'Web3'], ['healthcare', 'Healthcare'], ['gaming', 'Gaming'], ['edtech', 'Edtech'], ['cybersecurity', 'Cybersecurity'], ['saas', 'SaaS'], ['robotics', 'Robotics'], ['climate', 'Climate']],
  department: [['any', 'Any department'], ['engineering', 'Engineering'], ['product', 'Product'], ['design', 'Design'], ['data', 'Data'], ['marketing', 'Marketing'], ['sales', 'Sales'], ['operations', 'Operations']],
  education: [['any', 'Any'], ['none', 'No degree'], ['bachelor', 'Bachelor’s'], ['master', 'Master’s'], ['phd', 'PhD']],
  language: [['any', 'Any language'], ['en', 'English'], ['de', 'German'], ['fr', 'French'], ['es', 'Spanish'], ['pt', 'Portuguese'], ['it', 'Italian'], ['nl', 'Dutch']],
  benefits: [['visa_support', 'Visa support'], ['equity', 'Equity'], ['relocation', 'Relocation'], ['health', 'Health']],
  sources: [['careers', 'Company careers'], ['greenhouse', 'Greenhouse'], ['lever', 'Lever'], ['ashby', 'Ashby'], ['workday', 'Workday'], ['portal', 'Public boards']],
} as const;
const Pick = ({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) =>
  <label>{label}<select value={value} onChange={e => onChange(e.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
// Chips for multi-value filters: pick a suggestion or type your own, then Enter.
function Chips({ label, values, onChange, list, placeholder }: { label: string; values: string[]; onChange: (values: string[]) => void; list?: string; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => { const clean = draft.trim(); if (clean && !values.some(item => item.toLowerCase() === clean.toLowerCase())) onChange([...values, clean]); setDraft(''); };
  return <div className="chip-field"><label>{label}<span className="skill-add"><input list={list} maxLength={80} placeholder={placeholder} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} /><button type="button" className="secondary-button" onClick={add}>Add</button></span></label>
    {values.length > 0 && <div className="skill-tags">{values.map(item => <button type="button" className="chip" key={item} aria-label={`Remove ${item}`} onClick={() => onChange(values.filter(other => other !== item))}>{item} ×</button>)}</div>}</div>;
}
export function HuntForm({ initial, skills, latest, configured, credits, deepDefault, activeRun }: { initial: PreferenceRow; skills: string[]; latest: SearchRow | null; configured: boolean; credits: number | null; deepDefault: boolean; activeRun: { id: string; deep: boolean } | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [keywords, setKeywords] = useState(initial.keywords.join(', '));
  const savedFilters = normalizeFilters(initial.filters);
  const [filters, setFilters] = useState<HuntFilters>(savedFilters);
  const set = <K extends keyof HuntFilters>(key: K, next: HuntFilters[K]) => setFilters(old => ({ ...old, [key]: next }));
  const isRemote = /^\s*remote\s*$/i.test(value.location_label);
  const radiusEnabled = value.location_label.trim() !== '' && !isRemote;
  useEffect(() => { try { const guess = ZONES[Intl.DateTimeFormat().resolvedOptions().timeZone]; if (guess) setValue(old => old.location_country_code ? old : { ...old, location_country_code: guess }); } catch { /* no time zone available */ } }, []);
  const clearAll = () => { setValue(initial); setKeywords(initial.keywords.join(', ')); setFilters(savedFilters); setError(''); setMessage('Filters reset to your saved preferences.'); };
  const [deep, setDeep] = useState(deepDefault);
  const DEEP_COST = 2;
  const outOfCredits = credits === 0;
  const cantAffordDeep = credits !== null && credits < DEEP_COST;
  const drawerCount = activeDrawerCount(filters, value.profession);
  const addSkill = (skill: string) => setFilters(old => old.skills.some(item => item.toLowerCase() === skill.toLowerCase()) ? old : { ...old, skills: [...old.skills, skill] });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState('');
  const [counts, setCounts] = useState<{ search: number; fetch: number; agent: number } | null>(latest ? { search: latest.search_count, fetch: latest.fetch_count, agent: latest.agent_count } : null);
  const prefs = () => ({ role: value.role, profession: value.profession, location_label: value.location_label, location_country_code: value.location_country_code, work_mode: value.work_mode, keywords: keywords.split(/[,;\n]/).map(s => s.trim()).filter(Boolean), filters: { ...filters, radiusKm: radiusEnabled ? filters.radiusKm : 0 } });
  async function save() {
    setSaving(true); setError('');
    try { const result = await savePreferences(prefs()); if ('error' in result) { setError(result.error ?? 'Could not save.'); return false; } setMessage('Preferences saved.'); return true; }
    catch { setError('Could not save preferences. Check the database connection.'); return false; }
    finally { setSaving(false); }
  }
  const finish = (next: { counts: typeof counts; found?: number; strict?: number; near?: number; relaxed?: string[]; dropped?: { filter: string; count: number }[] }) => {
    setCounts(next.counts); setStage('done');
    setMessage(next.found === 0 ? (next.dropped?.length ? `Nothing was left after your hard filters: ${next.dropped.map(item => `${item.filter} removed ${item.count}`).join(', ')}. Nothing was widened. Loosen one and run again. This hunt was not charged.` : 'No matching openings were found this time. This hunt was not charged. Try a broader role or location.') : next.near ? `${next.strict ?? 0} strict match${next.strict === 1 ? '' : 'es'} and ${next.near} near match${next.near === 1 ? '' : 'es'} (${(next.relaxed ?? []).join(', ')} relaxed, each one is labelled). Your shortlist is ready.` : 'Your shortlist is ready.');
  };
  const [following,setFollowing]=useState(activeRun?.id??'');
  const completed=useRef(new Set<string>());
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(activeRun && !completed.current.has(activeRun.id)) setFollowing(activeRun.id);},[activeRun?.id]);
  useEffect(()=>{
    if(!following) return;
    const observer=new AbortController();
    setBusy(true);setStage('search');setMessage('Your hunt is running on our servers. You can close this page and return later.');
    followHunt(following,observer.signal,(status:HuntStatus)=>{
      if(status.status==='done') finish(status);
      else if(status.status==='error') {setError(status.error??'The hunt could not finish.');setStage('');setMessage('');}
      else {setStage(status.stage??'search');if(status.progress)setMessage(status.progress);}
    }).catch(error=>{if(!observer.signal.aborted)setError(error instanceof Error?error.message:'Could not follow the hunt.');})
      .finally(()=>{if(!observer.signal.aborted){completed.current.add(following);setFollowing('');setBusy(false);router.refresh();}});
    return()=>observer.abort(); // stop status reads only; never stop a workflow or Agent
  },[following]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run(refresh: boolean) {
    setBusy(true); setError(''); setCounts(null); setStage('search'); setMessage('Searching live careers pages…');
    // One id per click: if the response is lost and we retry, the server returns the first attempt instead of charging again.
    const requestId = crypto.randomUUID();
    try {
      let response: Response;
      try { response = await fetch('/api/hunt', { method: 'POST', keepalive:true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh, form: prefs(), deep, requestId }) }); }
      catch {
        // The request may have reached the server even though the response was lost: ask before giving up.
        for (let attempt = 0; attempt < 4; attempt++) {
          if(!mounted.current)return;
          await observationDelay(1500,new AbortController().signal);
          try {
            const check = await fetch(`/api/hunt?request=${requestId}`, { cache: 'no-store' });
            if (check.ok) { const found = await check.json() as { searchId: string }; if(mounted.current)setFollowing(found.searchId); return; }
          } catch { /* still offline */ }
        }
        throw new Error('The start response was lost. Your hunt may already be queued; reopen your dashboard to check before starting another.');
      }
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? `The server returned ${response.status}. Please try again.`); }
      const started=await response.json() as {searchId:string};
      if(mounted.current){setFollowing(started.searchId);router.refresh();}
    } catch (e) { if(mounted.current){setError(e instanceof Error ? e.message : 'Hunt failed.');setBusy(false);setStage('');setMessage('');router.refresh();} }
  }
  const isFirstTime = !latest && !initial.role;
  return (
    <>
      {isFirstTime && (
        <div className="onboarding-banner" role="region" aria-label="Welcome guide">
          <Sparkles size={22} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h3>Welcome to your workspace!</h3>
            <p>
              Get started by entering your target <strong>Role</strong> below to run your first hunt, or{' '}
              <Link href="/dashboard/resume">upload your resume</Link> to automatically extract your skills.
            </p>
          </div>
        </div>
      )}
      <div className="hunt-workspace">
        <form className="hunt-preferences" onSubmit={e => { e.preventDefault(); void run(false); }}>
          <fieldset disabled={busy || saving}>
            <h2>Your search</h2>
            <label>Role / job title<input required minLength={2} maxLength={120} placeholder="Software engineer" value={value.role} onChange={e => setValue({ ...value, role: e.target.value })} /></label>
            <label>Keywords<input maxLength={2400} placeholder="Python, distributed systems" value={keywords} onChange={e => setKeywords(e.target.value)} /></label>
            <label>Location (city or “Remote”)<input maxLength={180} placeholder="Bengaluru or Remote" value={value.location_label} onChange={e => setValue({ ...value, location_label: e.target.value })} /></label>
            <Pick label="Country" value={value.location_country_code} options={[['', 'Auto from location'], ...COUNTRIES] as [string, string][]} onChange={code => setValue({ ...value, location_country_code: code })} />
            <div className="field-row">
              <Pick label="Work mode" value={value.work_mode} options={[['any', 'Any'], ['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']]} onChange={mode => setValue({ ...value, work_mode: mode as PreferenceRow['work_mode'] })} />
              <label>Radius<select disabled={!radiusEnabled} value={radiusEnabled ? filters.radiusKm : 0} onChange={e => set('radiusKm', Number(e.target.value) as HuntFilters['radiusKm'])}><option value={0}>Any</option><option value={10}>10 km</option><option value={25}>25 km</option><option value={50}>50 km</option></select></label>
            </div>
            <Pick label="Experience" value={filters.experience.band} options={OPTIONS.experience} onChange={band => set('experience', { ...filters.experience, band: band as HuntFilters['experience']['band'] })} />
            {filters.experience.band === 'custom' && <div className="field-row">
              <label>Min years<input type="number" min={0} max={40} value={filters.experience.min ?? ''} onChange={e => set('experience', { ...filters.experience, min: e.target.value === '' ? null : Number(e.target.value) })} /></label>
              <label>Max years<input type="number" min={0} max={40} value={filters.experience.max ?? ''} onChange={e => set('experience', { ...filters.experience, max: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            </div>}
            <div className="field-row">
              <Pick label="Employment type" value={filters.employmentType} options={OPTIONS.employmentType} onChange={type => set('employmentType', type as HuntFilters['employmentType'])} />
              <Pick label="Posted within" value={filters.postedWithin} options={OPTIONS.postedWithin} onChange={window => set('postedWithin', window as HuntFilters['postedWithin'])} />
            </div>
            <details className="more-filters">
              <summary>More filters{drawerCount > 0 ? ` (${drawerCount})` : ''}</summary>
              <div className="more-filters-body">
                <label>Profession<input list="profession-options" maxLength={120} placeholder="Pick one or type your own" value={value.profession} onChange={e => setValue({ ...value, profession: e.target.value })} /></label>
                <Chips label="Skills and tech stack" values={filters.skills} onChange={next => set('skills', next)} list="skill-options" placeholder="Pick a skill or type your own, then Enter" />
                <Pick label="Match skills" value={filters.skillMode} options={[['any', 'Any of them'], ['all', 'All of them']]} onChange={mode => set('skillMode', mode as HuntFilters['skillMode'])} />
                <Pick label="Visa / work authorization" value={filters.visa} options={OPTIONS.visa} onChange={visa => set('visa', visa as HuntFilters['visa'])} />
                <fieldset className="salary-filter"><legend>Salary (empty = not set)</legend>
                  <div className="field-row">
                    <label>Min<input type="number" min={0} value={filters.salary.min ?? ''} onChange={e => set('salary', { ...filters.salary, min: e.target.value === '' ? null : Number(e.target.value) })} /></label>
                    <label>Max<input type="number" min={0} value={filters.salary.max ?? ''} onChange={e => set('salary', { ...filters.salary, max: e.target.value === '' ? null : Number(e.target.value) })} /></label>
                  </div>
                  <div className="field-row">
                    <Pick label="Currency" value={filters.salary.currency} options={['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'SGD'].map(code => [code, code] as [string, string])} onChange={currency => set('salary', { ...filters.salary, currency })} />
                    <Pick label="Period" value={filters.salary.period} options={[['hourly', 'Hourly'], ['monthly', 'Monthly'], ['annual', 'Annual']]} onChange={period => set('salary', { ...filters.salary, period: period as HuntFilters['salary']['period'] })} />
                  </div>
                </fieldset>
                <Chips label="Include companies" values={filters.companiesInclude} onChange={next => set('companiesInclude', next)} placeholder="Company name, then Enter" />
                <Chips label="Exclude companies" values={filters.companiesExclude} onChange={next => set('companiesExclude', next)} placeholder="Company name, then Enter" />
                <Chips label="Exclude keywords" values={filters.excludeKeywords} onChange={next => set('excludeKeywords', next)} placeholder="e.g. clearance, unpaid" />
                <div className="field-row">
                  <Pick label="Company size" value={filters.companySize} options={OPTIONS.companySize} onChange={v => set('companySize', v as HuntFilters['companySize'])} />
                  <Pick label="Company stage" value={filters.companyStage} options={OPTIONS.companyStage} onChange={v => set('companyStage', v as HuntFilters['companyStage'])} />
                </div>
                <div className="field-row">
                  <Pick label="Industry" value={filters.industry} options={OPTIONS.industry} onChange={v => set('industry', v as HuntFilters['industry'])} />
                  <Pick label="Department" value={filters.department} options={OPTIONS.department} onChange={v => set('department', v as HuntFilters['department'])} />
                </div>
                <fieldset className="check-group"><legend>Benefits (only when the page states them)</legend>{OPTIONS.benefits.map(([id, name]) => <label key={id} className="check"><input type="checkbox" checked={filters.benefits.includes(id)} onChange={e => set('benefits', e.target.checked ? [...filters.benefits, id] : filters.benefits.filter(item => item !== id))} />{name}</label>)}</fieldset>
                <fieldset className="check-group"><legend>Job source</legend>{OPTIONS.sources.map(([id, name]) => <label key={id} className="check"><input type="checkbox" checked={filters.sources.includes(id)} onChange={e => { const next = e.target.checked ? [...filters.sources, id] : filters.sources.filter(item => item !== id); if (next.length) set('sources', next); }} />{name}</label>)}</fieldset>
                <div className="field-row">
                  <Pick label="Your education" value={filters.education} options={OPTIONS.education} onChange={v => set('education', v as HuntFilters['education'])} />
                  <Pick label="Posting language" value={filters.language} options={OPTIONS.language} onChange={v => set('language', v as HuntFilters['language'])} />
                </div>
              </div>
            </details>
            <datalist id="profession-options">{PROFESSIONS.map(item => <option key={item} value={item} />)}</datalist>
            <datalist id="skill-options">{[...new Set([...skills, ...SKILLS])].map(item => <option key={item} value={item} />)}</datalist>
            <p className="field-hint">Hard filters remove listings. Skills, salary, visa and company filters only change the ranking. Unknown stays unknown.</p>
            <div className="deep-toggle">
              <label className="deep-label"><input type="checkbox" checked={deep} onChange={e => setDeep(e.target.checked)} />Deep Search</label>
              <p className="field-hint">{credits === null ? 'Free with your own key.' : `${DEEP_COST} credits per run.`} Reads more pages, uses more agents and opens job details for an accurate match score. Runs in the background on our servers, so you can leave this page.</p>
              {deep && cantAffordDeep && <p className="field-hint">You need {DEEP_COST} credits. <Link href="/credits">Get more</Link>.</p>}
            </div>
            <div className="form-buttons">
              <button type="button" className="secondary-button" onClick={() => void save()}>Save preferences</button>
              <button type="button" className="secondary-button" onClick={clearAll}>Clear all</button>
              <button className="primary-button" disabled={!configured || outOfCredits || (deep && cantAffordDeep) || value.role.trim().length < 2}><Search size={16} />{deep ? 'Run Deep Search' : 'Run hunt'}</button>
            </div>
            {value.role.trim().length < 2 && (
              <p className="field-hint">
                Enter a target role above (at least 2 characters) to enable &ldquo;Run hunt&rdquo;.
              </p>
            )}
          </fieldset>
        </form>
        <section className="hunt-status">
          <div className="status-current">
            <span className="empty-icon"><Sparkles size={28} /></span>
            <h2>{stage === 'done' ? 'Your shortlist is ready.' : 'Less refreshing. More possibility.'}</h2>
            <p>Company careers, Greenhouse, Lever, Ashby and public boards. Every hunt records its sources and actual endpoint usage.</p>
          </div>
          {skills.length > 0 && (
            <div className="resume-hints">
              <strong>From your resume</strong>
              <div>{skills.slice(0,10).map(skill => <button type="button" key={skill} onClick={() => addSkill(skill)}>{skill} +</button>)}</div>
              <p>These skills already boost relevant listings. Click one to add it to your Skills filter.</p>
            </div>
          )}
          {message && <div className="hunt-progress" role="status">{busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}<span>{message}</span></div>}
          {busy && <div className="hunt-step-line">{['search','fetch','agent','rank'].map(step => <span className={stage === step ? 'current' : ''} key={step}>{step === 'search' ? 'Searching' : step === 'fetch' ? 'Fetching' : step === 'agent' ? 'Agent if needed' : 'Ranking'}</span>)}</div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {outOfCredits && <p className="connection-note" role="alert">You’re out of credits. <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">Message @{TELEGRAM_HANDLE} on Telegram</a> for more, or <Link href="/credits">add your own TinyFish key</Link>.</p>}
          {credits !== null && credits > 0 && <p className="field-hint">{credits} credit{credits === 1 ? '' : 's'} left · <Link href="/credits">Credits</Link></p>}
          {!configured && <p className="connection-note">Set TINYFISH_API_KEY in apps/web/.env.local to run a live hunt.</p>}
          {counts && (
            <div className="completed-hunt">
              <p>{counts.search} searches · {counts.fetch} fetches · {counts.agent} Agent runs</p>
              <Link className="primary-button" href="/dashboard/listings">View shortlist</Link>
              <button className="secondary-button" disabled={busy || !configured || outOfCredits} onClick={() => void run(true)}><RefreshCw size={14} />Refresh live</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
