'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Fish } from './brand';

// Transparent over the hero; frosted with a border once the page scrolls.
export function SiteHeader({ user, signOut }: { user: string | null; signOut: () => Promise<void> }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <header className={`site-header${scrolled ? ' scrolled' : ''}`}>
    <div className="header-inner">
      <Link href="/" className="wordmark"><span className="brand-mark"><Fish /></span><span>minnow<span className="brand-dot">.</span></span></Link>
      <nav className="public-nav" aria-label="Main">
        <Link href="/#how">How it works</Link>
        <Link href="/credits" className="nav-credits">Credits</Link>
        <Link href="/dashboard">Dashboard</Link>
        {user ? <>
          <Link href="/dashboard/settings" className="nav-user-email" title="Settings">{user}</Link>
          <form action={signOut} className="nav-signout-form"><button type="submit" className="nav-signout-btn">Sign out</button></form>
        </> : <Link href="/auth/sign-in" className="nav-cta">Sign in</Link>}
      </nav>
    </div>
  </header>;
}
