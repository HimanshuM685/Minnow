'use server';
import { revalidatePath } from 'next/cache';
import { upsertResume } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { extractResume } from '@/lib/resume';
export async function uploadResume(_state: { error?: string; ok?: boolean } | null, form: FormData) {
  const user = await requireUser();
  const file = form.get('resume');
  if (!(file instanceof File)) return { error: 'Select your resume first.' };
  try {
    const parsed = await extractResume(file);
    await upsertResume(user.id, parsed.fileName, parsed.mime, parsed.bytes, parsed.text);
    revalidatePath('/app/resume'); revalidatePath('/app');
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : 'Could not read this resume.' }; }
}
