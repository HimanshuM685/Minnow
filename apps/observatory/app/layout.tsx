import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Minnow Observatory', robots: { index: false, follow: false } };
export default function Root({ children }: { children: React.ReactNode }) { return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&family=Sora:wght@400;500;600&display=swap" rel="stylesheet" /></head><body>{children}</body></html>; }
