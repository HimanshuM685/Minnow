import { ensureProfile } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { AppSidebar } from '@/components/app-sidebar';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureProfile(user.id, user.name);
  return (
    <div className="page-width signed-shell">
      <AppSidebar email={user.email} />
      <main className="app-content" id="main">{children}</main>
    </div>
  );
}

