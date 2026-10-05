import 'server-only';
import { ensureProfile, getWallet, reconcileStaleSearches } from '@minnow/db';

// The one place the UI reads a balance. Pages and layouts render in parallel, so each must create the
// profile + wallet itself; a missing wallet row must never be shown as "0 credits".
export async function currentWallet(user: { id: string; name: string }) {
  await ensureProfile(user.id, user.name);
  await reconcileStaleSearches(user.id);
  const wallet = await getWallet(user.id);
  if (!wallet) throw new Error('Wallet could not be loaded.');
  return { credits: wallet.credits, hasKey: Boolean(wallet.tinyfish_key) };
}
