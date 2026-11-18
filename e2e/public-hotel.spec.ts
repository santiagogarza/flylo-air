import { test, expect } from './fixtures/echo';
import { PUBLIC_PERSONA } from '@/scenarios/public-hotel/persona';
import { submit } from './fixtures/intake';
import { saveMedia } from './fixtures/media';

const URL = '/intake?scenario=public-hotel';

test.describe('/intake?scenario=public-hotel', () => {
  test('renders the demo desk and submits while the webhook is unset', async ({ page, echo }, testInfo) => {
    await page.goto(URL);
    await expect(page).toHaveTitle('Guest services · PUBLIC Hotel New York');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /PUBLIC Hotel/);
    await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', /flylo/i);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Guest services · PUBLIC Hotel New York');
    await expect(page.locator('header')).toHaveCount(0);
    await expect(page.locator('.intake-bar')).toContainText('PUBLIC');
    await expect(page.locator('.intake-bar')).toContainText('Demo');
    expect(await page.locator('.intake-bar').innerText()).not.toMatch(/flylo/i);
    await expect(page.getByRole('heading', { level: 1, name: 'Guest services' })).toBeVisible();
    await expect(page.getByText('1-800-555-0148').first()).toBeVisible();
    await expect(page.getByLabel('Guest name')).toBeVisible();
    await expect(page.getByLabel('Reservation confirmation')).toBeVisible();
    await expect(page.getByLabel('Nights')).toBeVisible();
    await page.addStyleTag({ content: '.intake-bar, .action-bar { position: static !important; }' });
    await saveMedia(page, testInfo, 'public-hotel-idle');

    await page.locator('#intake-guestName').fill(PUBLIC_PERSONA.guestName);
    await page.locator('#intake-email').fill(PUBLIC_PERSONA.email);
    await page.locator('#intake-confirmation').fill('P U B four eight two nine one three');
    await page.locator('#intake-confirmation').blur();
    await expect(page.locator('#intake-confirmation')).toHaveValue('PUB-482913');
    await page.locator('#intake-checkIn').fill('Thursday');
    await page.locator('#intake-nights').fill('2');
    await page.locator('#intake-requestType').selectOption('Early check-in / late checkout');
    await page.locator('#intake-details').fill('Late checkout on Saturday around 2pm, and a possible double minibar charge.');
    await page.locator('#intake-callbackTime').fill('Afternoons');

    await submit(page);
    const success = page.locator('.success');
    await expect(success.getByTestId('ticket-id')).toHaveText(/^PUB-REQ-\d+$/);
    await expect(success.getByRole('heading', { name: 'Request received' })).toBeVisible();
    await expect(success).toContainText(/Request PUB-REQ-\d+ is with PUBLIC guest services/);
    await expect(success).toContainText('Nothing is charged or changed until a person confirms.');
    await saveMedia(page, testInfo, 'public-hotel-success');
    expect(await echo.requests()).toHaveLength(0);
  });
});
