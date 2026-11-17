import type { Env } from './http';

export type DemoKey = 'tickets' | 'cases';

export type JsonBag = {
  read(key: DemoKey): Promise<unknown | null>;
  write(key: DemoKey, value: unknown): Promise<void>;
};

type Slot = { kind: string; bag: JsonBag };

type DemoGlobal = typeof globalThis & {
  __flyloDemoMemory?: Map<string, string>;
  __flyloDemoSlot?: Slot;
};

const PATHS: Record<DemoKey, string> = {
  tickets: 'flylo-demo/tickets.json',
  cases: 'flylo-demo/cases.json',
};

const REDIS_KEYS: Record<DemoKey, string> = {
  tickets: 'flylo-demo:tickets',
  cases: 'flylo-demo:cases',
};

function globals(): DemoGlobal {
  return globalThis as DemoGlobal;
}

// In-memory only: one Node process shares this map through globalThis.
// A cold start empties it. Each serverless instance has its own map.
function memoryMap(): Map<string, string> {
  const g = globals();
  g.__flyloDemoMemory ??= new Map();
  return g.__flyloDemoMemory;
}

export function memoryBag(): JsonBag {
  const map = memoryMap();
  return {
    async read(key) {
      const raw = map.get(key);
      return raw === undefined ? null : (JSON.parse(raw) as unknown);
    },
    async write(key, value) {
      map.set(key, JSON.stringify(value));
    },
  };
}

async function blobBag(token: string): Promise<JsonBag> {
  const { get, put } = await import('@vercel/blob');
  return {
    async read(key) {
      const result = await get(PATHS[key], { access: 'private', token, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const text = await new Response(result.stream).text();
      return text ? (JSON.parse(text) as unknown) : null;
    },
    async write(key, value) {
      await put(PATHS[key], JSON.stringify(value), {
        access: 'private',
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
    },
  };
}

async function kvBag(url: string, token: string): Promise<JsonBag> {
  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({ url, token });
  return {
    async read(key) {
      const value = await redis.get<unknown>(REDIS_KEYS[key]);
      if (value === null || value === undefined) return null;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return null;
        }
      }
      return value;
    },
    async write(key, value) {
      await redis.set(REDIS_KEYS[key], value);
    },
  };
}

export function storeKind(env: Env = process.env): 'blob' | 'kv' | 'memory' {
  if (env.BLOB_READ_WRITE_TOKEN?.trim()) return 'blob';
  if (env.KV_REST_API_URL?.trim() && env.KV_REST_API_TOKEN?.trim()) return 'kv';
  return 'memory';
}

export async function currentBag(env: Env = process.env): Promise<JsonBag> {
  const kind = storeKind(env);
  const token = kind === 'blob' ? env.BLOB_READ_WRITE_TOKEN!.trim() : kind === 'kv' ? `${env.KV_REST_API_URL!.trim()}|${env.KV_REST_API_TOKEN!.trim()}` : '';
  const id = `${kind}:${token}`;
  const g = globals();
  if (g.__flyloDemoSlot?.kind === id) return g.__flyloDemoSlot.bag;
  const bag = kind === 'blob' ? await blobBag(env.BLOB_READ_WRITE_TOKEN!.trim()) : kind === 'kv' ? await kvBag(env.KV_REST_API_URL!.trim(), env.KV_REST_API_TOKEN!.trim()) : memoryBag();
  g.__flyloDemoSlot = { kind: id, bag };
  return bag;
}

export function resetStoreCacheForTests(): void {
  delete globals().__flyloDemoSlot;
}

export function clearDemoMemoryForTests(): void {
  globals().__flyloDemoMemory?.clear();
  delete globals().__flyloDemoSlot;
}
