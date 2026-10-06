import { getPreferences, getResume, getSearch, latestSearch, runningSearch } from '@minnow/db';
import { currentWallet } from '@/lib/wallet';
import type { PreferenceRow } from '@minnow/db/types';
import { requireUser } from '@/lib/auth/session';
import { HuntForm } from '@/components/hunt-form';
import { resumeSkills } from '@/lib/resume';
const blank = (user_id: string): PreferenceRow => ({ user_id, role: '', profession: '', location_label: '', location_country_code: '', seniority: 'any', work_mode: 'any', visa: 'any', keywords: [], filters: {}, updated_at: '' });
export const dynamic = 'force-dynamic';
export default async function HuntPage({ searchParams }: { searchParams: Promise<{ deep?: string; from?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const [wallet, preferences, resume, latest, active, past] = await Promise.all([currentWallet(user), getPreferences(user.id), getResume(user.id), latestSearch(user.id), runningSearch(user.id), /^[0-9a-f-]{36}$/i.test(params.from ?? '') ? getSearch(params.from!, user.id) : null]);
  // "Run again": start from the exact settings a past search stored.
  const snap = past?.preference_snapshot as Record<string, any> | undefined;
  const loaded: PreferenceRow | null = snap ? { ...blank(user.id), role: String(snap.role ?? ''), profession: String(snap.profession ?? ''), location_label: String(snap.location_label ?? ''), location_country_code: String(snap.location_country_code ?? ''), work_mode: snap.work_mode ?? 'any', keywords: Array.isArray(snap.keywords) ? snap.keywords : [], filters: snap.filters ?? {} } : null;
  return <><div className="page-heading"><h1>Your next current starts here.</h1><p>Set your preferences. Minnow checks live careers pages and brings back the ones that fit.</p></div>{past && <p className="run-banner">Loaded from your search “{String(snap?.role ?? '')}” on {new Date(past.created_at).toLocaleDateString()}. Change anything, then run it.</p>}<HuntForm key={past?.id ?? 'saved'} initial={loaded ?? preferences ?? blank(user.id)} skills={resume ? resumeSkills(resume.extracted_text) : []} latest={latest} configured={Boolean(wallet.hasKey || process.env.TINYFISH_API_KEY)} credits={wallet.hasKey ? null : wallet.credits} deepDefault={params.deep === '1'} activeRun={active ? { id: active.id, deep: active.deep } : null} /></>;
}
