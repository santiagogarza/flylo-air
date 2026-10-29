import type { Locator, Page } from '@playwright/test';
import { waitForHydration } from '../support/hydration';
import { SearchFormSection } from './search-form';

export class HomePage {
  readonly heroHeading: Locator;
  readonly popularRoutes: Locator;
  readonly search: SearchFormSection;

  constructor(readonly page: Page) {
    this.heroHeading = page.getByRole('heading', { level: 1, name: 'Fly more. Pay less.' });
    this.popularRoutes = page.getByRole('region', { name: 'Popular routes' });
    this.search = new SearchFormSection(page.getByRole('form', { name: 'Search flights' }));
  }

  async goto() {
    await this.page.goto('/');
    await waitForHydration(this.search.submit);
  }

  popularRoute(from: string, to: string): Locator {
    return this.popularRoutes.getByRole('link', { name: new RegExp(`${from} → ${to}`) });
  }
}
