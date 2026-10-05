import type { Metadata, Viewport } from 'next';
export const metadata: Metadata = { title: 'Minnow — Live openings, matched to you', description: 'Live jobs and internships, discovered with TinyFish and matched to your preferences.', icons: { icon: '/minnow.svg' } };
export const viewport: Viewport = { colorScheme: 'light dark' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
