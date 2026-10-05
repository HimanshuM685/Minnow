import { getProfile } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { saveProfile } from '../actions';
import { signOut } from '@/app/auth/actions';
export const dynamic = 'force-dynamic';
export default async function SettingsPage() { const user = await requireUser(); const profile = await getProfile(user.id); return <><div className="page-heading"><h1>Your settings</h1><p>Your profile belongs to you.</p></div><form action={saveProfile} className="content-card settings-form"><label>Name<input name="name" required maxLength={120} defaultValue={profile?.display_name ?? user.name} /></label><label>Profession<input name="profession" maxLength={120} defaultValue={profile?.profession} /></label><label>Headline<input name="headline" maxLength={250} defaultValue={profile?.headline} /></label><p className="field-hint">Account email: {user.email}</p><button className="primary-button">Save settings</button></form><form action={signOut} className="signout-form"><button className="secondary-button">Sign out</button></form></>; }
