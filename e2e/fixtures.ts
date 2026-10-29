import { test as base } from '@playwright/test';
import { CheckoutPage } from './pages/checkout-page';
import { HomePage } from './pages/home-page';
import { ResultsPage } from './pages/results-page';
import { SupportPage } from './pages/support-page';

type Pages = {
  home: HomePage;
  results: ResultsPage;
  checkout: CheckoutPage;
  support: SupportPage;
};

export const test = base.extend<Pages>({
  home: async ({ page }, use) => use(new HomePage(page)),
  results: async ({ page }, use) => use(new ResultsPage(page)),
  checkout: async ({ page }, use) => use(new CheckoutPage(page)),
  support: async ({ page }, use) => use(new SupportPage(page)),
});

export { expect } from '@playwright/test';
