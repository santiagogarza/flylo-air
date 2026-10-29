import { expect, type Locator } from '@playwright/test';

/**
 * Server-rendered controls ignore clicks until React hydrates them, and a slow CI runner
 * can click first. React tags hydrated elements with a `__reactProps$…` key.
 */
export async function waitForHydration(target: Locator) {
  await expect
    .poll(() => target.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__reactProps$'))), {
      message: 'waiting for React to hydrate',
    })
    .toBe(true);
}
