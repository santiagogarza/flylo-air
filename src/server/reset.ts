import { json, safeEqual, type ServerContext } from './http';
import { resetTickets } from './tickets';

export function handleReset(request: Request, ctx: ServerContext): Response {
  const expected = ctx.env.DEMO_RESET_KEY;
  if (!expected) return json(503, { ok: false, error: 'Reset is not configured.' });
  const provided = request.headers.get('x-demo-reset-key') ?? '';
  if (!safeEqual(provided, expected)) return json(401, { ok: false, error: 'Unauthorized.' });
  const { cleared } = resetTickets();
  ctx.log('demo reset', cleared);
  return json(200, { ok: true, cleared });
}
