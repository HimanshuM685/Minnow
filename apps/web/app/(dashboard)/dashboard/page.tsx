import { getPreferences, getResume, latestSearch } from '@minnow/db';
import { currentWallet } from '@/lib/wallet';
import type { PreferenceRow } from '@minnow/db/types';
import { requireUser } from '@/lib/auth/session';
import { HuntForm } from '@/components/hunt-form';
import { resumeSkills } from '@/lib/resume';
const blank = (user_id: string): PreferenceRow => ({ user_id, role: '', profession: '', location_label: '', location_country_code: '', seniority: 'any', work_mode: 'any', visa: 'any', keywords: [], filters: {}, updated_at: '' });
export const dynamic = 'force-dynamic';
export default async function HuntPage() {
  const user = await requireUser();
  const [wallet, preferences, resume, latest] = await Promise.all([currentWallet(user), getPreferences(user.id), getResume(user.id), latestSearch(user.id)]);
  return <><div className="page-heading"><h1>Your next current starts here.</h1><p>Set your preferences. Minnow checks live careers pages and brings back the ones that fit.</p></div><HuntForm initial={preferences ?? blank(user.id)} skills={resume ? resumeSkills(resume.extracted_text) : []} latest={latest} configured={Boolean(wallet.hasKey || process.env.TINYFISH_API_KEY)} credits={wallet.hasKey ? null : wallet.credits} /></>;
}
