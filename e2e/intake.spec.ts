import { test, expect } from './fixtures/echo';
import { field, fillLakeline, LAKELINE_URL, MAYA, submit } from './fixtures/intake';
import { saveMedia } from './fixtures/media';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test.describe('/intake routing', () => {
  test('no scenario shows the catalog', async ({ page }) => {
    await page.goto('/intake');
    await expect(page.getByRole('heading', { level: 1, name: 'Choose a scenario' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Lakeline Auto Finance' })).toHaveAttribute('href', LAKELINE_URL);
    await expect(page.getByRole('link', { name: 'FlyLo-Air', exact: true })).toHaveAttribute('href', /\/support\/?$/);
  });

  test('unknown scenario shows a friendly not-found page @mobile', async ({ page }, testInfo) => {
    const response = await page.goto('/intake?scenario=does-not-exist');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { level: 1, name: 'That scenario was not found' })).toBeVisible();
    await expect(page.getByText('Nothing is registered as "does-not-exist".')).toBeVisible();
    await saveMedia(page, testInfo, 'intake-unknown-scenario');
  });

  test('markup in the scenario id is shown as text', async ({ page }) => {
    let dialogs = 0;
    page.on('dialog', (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });
    await page.goto(`/intake?scenario=${encodeURIComponent('<img src=x onerror=alert(1)>')}`);
    await expect(page.getByText('Nothing is registered as "<img src=x onerror=alert(1)>".')).toBeVisible();
    expect(dialogs).toBe(0);
  });

  test('flylo-support scenario redirects to /support', async ({ page }) => {
    await page.goto('/intake?scenario=flylo-support');
    await expect(page).toHaveURL(/\/support\/?$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Call FlyLo-Air Support' })).toBeVisible();
  });
});

test.describe('/intake?scenario=lakeline-hardship', () => {
  test('empty form @mobile', async ({ page, echo }, testInfo) => {
    await page.goto(LAKELINE_URL);
    await expect(page.getByRole('heading', { level: 1, name: 'Request a payment change' })).toBeVisible();
    await expect(page.getByText('Lakeline Auto Finance').first()).toBeVisible();
    for (const key of ['fullName', 'loanNumber', 'email', 'reason', 'requestedChange', 'callbackWindow'] as const) {
      await expect(field(page, key)).toBeVisible();
      await expect(field(page, key)).toHaveValue('');
    }
    await expect(page.getByRole('button', { name: 'Call Lakeline Auto Finance' })).toBeVisible();
    await saveMedia(page, testInfo, 'intake-lakeline-empty');
    expect(await echo.requests()).toHaveLength(0);
  });

  test('typed fill submits the scenario payload to the Lakeline webhook @mobile', async ({ page, echo }, testInfo) => {
    await page.goto(LAKELINE_URL);
    await fillLakeline(page, MAYA);
    await field(page, 'callbackWindow').press('Tab');
    await expect(field(page, 'loanNumber')).toHaveValue('LAF-20417');
    await saveMedia(page, testInfo, 'intake-lakeline-filled');

    const browserRequest = page.waitForRequest((req) => req.url().endsWith('/api/tickets') && req.method() === 'POST');
    await submit(page);
    const sent = (await browserRequest).postDataJSON();
    expect(sent).toEqual({
      scenario: 'lakeline-hardship',
      channel: 'web',
      fields: {
        fullName: 'Maya Chen',
        loanNumber: 'LAF-20417',
        email: 'maya.chen@example.com',
        reason: MAYA.reason,
        requestedChange: 'Payment extension',
        callbackWindow: 'Afternoons',
      },
    });

    await expect(page.getByTestId('ticket-id')).toHaveText('LAF-REQ-1001');
    await expect(page.getByRole('heading', { name: 'Request received' })).toBeVisible();
    await expect(page.getByText('Submitting does not approve a change.')).toBeVisible();
    await saveMedia(page, testInfo, 'intake-lakeline-received');

    const hooks = await echo.waitForRequests(1, '/lakeline-hook');
    expect(await echo.requests('/support-hook')).toHaveLength(0);
    const hook = hooks[0];
    expect(hook.headers['x-e2e-key']).toBe('e2e-lakeline-key');
    const body = hook.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['scenario', 'id', 'createdAt', 'channel', 'fields', 'category', 'summary', 'description']);
    expect(body).toMatchObject({
      scenario: 'lakeline-hardship',
      id: 'LAF-REQ-1001',
      createdAt: expect.stringMatching(ISO),
      channel: 'web',
      category: 'Payment extension',
      summary: `Payment extension request from Maya Chen (LAF-20417): ${MAYA.reason}`,
    });
    expect(body.description).toContain('Maya Chen (loan LAF-20417, maya.chen@example.com) requested Payment extension.');
  });

  test('empty submit lists every missing field and sends nothing', async ({ page, echo }, testInfo) => {
    await page.goto(LAKELINE_URL);
    await field(page, 'fullName').fill('Maya Chen');
    await field(page, 'loanNumber').fill('LAF-2O417');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    const alert = page.locator('.alert-error');
    await expect(alert).toContainText('Check the highlighted fields, then press Submit again.');
    await expect(alert.getByRole('link')).toHaveText([
      'Enter a loan number like LAF-20417.',
      'Enter an email like name@example.com.',
      'Tell us what happened in a sentence or two.',
      'Choose the change you need.',
      'Enter the best time to call you.',
    ]);
    await expect(page.locator('div[tabindex="-1"]:has(> .alert-error)')).toBeFocused();
    await expect(field(page, 'loanNumber')).toHaveAttribute('aria-invalid', 'true');
    await saveMedia(page, testInfo, 'intake-lakeline-validation');

    await alert.getByRole('link', { name: 'Enter a loan number like LAF-20417.' }).click();
    await expect(page).toHaveURL(/#intake-loanNumber$/);
    expect(await echo.requests()).toHaveLength(0);
  });

  test('double-click Submit sends exactly one ticket', async ({ page, echo }) => {
    await echo.setMode({ status: 200, delayMs: 1500 });
    await page.goto(LAKELINE_URL);
    await fillLakeline(page, MAYA);
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Submit', exact: true }).dblclick();
    await expect(page.getByTestId('ticket-id')).toHaveText('LAF-REQ-1001');
    await page.waitForTimeout(500);
    expect(await echo.requests('/lakeline-hook')).toHaveLength(1);
  });

  test('Enter pressed repeatedly in a field sends exactly one ticket', async ({ page, echo }) => {
    await echo.setMode({ status: 200, delayMs: 1500 });
    await page.goto(LAKELINE_URL);
    await fillLakeline(page, MAYA);
    await page.waitForTimeout(700);
    const input = field(page, 'callbackWindow');
    await input.press('Enter');
    await input.press('Enter').catch(() => undefined);
    await input.press('Enter').catch(() => undefined);
    await expect(page.getByTestId('ticket-id')).toHaveText('LAF-REQ-1001');
    expect(await echo.requests('/lakeline-hook')).toHaveLength(1);
  });

  test('Submit shows a sending state while the webhook is slow', async ({ page, echo }) => {
    await echo.setMode({ status: 200, delayMs: 2000, times: 1 });
    await page.goto(LAKELINE_URL);
    await fillLakeline(page, MAYA);
    await submit(page);
    await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    await expect(page.getByTestId('ticket-id')).toHaveText('LAF-REQ-1001');
  });

  for (const status of [500, 404, 302]) {
    test(`webhook ${status} shows a friendly error, keeps the data and allows a retry`, async ({ page, echo }, testInfo) => {
      await echo.setMode({ status, times: 1 });
      await page.goto(LAKELINE_URL);
      await fillLakeline(page, MAYA);
      await submit(page);
      const alert = page.locator('.alert-error');
      await expect(alert).toContainText('Your request could not be sent right now.');
      await expect(page.locator('div[tabindex="-1"]:has(> .alert-error)')).toBeFocused();
      await expect(field(page, 'fullName')).toHaveValue('Maya Chen');
      await expect(field(page, 'reason')).toHaveValue(MAYA.reason);
      await expect(field(page, 'requestedChange')).toHaveValue('Payment extension');
      if (status === 500) await saveMedia(page, testInfo, 'intake-lakeline-send-error');

      await submit(page);
      await expect(page.getByTestId('ticket-id')).toHaveText(/^LAF-REQ-\d{4}$/);
      const hooks = await echo.requests('/lakeline-hook');
      expect(hooks).toHaveLength(2);
      expect((hooks[1].body as { fields: unknown }).fields).toEqual((hooks[0].body as { fields: unknown }).fields);
    });
  }

  test('webhook timeout shows a friendly error and a retry succeeds', async ({ page, echo }) => {
    test.setTimeout(45_000);
    await echo.setMode({ status: 200, delayMs: 11_000, times: 1 });
    await page.goto(LAKELINE_URL);
    await fillLakeline(page, MAYA);
    await submit(page);
    await expect(page.locator('.alert-error')).toContainText('Your request could not be sent right now.', { timeout: 15_000 });
    await expect(field(page, 'email')).toHaveValue('maya.chen@example.com');
    await submit(page);
    await expect(page.getByTestId('ticket-id')).toHaveText(/^LAF-REQ-\d{4}$/);
  });

  test('"Start a new request" clears every field', async ({ page }) => {
    await page.goto(LAKELINE_URL);
    await fillLakeline(page, MAYA);
    await submit(page);
    await page.getByRole('button', { name: 'Start a new request' }).click();
    for (const key of ['fullName', 'loanNumber', 'email', 'reason', 'requestedChange', 'callbackWindow'] as const) {
      await expect(field(page, key)).toHaveValue('');
    }
    await page.reload();
    await expect(field(page, 'fullName')).toHaveValue('');
  });

  test('Spanish and unicode text round-trips unchanged', async ({ page, echo }) => {
    const reason = 'Tuve una factura médica y necesito aplazar el pago — 王小明 dice “gracias”.';
    await page.goto(LAKELINE_URL);
    await fillLakeline(page, { ...MAYA, fullName: 'María José Núñez', reason, callbackWindow: 'Por las tardes' });
    await submit(page);
    await expect(page.getByTestId('ticket-id')).toHaveText('LAF-REQ-1001');
    await expect(page.getByText('Thanks, María.')).toBeVisible();
    const [hook] = await echo.waitForRequests(1, '/lakeline-hook');
    expect((hook.body as { fields: Record<string, string> }).fields).toMatchObject({
      fullName: 'María José Núñez',
      reason,
      callbackWindow: 'Por las tardes',
    });
  });

  test('very long reason is capped at 2,000 characters by the field', async ({ page, echo }) => {
    await page.goto(LAKELINE_URL);
    await fillLakeline(page, { ...MAYA, reason: 'x'.repeat(10) + ' word'.repeat(600) });
    expect((await field(page, 'reason').inputValue()).length).toBe(2000);
    await submit(page);
    await expect(page.getByTestId('ticket-id')).toHaveText('LAF-REQ-1001');
    const [hook] = await echo.waitForRequests(1, '/lakeline-hook');
    expect((hook.body as { fields: { reason: string } }).fields.reason.length).toBe(2000);
  });

  test('keyboard only: tab order follows the form and Enter submits', async ({ page, echo }) => {
    await page.goto(LAKELINE_URL);
    await field(page, 'fullName').focus();
    await page.keyboard.type('Maya Chen');
    await page.keyboard.press('Tab');
    await expect(field(page, 'loanNumber')).toBeFocused();
    await page.keyboard.type('laf20417');
    await page.keyboard.press('Tab');
    await expect(field(page, 'loanNumber')).toHaveValue('LAF-20417');
    await expect(field(page, 'email')).toBeFocused();
    await page.keyboard.type('maya.chen@example.com');
    await page.keyboard.press('Tab');
    await expect(field(page, 'reason')).toBeFocused();
    await page.keyboard.type(MAYA.reason);
    await page.keyboard.press('Tab');
    await expect(field(page, 'requestedChange')).toBeFocused();
    await field(page, 'requestedChange').selectOption('Payment extension');
    await page.keyboard.press('Tab');
    await expect(field(page, 'callbackWindow')).toBeFocused();
    await page.keyboard.type('Afternoons');
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('ticket-id')).toHaveText('LAF-REQ-1001');
    expect(await echo.requests('/lakeline-hook')).toHaveLength(1);
  });

  test('every field has a visible label tied to its control', async ({ page }) => {
    await page.goto(LAKELINE_URL);
    for (const label of ['Full name', 'Loan number', 'Email', 'Reason', 'Requested change', 'Best callback window']) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    await expect(field(page, 'loanNumber')).toHaveAttribute('aria-describedby', 'intake-loanNumber-hint');
  });
});
