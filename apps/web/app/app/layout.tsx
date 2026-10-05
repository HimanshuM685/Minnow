import Link from 'next/link';
import { ensureProfile } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureProfile(user.id, user.name);
  return <div className="page-width signed-shell"><aside className="app-navigation"><div><span className="live-dot" />Your workspace</div><Link href="/app">Hunt</Link><Link href="/app/listings">Shortlist</Link><Link href="/app/resume">Resume</Link><Link href="/app/settings">Settings</Link><small>{user.email}</small></aside><main className="app-content">{children}</main></div>;
}
