import { defaultContext, json, readJson, safeEqual } from '@/server/http';
import { ingestCase } from '@/server/cases';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ctx = defaultContext();
  const expected = ctx.env.CASES_INGEST_KEY || ctx.env.DEMO_RESET_KEY;
  if (!expected) {
    return json(503, { ok: false, error: 'Case ingest is not configured. Set CASES_INGEST_KEY or DEMO_RESET_KEY.' });
  }
  const provided = bearer(request) || request.headers.get('x-demo-reset-key') || '';
  if (!safeEqual(provided, expected)) {
    return json(401, { ok: false, error: 'Unauthorized. Send Authorization: Bearer <key>, or the x-demo-reset-key header.' });
  }
  const parsed = await readJson(request);
  if ('error' in parsed) return json(400, { ok: false, error: parsed.error });
  const result = ingestCase(parsed.value);
  return json(result.status, result.body);
}

function bearer(request: Request): string {
  const match = /^Bearer\s+(\S+)/i.exec(request.headers.get('authorization') ?? '');
  return match?.[1] ?? '';
}
