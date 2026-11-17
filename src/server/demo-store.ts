import type { Env } from './http';

export type DemoKey = 'tickets' | 'cases';

export class IdClaimError extends Error {
  constructor(prefix: string, attempts: number) {
    super(`Could not reserve a ${prefix} ticket id after ${attempts} attempts.`);
    this.name = 'IdClaimError';
  }
}

export type ClaimOptions = {
  maxAttempts: number;
  /** Claim blob path for sequence number k, for example `LAF-REQ-1047`. */
  name: (sequence: number) => string;
  /** Return false to skip a sequence number that is already in use elsewhere. */
  accept?: (sequence: number) => Promise<boolean>;
};

export type JsonBag = {
  read(key: DemoKey): Promise<unknown | null>;
  write(key: DemoKey, value: unknown): Promise<void>;
  /**
   * Returns a sequence number (1, 2, 3, ...) that no other caller got for this prefix.
   * The counter lives apart from the tickets and cases lists, so resetting those never rewinds it.
   */
  claimSeq(prefix: string, options: ClaimOptions): Promise<number>;
};

type Slot = { kind: string; bag: Promise<JsonBag> };

type DemoGlobal = typeof globalThis & {
  __flyloDemoMemory?: Map<string, string>;
  __flyloDemoCounters?: Map<string, number>;
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

function counterMap(): Map<string, number> {
  const g = globals();
  g.__flyloDemoCounters ??= new Map();
  return g.__flyloDemoCounters;
}

const CLAIM_PREFIX = 'flylo-demo/claims/';
const HINT_PREFIX = 'flylo-demo/claim-hints/';

export function isBlobConflict(error: unknown): boolean {
  return error instanceof Error && /already exists/i.test(error.message);
}

export function memoryBag(): JsonBag {
  const map = memoryMap();
  return {
    async claimSeq(prefix, options) {
      const counters = counterMap();
      for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
        const next = (counters.get(prefix) ?? 0) + 1;
        counters.set(prefix, next);
        if (!options.accept || (await options.accept(next))) return next;
      }
      throw new IdClaimError(prefix, options.maxAttempts);
    },
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
  const readText = async (path: string): Promise<string | null> => {
    const result = await get(path, { access: 'private', token, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return new Response(result.stream).text();
  };
  return {
    async claimSeq(prefix, options) {
      const hint = Number.parseInt((await readText(`${HINT_PREFIX}${prefix}`)) ?? '', 10);
      let candidate = Number.isFinite(hint) && hint > 0 ? hint + 1 : 1;
      for (let attempt = 0; attempt < options.maxAttempts; attempt += 1, candidate += 1) {
        try {
          // allowOverwrite: false makes the put fail when another caller already holds this id.
          await put(`${CLAIM_PREFIX}${options.name(candidate)}`, String(candidate), {
            access: 'private',
            token,
            addRandomSuffix: false,
            allowOverwrite: false,
            contentType: 'text/plain',
          });
        } catch (error) {
          if (isBlobConflict(error)) continue;
          throw error;
        }
        if (options.accept && !(await options.accept(candidate))) continue;
        await put(`${HINT_PREFIX}${prefix}`, String(candidate), {
          access: 'private',
          token,
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'text/plain',
        }).catch(() => undefined);
        return candidate;
      }
      throw new IdClaimError(prefix, options.maxAttempts);
    },
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
    async claimSeq(prefix, options) {
      for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
        // INCR is atomic, so two callers never receive the same number.
        const next = await redis.incr(`flylo-demo:id:${prefix}`);
        if (!options.accept || (await options.accept(next))) return next;
      }
      throw new IdClaimError(prefix, options.maxAttempts);
    },
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
  const bag = kind === 'blob' ? blobBag(env.BLOB_READ_WRITE_TOKEN!.trim()) : kind === 'kv' ? kvBag(env.KV_REST_API_URL!.trim(), env.KV_REST_API_TOKEN!.trim()) : Promise.resolve(memoryBag());
  bag.catch(() => {
    if (g.__flyloDemoSlot?.bag === bag) delete g.__flyloDemoSlot;
  });
  g.__flyloDemoSlot = { kind: id, bag };
  return bag;
}

export function resetStoreCacheForTests(): void {
  delete globals().__flyloDemoSlot;
}

export function clearDemoMemoryForTests(): void {
  globals().__flyloDemoMemory?.clear();
  globals().__flyloDemoCounters?.clear();
  delete globals().__flyloDemoSlot;
}
