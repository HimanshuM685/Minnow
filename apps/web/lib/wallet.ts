import 'server-only';
import { cache } from 'react';
import { ensureProfile, getWallet } from '@minnow/db';

// The one place the UI reads a balance. Pages and layouts render in parallel, so each must create the
// profile + wallet itself; a missing wallet row must never be shown as "0 credits".
// cache() shares one load between the layout and the page of the same request.
const load = cache(async (id: string, name: string) => {
  await ensureProfile(id, name);
  const wallet = await getWallet(id);
  if (!wallet) throw new Error('Wallet could not be loaded.');
  return { credits: wallet.credits, hasKey: Boolean(wallet.tinyfish_key) };
});
export const currentWallet = (user: { id: string; name: string }) => load(user.id, user.name);
