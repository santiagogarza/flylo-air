import { describe, expect, it, vi } from 'vitest';
import { handleVoiceSession } from '@/server/voice-session';
import { context, post } from './helpers';

const env = { XAI_API_KEY: 'xai-test-key' };

describe('POST /api/voice/session', () => {
  it('mints a short-lived client secret', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ value: 'ephemeral-token', expires_at: 1790000000 }),
    );
    const response = await handleVoiceSession(post('/api/voice/session', {}), context(env, fetchImpl as unknown as typeof fetch));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ value: 'ephemeral-token', expires_at: 1790000000 });
    expect(text).not.toContain('xai-test-key');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.x.ai/v1/realtime/client_secrets');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer xai-test-key');
    expect(JSON.parse(String(init?.body))).toEqual({ expires_after: { seconds: 300 } });
  });

  it('is unavailable without an API key', async () => {
    const fetchImpl = vi.fn();
    const response = await handleVoiceSession(post('/api/voice/session', {}), context({}, fetchImpl as unknown as typeof fetch));
    expect(response.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('only starts from this site', async () => {
    const fetchImpl = vi.fn();
    const request = post('/api/voice/session', {}, { origin: 'https://evil.example.test' });
    const response = await handleVoiceSession(request, context(env, fetchImpl as unknown as typeof fetch));
    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts the deployed host as origin', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ value: 'ephemeral-token' }));
    const request = new Request('https://flylo.example.test/api/voice/session', {
      method: 'POST',
      headers: { origin: 'https://flylo.example.test', host: 'flylo.example.test' },
    });
    const response = await handleVoiceSession(request, context(env, fetchImpl as unknown as typeof fetch));
    expect(response.status).toBe(200);
  });

  it('hides upstream failures', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad key', { status: 401 }));
    const response = await handleVoiceSession(post('/api/voice/session', {}), context(env, fetchImpl as unknown as typeof fetch));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Voice session could not be started.' });
  });
});
