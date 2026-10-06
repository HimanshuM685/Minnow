'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { savePreferences as storePreferences, updateProfile } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { huntInputSchema, toRow } from '@/lib/hunt-input';
export async function savePreferences(value: unknown) {
  const user = await requireUser();
  const parsed = huntInputSchema.safeParse(value);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // No revalidation: the form already holds these values, and every other page reads fresh data itself.
  await storePreferences(user.id, toRow(parsed.data));
  return { ok: true };
}
export type ProfileActionResult = { ok?: boolean; error?: string };

export async function saveProfile(
  prevStateOrForm?: FormData | ProfileActionResult | unknown,
  maybeFormData?: FormData
): Promise<ProfileActionResult> {
  const form = maybeFormData instanceof FormData ? maybeFormData : (prevStateOrForm instanceof FormData ? prevStateOrForm : null);
  if (!form) return { error: 'Invalid form submission.' };
  const user = await requireUser();
  const name = String(form.get('name') ?? '').trim().slice(0, 120);
  const profession = String(form.get('profession') ?? '').trim().slice(0, 120);
  const headline = String(form.get('headline') ?? '').trim().slice(0, 250);
  if (!name) return { error: 'Name is required.' };
  await updateProfile(user.id, name, profession, headline);
  revalidatePath('/dashboard/settings');
  return { ok: true };
}

