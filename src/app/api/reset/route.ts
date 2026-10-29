import { defaultContext } from '@/server/http';
import { handleReset } from '@/server/reset';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleReset(request, defaultContext());
}
