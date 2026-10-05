import Link from 'next/link';
import { ensureProfile, getWallet } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { signOut } from '@/app/auth/actions';
import { AppSidebar } from '@/components/app-sidebar';
import { Fish } from '@/components/brand';
import '../product.css';
import '../globals.css';
export const dynamic = 'force-dynamic';

// Dashboard shell: its own header and sidebar, separate from the marketing layout in (site).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureProfile(user.id, user.name);
  const wallet = await getWallet(user.id);
  return <>
    <header className="site-header">
      <div className="header-inner">
        <Link href="/dashboard" className="wordmark"><span className="brand-mark"><Fish /></span><span>minnow<span className="brand-dot">.</span></span></Link>
        <div className="public-nav">
          <Link href="/credits">Credits · {wallet?.tinyfish_key ? 'own key' : wallet?.credits ?? 0}</Link>
          <Link href="/dashboard/settings" className="nav-user-email" title="Settings">{user.name || user.email}</Link>
          <form action={signOut} className="nav-signout-form"><button type="submit" className="nav-signout-btn">Sign out</button></form>
        </div>
      </div>
    </header>
    <div className="page-width signed-shell">
      <AppSidebar email={user.email} />
      <main className="app-content" id="main">{children}</main>
    </div>
  </>;
}
