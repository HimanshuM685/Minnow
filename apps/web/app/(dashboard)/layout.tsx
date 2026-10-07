import { Suspense } from 'react';
import Link from 'next/link';
import { currentWallet } from '@/lib/wallet';
import { requireUser } from '@/lib/auth/session';
import { signOut } from '@/app/auth/actions';
import { AppSidebar } from '@/components/app-sidebar';
import { Fish } from '@/components/brand';
import Loading from './loading';
import '../product.css';
import '../globals.css';

// Dashboard shell: its own header and sidebar, separate from the marketing layout in (site).
async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const wallet = await currentWallet(user);
  return <>
    <header className="site-header solid">
      <div className="header-inner">
        <Link href="/dashboard" className="wordmark"><span className="brand-mark"><Fish /></span><span>minnow<span className="brand-dot">.</span></span></Link>
        <div className="public-nav">
          <Link href="/credits" className="nav-credits">Credits · {wallet.hasKey ? 'own key' : wallet.credits}</Link>
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="page-width"><Loading /></div>}><Shell>{children}</Shell></Suspense>;
}
