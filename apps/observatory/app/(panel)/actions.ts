'use server';
import { revalidatePath } from 'next/cache';
import { hideListing, skipSource } from '@minnow/db';
import { requireAdmin } from '@/lib/auth/session';
import { isUuid } from '@/lib/ui';
export async function setListingVisibility(form: FormData) { await requireAdmin(); const id=String(form.get('id')??''); if(!isUuid(id)) throw new Error('Invalid listing id.'); await hideListing(id,form.get('hidden')==='true',String(form.get('reason')??'').slice(0,500)); revalidatePath('/listings'); }
export async function setSourceSkipped(form: FormData) { await requireAdmin(); const host=String(form.get('host')??''); if(!/^[a-z0-9.-]+$/i.test(host)) throw new Error('Invalid host.'); await skipSource(host,form.get('skipped')==='true'); revalidatePath('/sources'); }
