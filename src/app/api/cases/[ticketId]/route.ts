import { applyCaseAction } from '@/server/cases';
import { asString, defaultContext, isAllowedOrigin, json, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  const ctx = defaultContext();
  if (!isAllowedOrigin(request, ctx.env)) return json(403, { ok: false, error: 'This action is only available from the site.' });
  const { ticketId } = await context.params;
  const parsed = await readJson(request);
  if ('error' in parsed) return json(400, { ok: false, error: parsed.error });
  const result = applyCaseAction(decodeURIComponent(ticketId), asString(parsed.value.action), {
    by: asString(parsed.value.by),
    draft: typeof parsed.value.draft === 'string' ? parsed.value.draft : undefined,
  });
  return json(result.status, result.body);
}
