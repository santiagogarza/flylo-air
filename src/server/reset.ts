import { resetCases } from './cases';
import { json, readJson, safeEqual, type ServerContext } from './http';
import { resetTickets } from './tickets';

export async function handleReset(request: Request, ctx: ServerContext): Promise<Response> {
  const expected = ctx.env.DEMO_RESET_KEY;
  if (!expected) return json(503, { ok: false, error: 'Reset is not configured.' });
  const provided = request.headers.get('x-demo-reset-key') ?? '';
  if (!safeEqual(provided, expected)) return json(401, { ok: false, error: 'Unauthorized.' });
  const emptyCases = await wantsEmptyCases(request);
  const { cleared } = await resetTickets();
  const { cleared: casesCleared, seeded: casesSeeded } = await resetCases({ empty: emptyCases });
  ctx.log('demo reset', cleared, casesCleared, casesSeeded);
  return json(200, { ok: true, cleared, casesCleared, casesSeeded });
}

async function wantsEmptyCases(request: Request): Promise<boolean> {
  if (new URL(request.url).searchParams.get('cases') === 'empty') return true;
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) return false;
  const parsed = await readJson(request);
  return !('error' in parsed) && parsed.value.cases === 'empty';
}
