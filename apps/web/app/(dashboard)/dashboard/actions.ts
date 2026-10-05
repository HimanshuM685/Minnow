'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { savePreferences as storePreferences, updateProfile } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
const schema = z.object({ role: z.string().trim().min(2).max(120), profession: z.string().trim().max(120), location_label: z.string().trim().max(180), location_country_code: z.string().regex(/^[A-Z]{2}$/).or(z.literal('')), seniority: z.enum(['intern','new_grad','mid','any']), work_mode: z.enum(['onsite','hybrid','remote','any']), visa: z.enum(['needs_sponsorship','no','any']), keywords: z.array(z.string().trim().max(80)).max(30) });
export async function savePreferences(value: unknown) {
  const user = await requireUser();
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await storePreferences(user.id, parsed.data);
  revalidatePath('/dashboard');
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

