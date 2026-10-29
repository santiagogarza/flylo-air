import type { Locator } from '@playwright/test';

export class SearchFormSection {
  readonly from: Locator;
  readonly to: Locator;
  readonly date: Locator;
  readonly travelers: Locator;
  readonly submit: Locator;
  readonly sameAirportError: Locator;

  constructor(readonly root: Locator) {
    this.from = root.getByLabel('From');
    this.to = root.getByLabel('To');
    this.date = root.getByLabel('Depart');
    this.travelers = root.getByLabel('Travelers');
    this.submit = root.getByRole('button', { name: 'Search flights' });
    this.sameAirportError = root.getByText('Choose a different destination.');
  }

  async fill({ from, to, date, travelers }: { from: string; to: string; date: string; travelers: number }) {
    await this.from.selectOption(from);
    await this.to.selectOption(to);
    await this.date.fill(date);
    await this.travelers.selectOption(String(travelers));
  }
}
