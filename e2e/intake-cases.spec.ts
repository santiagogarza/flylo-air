import { test, expect } from './fixtures/echo';
import { field, fillLakeline, LAKELINE_URL, LIVE_TICKET_ID_PATTERN, submit } from './fixtures/intake';
import { LAKELINE_CASES, type LakelineInput } from '../test/fixtures/lakeline-cases';

function uiInvalidFields(item: (typeof LAKELINE_CASES)[number]): string[] {
  return item.expect.invalidFields ?? [];
}

test.describe('every synthetic Lakeline case through the intake form', () => {
  for (const item of LAKELINE_CASES) {
    test(`${item.id}: ${item.title}`, async ({ page, echo }) => {
      await page.goto(LAKELINE_URL);
      await fillLakeline(page, item.input);
      const invalid = uiInvalidFields(item);
      if (Object.values(item.input).every((value) => !value.trim())) {
        // A blank form only offers Call; Submit appears once something is typed.
        await expect(page.getByRole('button', { name: 'Submit', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Call Lakeline Auto Finance' })).toBeVisible();
        return;
      }
      await submit(page);

      if (invalid.length === 0) {
        await expect(page.getByTestId('ticket-id')).toHaveText(LIVE_TICKET_ID_PATTERN);
        const [hook] = await echo.waitForRequests(1, '/lakeline-hook');
        const body = hook.body as { fields: Record<string, string>; category: string };
        if (item.expect.loanNumber) expect(body.fields.loanNumber).toBe(item.expect.loanNumber);
        expect(body.category).toBe(item.input.requestedChange);
        await expect(page.locator('script:not([src])', { hasText: 'alert("x")' })).toHaveCount(0);
      } else {
        await expect(page.locator('.alert-error')).toContainText('Check the highlighted fields');
        for (const key of invalid) {
          await expect(field(page, key as keyof LakelineInput), `${key} should be flagged`).toHaveAttribute('aria-invalid', 'true');
        }
        expect(await echo.requests()).toHaveLength(0);
      }
    });
  }
});
