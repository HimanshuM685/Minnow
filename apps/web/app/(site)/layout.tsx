import Link from 'next/link';
import { Fish } from '@/components/brand';
import { auth } from '@/lib/auth/server';
import { signOut } from '@/app/auth/actions';
import '../product.css';
import '../globals.css';

export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  try {
    const { data: session } = await auth.getSession();
    user = session?.user ?? null;
  } catch {
    user = null;
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="wordmark">
            <span className="brand-mark"><Fish /></span>
            <span>minnow<span className="brand-dot">.</span></span>
          </Link>
          <div className="public-nav">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/credits">Credits</Link>
            {user ? (
              <>
                <Link href="/dashboard/settings" className="nav-user-email" title="Go to settings">
                  {user.name || user.email}
                </Link>
                <form action={signOut} className="nav-signout-form">
                  <button type="submit" className="nav-signout-btn">Sign out</button>
                </form>
              </>
            ) : (
              <Link href="/auth/sign-in">Sign in</Link>
            )}
          </div>
        </div>
      </header>
      {children}
      <footer className="site-footer page-width">
        <span><Fish small />Small fish. Big possibilities.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="https://tinyfish.ai" target="_blank" rel="noopener noreferrer">Powered by TinyFish</a>
        </div>
      </footer>
    </>
  );
}
