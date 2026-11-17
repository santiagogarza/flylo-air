import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/echo';
import { LAKELINE_URL } from './fixtures/intake';

const BRAND = 'Lakeline Auto Finance';
const DESCRIPTION = 'A sample auto lender. No real loans or payments. Nothing is sent until you press Submit.';

const LAKELINE_PAGES = [
  { name: 'intake', path: LAKELINE_URL, title: `Request a payment change · ${BRAND}` },
  { name: 'review queue', path: '/intake/review?scenario=lakeline-hardship', title: `Review queue · ${BRAND}` },
  { name: 'case page', path: '/intake/review/LAF-REQ-9006?scenario=lakeline-hardship', title: `LAF-REQ-9006 · ${BRAND}` },
  { name: 'policy', path: '/intake/policy?scenario=lakeline-hardship', title: `Hardship policy · ${BRAND}` },
  { name: 'pay', path: '/intake/pay?scenario=lakeline-hardship', title: `Make a payment · ${BRAND}` },
];

async function expectLakelineMeta(page: Page, title: string) {
  await expect(page).toHaveTitle(title);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', DESCRIPTION);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', DESCRIPTION);
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', title);
  await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute('content', DESCRIPTION);
}

for (const item of LAKELINE_PAGES) {
  test(`${item.name} uses Lakeline title, description, and social tags, with no FlyLo`, async ({ page }) => {
    const response = await page.goto(item.path);
    expect(response?.status()).toBe(200);
    await expectLakelineMeta(page, item.title);
    const bar = page.locator('.intake-bar');
    await expect(bar).toBeVisible();
    expect(await bar.innerText()).not.toMatch(/flylo/i);
    await expect(bar).toContainText('Lakeline');
    await expect(page.locator('header')).toHaveCount(0);
  });
}

test('support keeps its FlyLo title, description, and header', async ({ page }) => {
  const response = await page.goto('/support');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Call FlyLo-Air Support · FlyLo-Air');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /FlyLo-Air is a fictional airline/);
  await expect(page.locator('header')).toContainText('FlyLo');
  await expect(page.locator('.intake-bar')).toHaveCount(0);
});

test('a missing case page returns HTTP 404 with Lakeline copy', async ({ page }) => {
  const response = await page.goto('/intake/review/LAF-REQ-0000?scenario=lakeline-hardship');
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle(`Case not found · ${BRAND}`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', DESCRIPTION);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', DESCRIPTION);
  await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute('content', DESCRIPTION);
  await expect(page.getByRole('heading', { level: 1, name: 'Case not found' })).toBeVisible();
  await expect(page.getByText('No case matches this link. It may have been cleared by a demo reset.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the queue' })).toBeVisible();
  await expect(page.locator('.intake-bar')).toContainText('Lakeline');
});

// Known gap: generateMetadata spreads the case-page metadata, so og:title and twitter:title still carry the ticket id after the 404 document title change (91a7464). Expected to fail until the builder aligns them.
test.fail('a missing case page uses the same title in social tags as in the document title', async ({ page }) => {
  await page.goto('/intake/review/LAF-REQ-0000?scenario=lakeline-hardship');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', `Case not found · ${BRAND}`);
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', `Case not found · ${BRAND}`);
});
