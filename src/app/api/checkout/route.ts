import { defaultContext } from '@/server/http';
import { handleCheckout } from '@/server/checkout';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleCheckout(request, defaultContext());
}
