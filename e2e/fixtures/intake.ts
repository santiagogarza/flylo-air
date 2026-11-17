import type { Page } from '@playwright/test';
import type { LakelineInput } from '../../test/fixtures/lakeline-cases';

/** Live ids are sequence-based: a reset does not restart the counter, so tests match the shape, not a number. */
export const LIVE_TICKET_ID_PATTERN = /^LAF-REQ-\d+$/;

export const LAKELINE_URL = '/intake?scenario=lakeline-hardship';

export const LAKELINE_CATEGORIES = ['Payment extension', 'Due-date change', 'Payment plan', 'Payment portal problem', 'Other'];

// IntakeForm ignores a Submit click within 600ms of the primary button turning from Call into Submit.
const PRIMARY_SETTLE_MS = 700;

export const field = (page: Page, key: keyof LakelineInput) => page.locator(`#intake-${key}`);

export async function fillLakeline(page: Page, input: LakelineInput) {
  await field(page, 'fullName').fill(input.fullName);
  await field(page, 'loanNumber').fill(input.loanNumber);
  await field(page, 'email').fill(input.email);
  await field(page, 'reason').fill(input.reason);
  if (LAKELINE_CATEGORIES.includes(input.requestedChange)) {
    await field(page, 'requestedChange').selectOption(input.requestedChange);
  }
  await field(page, 'callbackWindow').fill(input.callbackWindow);
}

export async function submit(page: Page) {
  await page.waitForTimeout(PRIMARY_SETTLE_MS);
  await page.getByRole('button', { name: 'Submit', exact: true }).first().click();
}

export const MAYA: LakelineInput = {
  fullName: 'Maya Chen',
  loanNumber: 'laf 20417',
  email: ' Maya.Chen@Example.com ',
  reason: 'I had a medical bill this month and need to push my payment back a few weeks.',
  requestedChange: 'Payment extension',
  callbackWindow: 'Afternoons',
};
