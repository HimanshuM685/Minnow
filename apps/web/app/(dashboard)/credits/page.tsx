import { FREE_CREDITS, getWallet } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { TinyfishKeyForm } from '@/components/tinyfish-key-form';
export const dynamic = 'force-dynamic';
const TELEGRAM = 'HimanshuM685';
export default async function CreditsPage() {
  const user = await requireUser();
  const wallet = await getWallet(user.id);
  const credits = wallet?.credits ?? 0;
  const hasKey = Boolean(wallet?.tinyfish_key);
  return <>
    <div className="page-heading">
      <h1>{credits > 0 || hasKey ? 'You have credits.' : 'You’re out of credits.'}</h1>
      <p>{hasKey ? 'Your own TinyFish key is saved, so hunts are unmetered.' : `Each live hunt uses one credit; replaying a cached hunt is free.`}</p>
    </div>
    <div className="credit-grid">
      <section className="content-card featured">
        <span className="badge">Your balance</span>
        <p className="credit-balance">{hasKey ? '∞' : credits}</p>
        <p>{hasKey ? 'hunts with your own key' : `of ${FREE_CREDITS} free hunts left`}</p>
      </section>
      <section className="content-card">
        <h2>Need more?</h2>
        <p>Message <a href={`https://t.me/${TELEGRAM}`} target="_blank" rel="noopener noreferrer">@{TELEGRAM} on Telegram</a> and I’ll add credits to your account.</p>
        <a className="secondary-button" href={`https://t.me/${TELEGRAM}`} target="_blank" rel="noopener noreferrer">Open Telegram</a>
      </section>
      <section className="content-card">
        <h2>Bring your own key</h2>
        <p>Get a key at <a href="https://agent.tinyfish.ai/api-keys" target="_blank" rel="noopener noreferrer">agent.tinyfish.ai</a>. It’s stored on the server, never shown again, and used instead of credits.</p>
        <TinyfishKeyForm hasKey={hasKey} />
      </section>
    </div>
  </>;
}
