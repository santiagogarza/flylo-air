import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/echo';
import { saveMedia } from './fixtures/media';

const stylePath = path.join(__dirname, 'fixtures/screenshot.css');
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// SupportCall ignores a Submit click within 600ms of the primary button turning from Call into Submit.
const PRIMARY_SETTLE_MS = 700;

async function submit(page: Page) {
  await page.waitForTimeout(PRIMARY_SETTLE_MS);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
}

const MAYA = {
  fullName: 'Maya Chen',
  bookingReference: 'fly 48213',
  email: '  Maya.Chen@Example.com ',
  category: 'Checkout / payment',
  description: 'Checkout keeps failing at payment when I book for me and my son.',
};

test.describe('/support regression', () => {
  test('empty form looks the same as today @mobile', async ({ page, echo }, testInfo) => {
    await page.goto('/support');
    await expect(page.getByRole('heading', { level: 1, name: 'Call FlyLo-Air Support' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Call FlyLo-Air Support' })).toBeVisible();
    await saveMedia(page, testInfo, 'support-empty');
    await expect(page).toHaveScreenshot('support-empty.png', { fullPage: true, stylePath });
    expect(await echo.requests()).toHaveLength(0);
  });

  test('form fields, labels and categories are unchanged', async ({ page }) => {
    await page.goto('/support');
    for (const label of ['Full name', 'Booking reference', 'Email', 'Issue category', 'Description']) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    const options = await page.getByLabel('Issue category').locator('option').allTextContents();
    expect(options).toEqual(['Select a category', 'Checkout / payment', 'Refund', 'Change flight', 'Baggage', 'Other']);
    await expect(page.getByText('Nothing is sent until you press Submit.', { exact: true })).toBeVisible();
  });

  test('typed submit sends the exact browser and webhook payload shape', async ({ page, echo }, testInfo) => {
    await page.goto('/support');
    await page.getByLabel('Full name').fill(MAYA.fullName);
    await page.getByLabel('Booking reference').fill(MAYA.bookingReference);
    await page.getByLabel('Email').fill(MAYA.email);
    await page.getByLabel('Issue category').selectOption(MAYA.category);
    await page.getByLabel('Description').fill(MAYA.description);
    await saveMedia(page, testInfo, 'support-filled');

    const browserRequest = page.waitForRequest((req) => req.url().endsWith('/api/tickets') && req.method() === 'POST');
    const browserResponse = page.waitForResponse((res) => res.url().endsWith('/api/tickets'));
    await submit(page);

    const sent = (await browserRequest).postDataJSON();
    expect(Object.keys(sent)).toEqual(['fullName', 'bookingReference', 'email', 'category', 'description', 'channel']);
    expect(sent).toEqual({
      fullName: 'Maya Chen',
      bookingReference: 'FLY-48213',
      email: 'maya.chen@example.com',
      category: 'Checkout / payment',
      description: MAYA.description,
      channel: 'web',
    });

    const response = await browserResponse;
    expect(response.status()).toBe(201);
    expect(await response.json()).toEqual({ ok: true, id: 'FLY-SUP-1001', status: 'received' });

    const [hook] = await echo.waitForRequests(1, '/support-hook');
    expect(hook.method).toBe('POST');
    expect(hook.headers['x-e2e-key']).toBe('e2e-webhook-key');
    expect(hook.headers['content-type']).toBe('application/json');
    const body = hook.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      'id',
      'createdAt',
      'channel',
      'fullName',
      'bookingReference',
      'email',
      'category',
      'description',
      'summary',
    ]);
    expect(body).toEqual({
      id: 'FLY-SUP-1001',
      createdAt: expect.stringMatching(ISO),
      channel: 'web',
      fullName: 'Maya Chen',
      bookingReference: 'FLY-48213',
      email: 'maya.chen@example.com',
      category: 'Checkout / payment',
      description: MAYA.description,
      summary: `Checkout / payment issue from Maya Chen (FLY-48213): ${MAYA.description}`,
    });

    await expect(page.getByRole('heading', { name: 'Ticket received' })).toBeVisible();
    await expect(page.getByTestId('ticket-id')).toHaveText('FLY-SUP-1001');
    await saveMedia(page, testInfo, 'support-received');
    await expect(page).toHaveScreenshot('support-received.png', { fullPage: true, stylePath });
    expect(await echo.requests('/support-hook')).toHaveLength(1);
  });

  test('empty submit shows the validation summary and sends nothing', async ({ page, echo }, testInfo) => {
    await page.goto('/support');
    await page.getByLabel('Full name').fill('M');
    await submit(page);
    const alert = page.locator('.alert-error');
    await expect(alert).toContainText('Check the highlighted fields, then press Submit again.');
    await expect(alert.getByRole('link')).toHaveText([
      'Enter a booking reference like FLY-48213.',
      'Enter an email like name@example.com.',
      'Choose an issue category.',
      'Describe the problem in a sentence or two.',
    ]);
    await saveMedia(page, testInfo, 'support-validation');
    await expect(page).toHaveScreenshot('support-validation.png', { fullPage: true, stylePath });
    expect(await echo.requests()).toHaveLength(0);
  });

  test('webhook failure keeps the typed data and allows a retry', async ({ page, echo }) => {
    await echo.setMode({ status: 503, times: 1 });
    await page.goto('/support');
    await page.getByLabel('Full name').fill(MAYA.fullName);
    await page.getByLabel('Booking reference').fill('FLY-48213');
    await page.getByLabel('Email').fill('maya.chen@example.com');
    await page.getByLabel('Issue category').selectOption(MAYA.category);
    await page.getByLabel('Description').fill(MAYA.description);
    await submit(page);
    await expect(page.locator('.alert-error')).toContainText('Your ticket could not be sent right now.');
    await expect(page.getByLabel('Full name')).toHaveValue(MAYA.fullName);
    await expect(page.getByLabel('Description')).toHaveValue(MAYA.description);

    await submit(page);
    await expect(page.getByTestId('ticket-id')).toHaveText('FLY-SUP-1002');
    expect(await echo.requests('/support-hook')).toHaveLength(2);
  });

  test('voice call reports not configured when XAI_API_KEY is unset', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await page.addInitScript(() => {
      const silent = () => {
        const ctx = new AudioContext();
        return ctx.createMediaStreamDestination().stream;
      };
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: async () => silent() },
        configurable: true,
      });
    });
    await page.goto('/support');
    await page.getByRole('button', { name: 'Call FlyLo-Air Support' }).click();
    await expect(page.locator('.call-state')).toContainText(/not configured|Use the form/i);
    await expect(page.getByLabel('Full name')).toBeEditable();
  });

  // Known issue on main: SupportCall means to focus the "Ticket received" heading, but focus falls back to <body>.
  test.fixme('success view moves focus to the "Ticket received" heading', async ({ page }) => {
    await page.goto('/support');
    await page.getByLabel('Full name').fill(MAYA.fullName);
    await page.getByLabel('Booking reference').fill('FLY-48213');
    await page.getByLabel('Email').fill('maya.chen@example.com');
    await page.getByLabel('Issue category').selectOption(MAYA.category);
    await page.getByLabel('Description').fill(MAYA.description);
    await submit(page);
    await expect(page.getByRole('heading', { name: 'Ticket received' })).toBeFocused();
  });

  test('"Start a new request" clears the form', async ({ page }) => {
    await page.goto('/support');
    await page.getByLabel('Full name').fill(MAYA.fullName);
    await page.getByLabel('Booking reference').fill('FLY-48213');
    await page.getByLabel('Email').fill('maya.chen@example.com');
    await page.getByLabel('Issue category').selectOption(MAYA.category);
    await page.getByLabel('Description').fill(MAYA.description);
    await submit(page);
    await page.getByRole('button', { name: 'Start a new request' }).click();
    await expect(page.getByLabel('Full name')).toHaveValue('');
    await expect(page.getByLabel('Description')).toHaveValue('');
  });
});
