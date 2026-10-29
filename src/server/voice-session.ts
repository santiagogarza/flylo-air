import { isAllowedOrigin, json, type ServerContext } from './http';

const UPSTREAM_TIMEOUT_MS = 8000;
const SESSION_SECONDS = 300;

export async function handleVoiceSession(request: Request, ctx: ServerContext): Promise<Response> {
  if (!isAllowedOrigin(request, ctx.env)) {
    return json(403, { error: 'This voice session is only started from the FlyLo-Air site.' });
  }
  if (!ctx.env.XAI_API_KEY) {
    ctx.log('voice session skipped: API key is not configured');
    return json(503, { error: 'Voice calls are not configured. Use the form.' });
  }
  let upstream: Response;
  try {
    upstream = await ctx.fetchImpl('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ctx.env.XAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expires_after: { seconds: SESSION_SECONDS } }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    ctx.log('voice session request failed', error instanceof Error ? error.name : 'network');
    return json(502, { error: 'Voice session could not be started.' });
  }
  if (!upstream.ok) {
    ctx.log('voice session rejected', upstream.status);
    return json(502, { error: 'Voice session could not be started.' });
  }
  const payload = (await upstream.json().catch(() => null)) as { value?: unknown; expires_at?: unknown } | null;
  const value = payload?.value;
  if (!value || typeof value !== 'string') {
    ctx.log('voice session response had no token');
    return json(502, { error: 'Voice session could not be started.' });
  }
  ctx.log('voice session minted');
  return json(200, { value, expires_at: payload?.expires_at ?? null });
}
