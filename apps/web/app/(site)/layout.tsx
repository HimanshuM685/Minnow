import Link from 'next/link';
import { Fish } from '@/components/brand';
import { SiteHeader } from '@/components/site-header';
import { getUser } from '@/lib/auth/session';
import { signOut } from '@/app/auth/actions';
import '../product.css';
import '../globals.css';

export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <>
      <SiteHeader user={user ? user.name || user.email : null} signOut={signOut} />
      {children}
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
