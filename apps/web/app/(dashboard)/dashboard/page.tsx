import { getPreferences, getResume, getWallet, latestSearch } from '@minnow/db';
import type { PreferenceRow } from '@minnow/db/types';
import { requireUser } from '@/lib/auth/session';
import { HuntForm } from '@/components/hunt-form';
import { resumeSkills } from '@/lib/resume';
const blank = (user_id: string): PreferenceRow => ({ user_id, role: '', profession: '', location_label: '', location_country_code: '', seniority: 'any', work_mode: 'any', visa: 'any', keywords: [], updated_at: '' });
export const dynamic = 'force-dynamic';
export default async function HuntPage() {
  const user = await requireUser();
  const [preferences, resume, latest, wallet] = await Promise.all([getPreferences(user.id), getResume(user.id), latestSearch(user.id), getWallet(user.id)]);
  return <><div className="page-heading"><h1>Your next current starts here.</h1><p>Set your preferences. Minnow checks live careers pages and brings back the ones that fit.</p></div><HuntForm initial={preferences ?? blank(user.id)} skills={resume ? resumeSkills(resume.extracted_text) : []} latest={latest} configured={Boolean(wallet?.tinyfish_key || process.env.TINYFISH_API_KEY)} credits={wallet?.tinyfish_key ? null : wallet?.credits ?? 0} /></>;
}
