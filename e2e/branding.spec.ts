import { test, expect } from './fixtures/echo';
import { LAKELINE_URL } from './fixtures/intake';

// Expected failures until Lakeline branding lands on #15. Flip to plain `test` when the root layout stops
// rendering FlyLo on Lakeline routes.
const lakelineBrandingPending = true;
const lakelineTest = lakelineBrandingPending ? test.fail : test;

const LAKELINE_PAGES = [
  { name: 'intake', path: LAKELINE_URL },
  { name: 'review queue', path: '/intake/review?scenario=lakeline-hardship' },
  { name: 'case page', path: '/intake/review/LAF-REQ-9001?scenario=lakeline-hardship' },
  { name: 'policy', path: '/intake/policy?scenario=lakeline-hardship' },
  { name: 'pay', path: '/intake/pay?scenario=lakeline-hardship' },
];

for (const item of LAKELINE_PAGES) {
  lakelineTest(`${item.name} has no FlyLo in its title or header`, async ({ page }) => {
    const response = await page.goto(item.path);
    expect(response?.status()).toBe(200);
    expect(await page.title()).not.toMatch(/flylo/i);
    const header = page.locator('header');
    await expect(header).toBeVisible();
    expect(await header.innerText()).not.toMatch(/flylo/i);
  });
}

test('support keeps its FlyLo title and header', async ({ page }) => {
  const response = await page.goto('/support');
  expect(response?.status()).toBe(200);
  expect(await page.title()).toMatch(/FlyLo-Air/);
  await expect(page.locator('header')).toContainText('FlyLo');
});

test('a missing case page returns HTTP 404', async ({ page }) => {
  const response = await page.goto('/intake/review/LAF-REQ-0000?scenario=lakeline-hardship');
  expect(response?.status()).toBe(404);
});
