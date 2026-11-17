import { test, expect } from './fixtures/echo';
import { saveMedia } from './fixtures/media';

const PAY_URL = '/intake/pay?scenario=lakeline-hardship';

test.describe('/intake/pay mock payment page', () => {
  test('records a payment with a normalized loan number and never calls a webhook @mobile', async ({ page, echo }, testInfo) => {
    await page.goto(PAY_URL);
    await expect(page.getByRole('heading', { level: 1, name: 'Make a payment' })).toBeVisible();
    await saveMedia(page, testInfo, 'intake-pay-empty');
    await page.getByLabel('Loan number').fill('laf 20417');
    await page.getByLabel('Amount').fill('$1,045.5');
    await page.getByRole('button', { name: 'Pay' }).click();
    await expect(page.getByRole('heading', { name: 'Payment recorded' })).toBeVisible();
    await expect(page.getByText('Loan LAF-20417')).toBeVisible();
    await expect(page.locator('.ref')).toHaveText('$1,045.50');
    await expect(page.getByText('No charge was made.')).toBeVisible();
    await saveMedia(page, testInfo, 'intake-pay-recorded');
    expect(await echo.requests()).toHaveLength(0);

    await page.getByRole('link', { name: 'Back to your request' }).click();
    await expect(page).toHaveURL(/\/intake\?scenario=lakeline-hardship$/);
  });

  const badAmounts: [string, string][] = [
    ['', 'Enter an amount like 412.18.'],
    ['abc', 'Enter a dollar amount with up to two decimals.'],
    ['12.345', 'Enter a dollar amount with up to two decimals.'],
    ['0', 'Enter an amount greater than zero.'],
    ['-5', 'Enter a dollar amount with up to two decimals.'],
    ['100000.01', 'Enter an amount of $100,000 or less.'],
  ];
  for (const [amount, message] of badAmounts) {
    test(`rejects amount "${amount}"`, async ({ page }) => {
      await page.goto(PAY_URL);
      await page.getByLabel('Loan number').fill('LAF-20417');
      await page.getByLabel('Amount').fill(amount);
      await page.getByRole('button', { name: 'Pay' }).click();
      await expect(page.locator('#pay-amount-error')).toHaveText(message);
      await expect(page.getByLabel('Amount')).toHaveAttribute('aria-invalid', 'true');
    });
  }

  test('rejects a garbled loan number with the format hint', async ({ page }, testInfo) => {
    await page.goto(PAY_URL);
    await page.getByLabel('Loan number').fill('LAF-2041');
    await page.getByLabel('Amount').fill('100');
    await page.getByRole('button', { name: 'Pay' }).click();
    await expect(page.locator('#pay-loan-error')).toHaveText('Enter a loan number like LAF-20417.');
    await saveMedia(page, testInfo, 'intake-pay-error');
  });

  test('unknown scenario shows the not-found page', async ({ page }) => {
    await page.goto('/intake/pay?scenario=nope');
    await expect(page.getByRole('heading', { level: 1, name: 'That scenario was not found' })).toBeVisible();
  });

  test('scenario without a portal says so', async ({ page }) => {
    await page.goto('/intake/pay?scenario=flylo-support');
    await expect(page.getByRole('heading', { name: 'No payment portal' })).toBeVisible();
  });
});
