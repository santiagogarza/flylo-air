import { MAX_PASSENGERS } from './flights';

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function passengerCount(value: string | undefined): number {
  const count = Number.parseInt(value ?? '1', 10);
  if (!Number.isFinite(count) || count < 1) return 1;
  return Math.min(count, MAX_PASSENGERS);
}
