'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { saveTinyfishKey } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';

const key = z.string().trim().min(20, 'That does not look like a TinyFish API key.').max(200);
export async function setTinyfishKey(_state: { error?: string; ok?: string } | null, form: FormData) {
  const user = await requireUser();
  const busy='Your hunt is using this key. Wait for it to finish before changing or removing it.';
  if (form.get('remove') === '1') { if(!await saveTinyfishKey(user.id, null)) return {error:busy}; revalidatePath('/credits'); return { ok: 'Your key was removed.' }; }
  const parsed = key.safeParse(form.get('key'));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if(!await saveTinyfishKey(user.id, parsed.data)) return {error:busy};
  revalidatePath('/credits');
  return { ok: 'Key saved. Your hunts now use it and do not spend credits.' };
}
