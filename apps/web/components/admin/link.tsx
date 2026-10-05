import Link from 'next/link';
export default function AdminLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href.startsWith('/admin') ? href : `/admin${href === '/' ? '' : href}`} prefetch={false} className={className}>{children}</Link>;
}
