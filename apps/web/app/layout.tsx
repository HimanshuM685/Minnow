import type { Metadata } from 'next';
import Link from 'next/link';
import { Fish } from '@/components/brand';
import './product.css';
import './globals.css';
export const metadata: Metadata = { title: 'Minnow — Live openings, matched to you', description: 'Live jobs and internships, discovered with TinyFish and matched to your preferences.', icons: { icon: '/minnow.svg' } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet" /></head><body><header className="site-header"><div className="header-inner"><Link href="/" className="wordmark"><span className="brand-mark"><Fish /></span><span>minnow<span className="brand-dot">.</span></span></Link><div className="public-nav"><Link href="/app">Your hunt</Link><Link href="/auth/sign-in">Sign in</Link></div></div></header>{children}<footer className="site-footer page-width"><span><Fish small />Small fish. Big possibilities.</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><span>Powered by TinyFish</span></div></footer></body></html>;
}
