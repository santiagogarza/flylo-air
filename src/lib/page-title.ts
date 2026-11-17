import type { Metadata } from 'next';

function titled(full: string): Metadata {
  return {
    title: { absolute: full },
    openGraph: { title: full },
    twitter: { title: full },
  };
}

/** Document title for a known scenario. Absolute, so the FlyLo-Air template never applies. */
export function scenarioTitle(title: string, brandName: string): Metadata {
  return titled(`${title} · ${brandName}`);
}

/** Document title for an intake page that has no scenario brand. */
export function absoluteTitle(title: string): Metadata {
  return titled(title);
}
