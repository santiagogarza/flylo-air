import { defaultContext } from '@/server/http';
import { handleCreateTicket } from '@/server/tickets';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleCreateTicket(request, defaultContext());
}
