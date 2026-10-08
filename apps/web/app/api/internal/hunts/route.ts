import { timingSafeEqual } from 'node:crypto';
import { recoverHunts } from '@/lib/hunt-dispatch';
export const maxDuration=60;
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET;
  const expected=Buffer.from(`Bearer ${secret??''}`);
  const actual=Buffer.from(request.headers.get('authorization')??'');
  if(!secret || actual.length!==expected.length || !timingSafeEqual(actual,expected)) return Response.json({error:'Unauthorized'},{status:401});
  return Response.json({checked:await recoverHunts()},{headers:{'Cache-Control':'no-store'}});
}
