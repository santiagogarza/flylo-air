import fs from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

/**
 * Saves a human-facing screenshot (real fonts, full page) when E2E_MEDIA_DIR is set.
 * Used to collect before/after shots; never asserts anything.
 */
export async function saveMedia(page: Page, testInfo: TestInfo, name: string) {
  const dir = process.env.E2E_MEDIA_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${testInfo.project.name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
}
