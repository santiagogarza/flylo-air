import type { Env } from '@/server/http';
import type { ScenarioWebhook } from './types';

export type WebhookTarget = {
  url?: string;
  headerName?: string;
  key?: string;
};

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

export const DEFAULT_WEBHOOK_ENV = {
  urlEnv: 'SUPPORT_WEBHOOK_URL',
  headerEnv: 'SUPPORT_WEBHOOK_HEADER',
  keyEnv: 'SUPPORT_WEBHOOK_KEY',
} as const;

function readEnv(env: Env, name: string | undefined): string | undefined {
  if (!name || !ENV_NAME.test(name)) return undefined;
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value;
}

/**
 * Resolves a scenario webhook to URL, header name, and key.
 * Each named variable falls back independently to SUPPORT_WEBHOOK_*.
 * A scenario that omits `webhook` uses that default triple.
 */
export function resolveWebhook(webhook: ScenarioWebhook | undefined, env: Env): WebhookTarget {
  const fallback: WebhookTarget = {
    url: readEnv(env, DEFAULT_WEBHOOK_ENV.urlEnv),
    headerName: readEnv(env, DEFAULT_WEBHOOK_ENV.headerEnv),
    key: readEnv(env, DEFAULT_WEBHOOK_ENV.keyEnv),
  };
  if (!webhook) return fallback;
  return {
    url: readEnv(env, webhook.urlEnv) ?? fallback.url,
    headerName: readEnv(env, webhook.headerEnv) ?? fallback.headerName,
    key: readEnv(env, webhook.keyEnv) ?? fallback.key,
  };
}
