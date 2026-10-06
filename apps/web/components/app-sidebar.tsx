'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', label: 'Hunt', exact: true },
    { href: '/dashboard/listings', label: 'Shortlist', exact: false },
    { href: '/dashboard/searches', label: 'Searches', exact: false },
    { href: '/dashboard/resume', label: 'Resume', exact: false },
    { href: '/credits', label: 'Credits', exact: false },
    { href: '/dashboard/settings', label: 'Settings', exact: false },
  ];

  return (
    <aside className="app-navigation">
      <div>
        <span className="live-dot" />
        Your workspace
      </div>
      {navItems.map(({ href, label, exact }) => {
        const isActive = exact
          ? pathname === href
          : pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={isActive ? 'active' : ''}
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
      <small>{email}</small>
    </aside>
  );
}
