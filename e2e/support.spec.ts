import { expect, test } from './fixtures';

test.describe('Support page (read-only smoke test)', () => {
  test.beforeEach(async ({ support }) => {
    await support.lockDown();
    await support.goto();
  });

  test('loads with the ticket form and the call button', async ({ page, support }) => {
    await expect(page).toHaveTitle('Call FlyLo-Air Support · FlyLo-Air');
    await expect(support.heading).toBeVisible();
    for (const field of [support.fullName, support.bookingReference, support.email, support.category, support.description]) {
      await expect(field).toBeVisible();
      await expect(field).toHaveValue('');
    }
    await expect(support.callButton).toBeVisible();
    await expect(support.callButton).toBeEnabled();
  });

  test('the call button reports that voice is not configured', async ({ page, support }) => {
    const session = page.waitForResponse((response) => response.url().endsWith('/api/voice/session'));
    await support.callButton.click();

    const response = await session;
    expect(response.status()).toBe(503);
    await expect(support.callStatus).toHaveText('Voice calls are not configured. Use the form.');
    await expect(page.getByRole('button', { name: 'Call again' })).toBeVisible();
    await expect(support.fullName).toBeEditable();
    expect(support.ticketRequests).toEqual([]);
  });
});
