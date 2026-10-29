import { vi } from 'vitest';
import type { Env, ServerContext } from '@/server/http';

export const ORIGIN = 'http://localhost:3000';

export function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, host: 'localhost:3000', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export function context(env: Env = {}, fetchImpl?: typeof fetch): ServerContext & { logs: unknown[][] } {
  const logs: unknown[][] = [];
  return {
    env,
    fetchImpl: fetchImpl ?? (vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch),
    log: (...args) => logs.push(args),
    logs,
  };
}
