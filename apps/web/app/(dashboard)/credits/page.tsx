import Link from 'next/link';
import { DEEP_SEARCH_COST, FREE_CREDITS } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { currentWallet } from '@/lib/wallet';
import { TELEGRAM_HANDLE, TELEGRAM_URL, TINYFISH_SIGNUP_URL } from '@/lib/links';
import { TinyfishKeyForm } from '@/components/tinyfish-key-form';
export const dynamic = 'force-dynamic';
const external = { target: '_blank', rel: 'noopener noreferrer' } as const;
export default async function CreditsPage() {
  const user = await requireUser();
  const { credits, hasKey } = await currentWallet(user);
  return <>
    <div className="page-heading">
      <h1>{credits > 0 || hasKey ? 'You have credits.' : 'You’re out of credits.'}</h1>
      <p>{hasKey ? 'Your own TinyFish key is saved, so hunts are unmetered.' : `Each live hunt uses one credit; Deep Search uses ${DEEP_SEARCH_COST}. Replaying a cached hunt is free.`}</p>
    </div>

    <div className="credit-grid">
      <section className="content-card featured">
        <span className="badge">Your balance</span>
        <p className="credit-balance">{hasKey ? '∞' : credits}</p>
        <p>{hasKey ? 'hunts with your own key' : `of ${FREE_CREDITS} free hunts left`}</p>
      </section>
      <section className="content-card">
        <span className="badge">Deep Search</span>
        <h2>Find more, match better</h2>
        <p>{hasKey ? 'Free with your own key.' : `${DEEP_SEARCH_COST} credits per run.`} Reads more pages, uses more agents and opens each job’s details so your match score is accurate. It runs in the background on our servers: start it, close the tab, and the shortlist is waiting when you come back.</p>
        <Link className="primary-button" href="/dashboard?deep=1">Try Deep Search</Link>
      </section>
      <section className="content-card">
        <h2>Need more credits?</h2>
        <p>Message <a href={TELEGRAM_URL} {...external}>@{TELEGRAM_HANDLE} on Telegram</a> and credits are added to your account.</p>
        <a className="secondary-button" href={TELEGRAM_URL} {...external}>Open Telegram</a>
      </section>
    </div>

    <section className="content-card" id="key">
      <span className="badge">1 · Bring your own key</span>
      <h2>Paste your TinyFish API key</h2>
      <p>Your hunts run on your own TinyFish account instead of credits. The key is stored on the server and never shown again.</p>
      <ol className="setup-steps">
        <li>Create a TinyFish account (free to start).</li>
        <li>Copy your API key from your TinyFish dashboard.</li>
        <li>Paste it below and save.</li>
      </ol>
      <TinyfishKeyForm hasKey={hasKey} />
      <p className="field-hint">No TinyFish account yet? <a href={TINYFISH_SIGNUP_URL} {...external}>Create one with our signup link</a>.</p>
    </section>

    <section className="content-card" id="buy">
      <span className="badge">2 · More API credits</span>
      <h2>Buy TinyFish credits for better searches</h2>
      <p>More API credits mean more search volume, more pages read and more agent runs per hunt. Sign up (or log in) on TinyFish, top up there, then paste your key above.</p>
      <a className="primary-button" href={TINYFISH_SIGNUP_URL} {...external}>Get TinyFish API credits</a>
    </section>
  </>;
}
