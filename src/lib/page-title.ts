import type { Metadata } from 'next';

export function scenarioTitle(title: string, brandName: string): Metadata {
  return { title: { absolute: `${title} · ${brandName}` } };
}
