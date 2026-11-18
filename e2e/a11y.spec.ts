import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures/echo';
import { LAKELINE_URL } from './fixtures/intake';

const PAGES = [
  ['/support', '/support'],
  ['lakeline intake', LAKELINE_URL],
  ['intake catalog', '/intake'],
  ['unknown scenario', '/intake?scenario=nope'],
  ['public hotel', '/intake?scenario=public-hotel'],
  ['pay', '/intake/pay?scenario=lakeline-hardship'],
] as const;

test.describe('axe: no serious or critical WCAG A/AA violations', () => {
  for (const [name, url] of PAGES) {
    test(`${name} @mobile`, async ({ page }) => {
      await page.goto(url);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const blocking = results.violations
        .filter((item) => item.impact === 'serious' || item.impact === 'critical')
        .map((item) => `${item.id} (${item.impact}): ${item.nodes.map((node) => node.target.join(' ')).join(', ')}`);
      expect(blocking).toEqual([]);
    });
  }

  test('lakeline validation state', async ({ page }) => {
    await page.goto(LAKELINE_URL);
    await page.locator('#intake-fullName').fill('M');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.locator('.alert-error')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical').map((item) => item.id)).toEqual([]);
  });
});
