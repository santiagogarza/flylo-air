import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, RESET_KEY } from './fixtures/echo';
import { fillLakeline, LAKELINE_URL, MAYA, submit } from './fixtures/intake';
import { saveMedia } from './fixtures/media';
import { VALID_CASES } from '../test/fixtures/lakeline-cases';

const QUEUE = '/intake/review?scenario=lakeline-hardship';
const SEEDED = 11;

// PR 2 keeps cases in module memory that the /api/cases routes and the review pages do not share in a production build,
// so actions and ingests never reach the UI. Flip to false once the fix lands on cursor/intake-review-queue-e564.
const SHARED_STATE_BUG = true;
const knownStateBug = () => test.fail(SHARED_STATE_BUG, 'review pages do not see API-side case state (reported)');

async function ingest(api: APIRequestContext, body: unknown, headers: Record<string, string> = { authorization: `Bearer ${RESET_KEY}` }) {
  return api.post('/api/cases', { data: body, headers });
}

async function openCase(page: Page, name: string) {
  await page.goto(QUEUE);
  await page.locator('.case-list a', { hasText: name }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: 'Customer request' })).toBeVisible();
}

async function reviewer(page: Page, name = 'QA Reviewer') {
  await page.getByLabel('Your name').fill(name);
}

test.describe('review queue', () => {
  test('lists the seeded cases with compliance first @mobile', async ({ page }, testInfo) => {
    await page.goto(QUEUE);
    await expect(page.getByRole('heading', { level: 1, name: 'Cases to review' })).toBeVisible();
    await expect(page.locator('.case-list li')).toHaveCount(SEEDED);
    await expect(page.getByRole('link', { name: `All (${SEEDED})` })).toBeVisible();
    await expect(page.getByRole('link', { name: `Needs review (${SEEDED})` })).toBeVisible();
    await expect(page.locator('.case-list li').first()).toContainText('ESCALATE');
    await expect(page.locator('.case-list li').last()).toContainText(/APPROVE_/);
    await saveMedia(page, testInfo, 'review-queue');
  });

  test('status filter shows an empty state', async ({ page }) => {
    await page.goto(`${QUEUE}&status=sent`);
    await expect(page.getByText('No cases in this filter.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sent (0)', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('unknown scenario and unknown case are friendly', async ({ page }) => {
    await page.goto('/intake/review?scenario=nope');
    await expect(page.getByRole('heading', { level: 1, name: 'That scenario was not found' })).toBeVisible();
    await page.goto('/intake/review/LAF-REQ-0000?scenario=lakeline-hardship');
    await expect(page.getByRole('heading', { level: 1, name: 'Case not found' })).toBeVisible();
  });
});

test.describe('case detail', () => {
  test('Why panel cites passing policy rules and links into the policy @mobile', async ({ page }, testInfo) => {
    await openCase(page, 'Maya Chen');
    await expect(page.locator('.page-head .eyebrow')).toHaveText('APPROVE_EXTENSION');
    const why = page.locator('.rule');
    await expect(why.first()).toContainText('Policy §1 Compliance stops');
    await expect(why.first()).toContainText('Pass');
    await expect(why.nth(1)).toContainText('Policy §2 Extension eligibility');
    await expect(page.getByText('Present').first()).toBeVisible();
    await expect(page.getByText('Missing', { exact: true })).toHaveCount(0);
    await saveMedia(page, testInfo, 'review-case-detail');

    await why.nth(1).getByRole('link').click();
    await expect(page).toHaveURL(/\/intake\/policy\?scenario=lakeline-hardship#s2$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Hardship policy' })).toBeVisible();
    await expect(page.locator('#s2')).toBeVisible();
  });

  test('compliance case shows the stop and a Compliance handoff', async ({ page }) => {
    await openCase(page, 'Kevin Walsh');
    await expect(page.locator('.page-head .eyebrow')).toHaveText('ESCALATE');
    await expect(page.locator('.rule').first()).toContainText('Fail');
    await expect(page.getByRole('heading', { name: 'Escalation handoff' })).toBeVisible();
    await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Escalation handoff' }) })).toContainText('Compliance');
  });

  test('Send records once; a second Send is a no-op; nothing calls a webhook', async ({ page, echo }) => {
    knownStateBug();
    await openCase(page, 'Maya Chen');
    await reviewer(page);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Nothing was emailed.' })).toHaveText('Recorded in the demo queue. Nothing was emailed.');
    await expect(page.getByText('Current status: sent')).toBeVisible();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Nothing was emailed.' })).toHaveText('Already recorded. Nothing was emailed.');
    await expect(page.locator('li', { hasText: '· sent · QA Reviewer' })).toHaveCount(1);
    expect(await echo.requests()).toHaveLength(0);
  });

  test('double-click Send records one action', async ({ page }) => {
    knownStateBug();
    await openCase(page, 'Daniel Ortiz');
    await reviewer(page);
    await page.getByRole('button', { name: 'Send', exact: true }).dblclick();
    await expect(page.getByText('Current status: sent')).toBeVisible();
    await page.reload();
    await expect(page.locator('li', { hasText: '· sent · QA Reviewer' })).toHaveCount(1);
  });

  test('edit the draft, then send it', async ({ page }) => {
    knownStateBug();
    await openCase(page, 'Priya Raman');
    await reviewer(page);
    const draft = page.getByLabel('Draft reply');
    const original = await draft.inputValue();
    expect(original).toContain('Missing a plan payment may end the plan');
    await draft.fill(`${original} We are sorry for the trouble.`);
    await expect(page.getByRole('button', { name: 'Edit & send' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit & send' }).click();
    await expect(page.getByText('Current status: edited sent')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Draft reply')).toHaveValue(`${original} We are sorry for the trouble.`);
    await expect(page.getByText('Verdict: Edited')).toBeVisible();
    await expect(page.getByText('Reviewer edited the draft before sending.')).toBeVisible();
  });

  test('actions need a reviewer name', async ({ page }) => {
    await openCase(page, 'Jordan Blake');
    await page.getByLabel('Your name').fill('');
    await page.getByRole('button', { name: 'Escalate' }).click();
    await expect(page.getByRole('status').last()).toContainText('by is required');
    await expect(page.getByText('Current status: needs review')).toBeVisible();
  });

  test('Escalate and Reject move the case between filters', async ({ page }) => {
    knownStateBug();
    await openCase(page, 'Jordan Blake');
    await reviewer(page);
    await page.getByRole('button', { name: 'Escalate' }).click();
    await expect(page.getByText('Current status: escalated')).toBeVisible();
    await openCase(page, 'Samuel Okafor');
    await reviewer(page);
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText('Current status: rejected')).toBeVisible();
    await page.goto(QUEUE);
    await expect(page.getByRole('link', { name: 'Escalated (1)' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rejected (1)' })).toBeVisible();
    await expect(page.getByRole('link', { name: `Needs review (${SEEDED - 2})` })).toBeVisible();
  });

  test('reviewer name is remembered for the session', async ({ page }) => {
    knownStateBug();
    await openCase(page, 'Grace Kim');
    await reviewer(page, 'Santi');
    await page.getByRole('button', { name: 'Request changes' }).click();
    await expect(page.getByText('Current status: changes requested')).toBeVisible();
    await openCase(page, 'Marcus Reed');
    await expect(page.getByLabel('Your name')).toHaveValue('Santi');
  });
});

test.describe('POST /api/cases ingest', () => {
  test('bad auth is 401 and bad schema is 400 with a clear message', async ({ request }) => {
    const unauth = await ingest(request, { ticketId: 'QA-1', scenario: 'lakeline-hardship', request: { loanNumber: 'LAF-20417' } }, { authorization: 'Bearer wrong' });
    expect(unauth.status()).toBe(401);
    expect((await unauth.json()).error).toMatch(/Unauthorized/);
    const noKey = await ingest(request, {}, {});
    expect(noKey.status()).toBe(401);
    const bad = await ingest(request, { ticketId: 'QA-1', scenario: 'lakeline-hardship', request: { fullName: 'Maya' } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toBe('request.loanNumber is required.');
  });

  test('the reset-key header also works when no ingest key is set', async ({ request }) => {
    const response = await ingest(
      request,
      { ticketId: 'QA-HDR-1', scenario: 'lakeline-hardship', request: { loanNumber: 'LAF-20417', fullName: 'Maya Chen', requestedChange: 'Payment extension', reason: 'Medical bill.' } },
      { 'x-demo-reset-key': RESET_KEY },
    );
    expect(response.status()).toBe(201);
  });

  test('all valid synthetic cases ingest and appear in the queue', async ({ page, request }, testInfo) => {
    knownStateBug();
    test.setTimeout(60_000);
    for (const [index, item] of VALID_CASES.entries()) {
      const response = await ingest(request, { ticketId: `QA-${3000 + index}`, scenario: 'lakeline-hardship', channel: item.channel, fields: item.input });
      expect(response.status(), item.id).toBe(201);
    }
    await page.goto(QUEUE);
    await expect(page.getByRole('link', { name: `All (${SEEDED + VALID_CASES.length})` })).toBeVisible();
    await expect(page.locator('.case-list li')).toHaveCount(SEEDED + VALID_CASES.length);
    await saveMedia(page, testInfo, 'review-queue-all-cases');
  });

  test('markup in an ingested case renders as text', async ({ page, request }) => {
    knownStateBug();
    let dialogs = 0;
    page.on('dialog', (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });
    const reason = '<img src=x onerror=alert(1)> <script>alert(2)</script> please help';
    await ingest(request, { ticketId: 'QA-XSS-1', scenario: 'lakeline-hardship', fields: { ...MAYA, loanNumber: 'LAF-20417', reason } });
    await page.goto('/intake/review/QA-XSS-1?scenario=lakeline-hardship');
    await expect(page.getByText(reason)).toBeVisible();
    expect(dialogs).toBe(0);
  });
});

test.describe('reset', () => {
  test('clears tickets and cases together', async ({ page, request, baseURL }) => {
    knownStateBug();
    await page.goto(LAKELINE_URL);
    await fillLakeline(page, MAYA);
    await submit(page);
    await expect(page.getByTestId('ticket-id')).toHaveText('LAF-REQ-1001');

    await ingest(request, { ticketId: 'QA-RESET-1', scenario: 'lakeline-hardship', request: { loanNumber: 'LAF-20417' } });
    await openCase(page, 'Maya Chen');
    await reviewer(page);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Current status: sent')).toBeVisible();

    const unauthorized = await request.post(`${baseURL}/api/reset`, { headers: { 'x-demo-reset-key': 'nope' } });
    expect(unauthorized.status()).toBe(401);
    const reset = await request.post(`${baseURL}/api/reset`, { headers: { 'x-demo-reset-key': RESET_KEY } });
    expect(await reset.json()).toMatchObject({ ok: true, cleared: 1 });

    await page.goto(QUEUE);
    await expect(page.locator('.case-list li')).toHaveCount(SEEDED);
    await expect(page.getByRole('link', { name: `Needs review (${SEEDED})` })).toBeVisible();
    await page.goto('/intake/review/QA-RESET-1?scenario=lakeline-hardship');
    await expect(page.getByRole('heading', { name: 'Case not found' })).toBeVisible();

    await page.goto(LAKELINE_URL);
    await fillLakeline(page, MAYA);
    await submit(page);
    await expect(page.getByTestId('ticket-id')).toHaveText('LAF-REQ-1001');
  });
});

test.describe('/intake/policy', () => {
  test('renders every policy section with an anchor @mobile', async ({ page }, testInfo) => {
    await page.goto('/intake/policy?scenario=lakeline-hardship');
    await expect(page.getByRole('heading', { level: 1, name: 'Hardship policy' })).toBeVisible();
    for (const id of ['s1', 's2', 's3', 's4', 's5', 's6']) await expect(page.locator(`#${id}`)).toBeVisible();
    await expect(page.getByText('1-800-555-0142').first()).toBeVisible();
    await saveMedia(page, testInfo, 'policy');
  });

  test('scenario without a policy says so', async ({ page }) => {
    await page.goto('/intake/policy?scenario=flylo-support');
    await expect(page.getByRole('heading', { level: 1, name: 'No policy for this scenario' })).toBeVisible();
  });
});
