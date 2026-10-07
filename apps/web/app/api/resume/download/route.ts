import { downloadResume } from '@minnow/db';
import { connection } from 'next/server';
import { auth } from '@/lib/auth/server';
export async function GET() {
  await connection();
  const { data: session } = await auth.getSession();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const resume = await downloadResume(session.user.id);
  if (!resume) return Response.json({ error: 'No resume found' }, { status: 404 });
  const data = Buffer.from(resume.data,'base64');
  return new Response(new Uint8Array(data), { headers: { 'Content-Type': resume.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(resume.file_name)}`, 'Cache-Control': 'private, no-store' } });
}
