import { timingSafeEqual } from 'node:crypto';

export type Env = Record<string, string | undefined>;

export type ServerContext = {
  env: Env;
  fetchImpl: typeof fetch;
  log: (...args: unknown[]) => void;
};

export function defaultContext(): ServerContext {
  return {
    env: process.env,
    fetchImpl: globalThis.fetch,
    log: (...args) => console.log(...args),
  };
}

export function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

const MAX_BODY_BYTES = 16 * 1024;

export async function readJson(request: Request): Promise<{ value: Record<string, unknown> } | { error: string }> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) return { error: 'Send JSON.' };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: 'Request is too large.' };
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Send a JSON object.' };
    return { value: value as Record<string, unknown> };
  } catch {
    return { error: 'Send valid JSON.' };
  }
}

// Browsers always send Origin on a cross-site POST, so a missing Origin is only trusted
// when the browser itself marks the request as same-origin.
export function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname)) return true;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host && parsed.host === host) return true;
  const extras = String(env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return extras.includes(origin);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
