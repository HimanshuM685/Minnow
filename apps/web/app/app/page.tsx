import { ensureProfile, getPreferences, getResume, latestSearch } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { HuntForm } from '@/components/hunt-form';
import { resumeSkills } from '@/lib/resume';
export const dynamic = 'force-dynamic';
export default async function HuntPage() {
  const user = await requireUser();
  await ensureProfile(user.id,user.name);
  const [preferences, resume, latest] = await Promise.all([getPreferences(user.id), getResume(user.id), latestSearch(user.id)]);
  return <><div className="page-heading"><h1>Your next current starts here.</h1><p>Set your preferences. Minnow checks live careers pages and brings back the ones that fit.</p></div><HuntForm initial={preferences!} skills={resume ? resumeSkills(resume.extracted_text) : []} latest={latest} configured={Boolean(process.env.TINYFISH_API_KEY)} /></>;
}
