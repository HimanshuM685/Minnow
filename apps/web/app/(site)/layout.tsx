import { Suspense } from 'react';
import Link from 'next/link';
import { Fish } from '@/components/brand';
import { SiteHeader } from '@/components/site-header';
import { getUser } from '@/lib/auth/session';
import { signOut } from '@/app/auth/actions';
import '../product.css';
import '../globals.css';


// Session lookup is the only request-time work here, so it streams in behind a signed-out header
// and the rest of the site layout prerenders.
async function Header() {
  const user = await getUser();
  return <SiteHeader user={user ? user.name || user.email : null} signOut={signOut} />;
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<SiteHeader user={null} signOut={signOut} />}><Header /></Suspense>
      <Suspense>{children}</Suspense>
      <footer className="site-footer page-width">
        <span><Fish small />Small fish. Big possibilities.</span>
        <div>
          <Link href="/credits">Credits</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="https://tinyfish.ai" target="_blank" rel="noopener noreferrer">Powered by TinyFish</a>
        </div>
      </footer>
    </>
  );
}
