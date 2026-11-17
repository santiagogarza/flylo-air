import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LAKELINE_PERSONA } from '@/scenarios/lakeline/persona';
import { clearDemoMemoryForTests } from '@/server/demo-store';
import { handleCreateTicket, resetTickets } from '@/server/tickets';
import { context, post } from './helpers';

const kv = vi.hoisted(() => ({ data: new Map<string, unknown>() }));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    async incr(key: string) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const next = (Number(kv.data.get(key)) || 0) + 1;
      kv.data.set(key, next);
      return next;
    }
    async get(key: string) {
      return kv.data.get(key) ?? null;
    }
    async set(key: string, value: unknown) {
      kv.data.set(key, JSON.parse(JSON.stringify(value)));
    }
  },
}));

const fields = {
  fullName: LAKELINE_PERSONA.fullName,
  loanNumber: LAKELINE_PERSONA.loanNumber,
  email: LAKELINE_PERSONA.email,
  reason: 'I need to push my payment back a few weeks.',
  requestedChange: 'Payment extension',
  callbackWindow: 'Afternoons',
};
const env = { LAKELINE_WEBHOOK_URL: 'https://hooks.example.test/lakeline', LAKELINE_WEBHOOK_KEY: 'Bearer k', SUPPORT_WEBHOOK_HEADER: 'Authorization' };

async function submit() {
  const response = await handleCreateTicket(post('/api/tickets', { scenario: 'lakeline-hardship', fields }), context(env));
  return ((await response.json()) as { id: string }).id;
}

describe('scenario ticket ids on KV', () => {
  beforeEach(() => {
    kv.data.clear();
    clearDemoMemoryForTests();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'kv-token';
  });

  it('uses an atomic counter that survives a reset', async () => {
    const ids = await Promise.all(Array.from({ length: 20 }, submit));
    expect(new Set(ids).size).toBe(20);
    await resetTickets();
    expect(await submit()).toBe('LAF-REQ-1021');
  });
});
