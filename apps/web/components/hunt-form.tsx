'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search, RefreshCw, LoaderCircle, Check, Sparkles } from 'lucide-react';
import type { PreferenceRow, SearchRow } from '@minnow/db/types';
import { readSSE } from '@minnow/core/sse';
import { PROFESSIONS, SKILLS } from '@/lib/suggestions';
import { savePreferences } from '@/app/(dashboard)/dashboard/actions';
export function HuntForm({ initial, skills, latest, configured, credits }: { initial: PreferenceRow; skills: string[]; latest: SearchRow | null; configured: boolean; credits: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [keywords, setKeywords] = useState(initial.keywords.join(', '));
  const [skillDraft, setSkillDraft] = useState('');
  const outOfCredits = credits === 0;
  const addSkill = (skill: string) => { const clean = skill.trim(); if (clean) setKeywords(old => [...new Set([...old.split(',').map(s => s.trim()).filter(Boolean), clean])].join(', ')); setSkillDraft(''); };
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState('');
  const [counts, setCounts] = useState<{ search: number; fetch: number; agent: number } | null>(latest ? { search: latest.search_count, fetch: latest.fetch_count, agent: latest.agent_count } : null);
  const prefs = () => ({ ...value, keywords: keywords.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) });
  async function save() {
    setSaving(true); setError('');
    try { const result = await savePreferences(prefs()); if ('error' in result) { setError(result.error ?? 'Could not save.'); return false; } setMessage('Preferences saved.'); return true; }
    catch { setError('Could not save preferences. Check the database connection.'); return false; }
    finally { setSaving(false); }
  }
  async function run(refresh: boolean) {
    if (!await save()) return;
    setBusy(true); setError(''); setCounts(null); setStage('search'); setMessage('Searching live careers pages…');
    try {
      const response = await fetch('/api/hunt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh }) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error ?? 'Hunt failed.'); }
      if (!response.body) throw new Error('No progress stream received.');
      let done = false;
      for await (const raw of readSSE(response.body)) {
        const event = raw as { type: string; stage?: string; message?: string; counts?: typeof counts; searchId?: string };
        if (event.type === 'progress') { setStage(event.stage ?? ''); setMessage(event.message ?? ''); }
        if (event.type === 'error') throw new Error(event.message ?? 'The hunt could not finish.');
        if (event.type === 'complete') { done = true; setCounts(event.counts ?? null); setStage('done'); setMessage('Your shortlist is ready.'); router.refresh(); break; }
      }
      if (!done) throw new Error('The stream ended early. Your trace was retained; retry the hunt.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Hunt failed.'); }
    finally { setBusy(false); }
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
            <label>Role<input required minLength={2} maxLength={120} placeholder="Software engineer" value={value.role} onChange={e => setValue({ ...value, role: e.target.value })} /></label>
            <label>Profession<input list="profession-options" maxLength={120} placeholder="Pick one or type your own" value={value.profession} onChange={e => setValue({ ...value, profession: e.target.value })} /></label>
            <label>Location<input maxLength={180} placeholder="Bengaluru or Remote" value={value.location_label} onChange={e => setValue({ ...value, location_label: e.target.value })} /></label>
            <label>Country / search region<select value={value.location_country_code} onChange={e => setValue({ ...value, location_country_code: e.target.value })}><option value="">Auto from location</option>{[['IN','India'],['US','United States'],['GB','United Kingdom'],['CA','Canada'],['DE','Germany'],['FR','France'],['SG','Singapore'],['AU','Australia']].map(([code,name]) => <option key={code} value={code}>{name}</option>)}</select></label>
            <div className="field-row">
              <label>Experience<select value={value.seniority} onChange={e => setValue({ ...value, seniority: e.target.value as PreferenceRow['seniority'] })}><option value="any">Any</option><option value="intern">Internship</option><option value="new_grad">New grad</option><option value="mid">Mid-level</option></select></label>
              <label>Work mode<select value={value.work_mode} onChange={e => setValue({ ...value, work_mode: e.target.value as PreferenceRow['work_mode'] })}><option value="any">Any</option><option value="onsite">Onsite</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label>
            </div>
            <label>Visa<select value={value.visa} onChange={e => setValue({ ...value, visa: e.target.value as PreferenceRow['visa'] })}><option value="any">No preference</option><option value="needs_sponsorship">Needs sponsorship</option><option value="no">No sponsorship needed</option></select></label>
            <label>Skills<span className="skill-add"><input list="skill-options" maxLength={80} placeholder="Pick a skill or type your own, then Enter" value={skillDraft} onChange={e => setSkillDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillDraft); } }} /><button type="button" className="secondary-button" onClick={() => addSkill(skillDraft)}>Add</button></span></label>
            <datalist id="profession-options">{PROFESSIONS.map(item => <option key={item} value={item} />)}</datalist>
            <datalist id="skill-options">{[...new Set([...skills, ...SKILLS])].map(item => <option key={item} value={item} />)}</datalist>
            <label>Keywords<input maxLength={2400} placeholder="Python, distributed systems" value={keywords} onChange={e => setKeywords(e.target.value)} /></label>
            <p className="field-hint">Visa and skills rank results. Unknown sponsorship remains clearly marked.</p>
            <div className="form-buttons">
              <button type="button" className="secondary-button" onClick={() => void save()}>Save preferences</button>
              <button className="primary-button" disabled={!configured || outOfCredits || value.role.trim().length < 2}><Search size={16} />Run hunt</button>
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
              <div>{skills.slice(0,10).map(skill => <button type="button" key={skill} onClick={() => setKeywords(old => [...new Set([...old.split(',').map(s => s.trim()).filter(Boolean),skill])].join(', '))}>{skill} +</button>)}</div>
              <p>These skills already boost relevant listings. Add one as an explicit keyword if you like.</p>
            </div>
          )}
          {message && <div className="hunt-progress" role="status">{busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}<span>{message}</span></div>}
          {busy && <div className="hunt-step-line">{['search','fetch','agent','rank'].map(step => <span className={stage === step ? 'current' : ''} key={step}>{step === 'search' ? 'Searching' : step === 'fetch' ? 'Fetching' : step === 'agent' ? 'Agent if needed' : 'Ranking'}</span>)}</div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {outOfCredits && <p className="connection-note" role="alert">You’re out of credits. <a href="https://t.me/HimanshuM685" target="_blank" rel="noopener noreferrer">Message @HimanshuM685 on Telegram</a> for more, or <Link href="/credits">add your own TinyFish key</Link>.</p>}
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

