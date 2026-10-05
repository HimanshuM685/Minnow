import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { signOut } from '../auth/actions';
export const dynamic = 'force-dynamic';
export default async function PanelLayout({ children }: { children: React.ReactNode }) { const user = await requireAdmin(); return <div className="observatory-shell"><aside className="panel-sidebar"><Link className="observatory-brand" href="/">minnow<span>Observatory</span></Link><div className="operator"><i />Operator online</div><nav>{[['/','Overview'],['/hunts','Hunts'],['/listings','Listings'],['/sources','Sources'],['/people','People'],['/trace','Trace']].map(([href,title]) => <Link href={href} key={href}>{title}</Link>)}</nav><div className="operator-account"><span>{user.email}</span><form action={signOut}><button>Sign out</button></form></div></aside><main className="panel-main"><div className="panel-topline"><span>Stored telemetry only</span><span>Neon Postgres / public</span></div>{children}</main></div>; }
