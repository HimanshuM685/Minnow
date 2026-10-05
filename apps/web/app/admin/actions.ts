'use server';
import { revalidatePath } from 'next/cache';
import { addCredits, hideListing, skipSource } from '@minnow/db';
import { requireAdmin } from '@/lib/auth/admin';
import { isUuid } from '@/lib/admin/ui';
export async function setListingVisibility(form: FormData) { await requireAdmin(); const id=String(form.get('id')??''); if(!isUuid(id)) throw new Error('Invalid listing id.'); await hideListing(id,form.get('hidden')==='true',String(form.get('reason')??'').slice(0,500)); revalidatePath('/admin/listings'); revalidatePath('/dashboard/listings'); }
export async function setSourceSkipped(form: FormData) { await requireAdmin(); const host=String(form.get('host')??''); if(!/^[a-z0-9.-]+$/i.test(host)) throw new Error('Invalid host.'); await skipSource(host,form.get('skipped')==='true'); revalidatePath('/admin/sources'); }
export async function addUserCredits(form: FormData) { await requireAdmin(); const userId=String(form.get('userId')??''); const amount=Number(form.get('amount')); if(!userId||!Number.isInteger(amount)||Math.abs(amount)>1000) throw new Error('Invalid credit amount.'); await addCredits(userId,amount); revalidatePath('/admin/people'); }
