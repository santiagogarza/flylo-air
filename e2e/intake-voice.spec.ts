import { test, expect } from './fixtures/echo';
import { field, LAKELINE_URL, LIVE_TICKET_ID_PATTERN, submit } from './fixtures/intake';
import { saveMedia } from './fixtures/media';
import { installFakeVoice, voiceDrop, voiceSetField } from './fixtures/voice';

test.describe('lakeline voice call (mocked socket and mic)', () => {
  test('mic permission denied keeps the form usable', async ({ page }, testInfo) => {
    await installFakeVoice(page, { mic: 'denied' });
    await page.goto(LAKELINE_URL);
    await page.getByRole('button', { name: 'Call Lakeline Auto Finance' }).click();
    await expect(page.locator('.call-state')).toHaveText('The microphone is blocked. Allow it in the browser, or use the form.');
    await expect(field(page, 'fullName')).toBeEditable();
    await expect(page.getByRole('button', { name: 'Call again' })).toBeVisible();
    await saveMedia(page, testInfo, 'intake-lakeline-mic-denied');
  });

  test('no microphone device shows the unavailable message', async ({ page }) => {
    await installFakeVoice(page, { mic: 'missing' });
    await page.goto(LAKELINE_URL);
    await page.getByRole('button', { name: 'Call Lakeline Auto Finance' }).click();
    await expect(page.locator('.call-state')).toHaveText('The microphone could not be opened. Use the form.');
  });

  test('voice not configured on the server falls back to the form', async ({ page }) => {
    await installFakeVoice(page);
    await page.unroute('**/api/voice/session');
    await page.goto(LAKELINE_URL);
    await page.getByRole('button', { name: 'Call Lakeline Auto Finance' }).click();
    await expect(page.locator('.call-state')).toContainText('Use the form');
    await expect(field(page, 'fullName')).toBeEditable();
  });

  test('call fills fields, then drops mid-call without losing them', async ({ page, echo }, testInfo) => {
    await installFakeVoice(page);
    await page.goto(LAKELINE_URL);
    await page.getByRole('button', { name: 'Call Lakeline Auto Finance' }).click();
    await expect(page.locator('.call-state')).toHaveText('Live. The microphone is on.');
    await expect(page.getByRole('button', { name: 'Hang up' })).toBeVisible();

    await voiceSetField(page, 'fullName', 'Maya Chen');
    await voiceSetField(page, 'loanNumber', 'laf 20417');
    await voiceSetField(page, 'email', 'Maya.Chen@Example.com');
    await expect(field(page, 'fullName')).toHaveValue('Maya Chen');
    await expect(field(page, 'loanNumber')).toHaveValue('LAF-20417');
    await expect(field(page, 'email')).toHaveValue('maya.chen@example.com');
    await expect(page.locator('.field.is-filled')).toHaveCount(3);
    await expect(page.locator('.call-needed li')).toHaveText(['Reason', 'Requested change', 'Best callback window']);
    await saveMedia(page, testInfo, 'intake-lakeline-call-live');

    await voiceDrop(page);
    await expect(page.locator('.call-state')).toHaveText('The call was interrupted. Use the form.');
    await expect(field(page, 'fullName')).toHaveValue('Maya Chen');
    await expect(field(page, 'loanNumber')).toHaveValue('LAF-20417');
    await saveMedia(page, testInfo, 'intake-lakeline-call-dropped');

    await field(page, 'reason').fill('I had a medical bill this month and need to push my payment back.');
    await field(page, 'requestedChange').selectOption('Payment extension');
    await field(page, 'callbackWindow').fill('Afternoons');
    await submit(page);
    await expect(page.getByTestId('ticket-id')).toHaveText(LIVE_TICKET_ID_PATTERN);
    const [hook] = await echo.waitForRequests(1, '/lakeline-hook');
    expect((hook.body as { channel: string }).channel).toBe('voice');
  });

  test('spoken request type maps onto the select', async ({ page }) => {
    await installFakeVoice(page);
    await page.goto(LAKELINE_URL);
    await page.getByRole('button', { name: 'Call Lakeline Auto Finance' }).click();
    await expect(page.locator('.call-state')).toHaveText('Live. The microphone is on.');
    await voiceSetField(page, 'requestedChange', 'push my payment back');
    await expect(field(page, 'requestedChange')).toHaveValue('Payment extension');
    await voiceSetField(page, 'requestedChange', 'change my due date');
    await expect(field(page, 'requestedChange')).toHaveValue('Due-date change');
  });

  test('a garbled spoken loan number is kept visible with the format hint', async ({ page }) => {
    await installFakeVoice(page);
    await page.goto(LAKELINE_URL);
    await page.getByRole('button', { name: 'Call Lakeline Auto Finance' }).click();
    await expect(page.locator('.call-state')).toHaveText('Live. The microphone is on.');
    await voiceSetField(page, 'loanNumber', 'two oh four one seven');
    await expect(field(page, 'loanNumber')).not.toHaveValue('LAF-20417');
    await expect(page.getByText('Like LAF-20417. Spaces and capitalization are fine.')).toBeVisible();
  });

  test('Esc hangs up the call', async ({ page }) => {
    await installFakeVoice(page);
    await page.goto(LAKELINE_URL);
    await page.getByRole('button', { name: 'Call Lakeline Auto Finance' }).click();
    await expect(page.locator('.call-state')).toHaveText('Live. The microphone is on.');
    await page.keyboard.press('Escape');
    await expect(page.locator('.call-state')).toHaveText('Call ended. Check the form, then press Submit.');
  });
});
