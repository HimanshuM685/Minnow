import Link from 'next/link';
export default function Forbidden() { return <main className="auth-page"><div className="auth-card"><h1>403 · Access denied</h1><p>Your account email is not in the admin allowlist.</p><Link href="/dashboard/settings">Open Settings to sign out or change accounts</Link></div></main>; }
