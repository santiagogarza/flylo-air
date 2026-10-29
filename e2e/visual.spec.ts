import { expect, test } from './fixtures';
import { expectedTrip, pickTravelDate } from './support/trips';

// Fares, times and dates are generated from today's date, so those regions are masked
// and the snapshots cover layout, typography and color.
test.describe('Visual snapshots at 1280px', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('home', async ({ page, home }) => {
    await home.goto();
    await expect(home.heroHeading).toBeVisible();
    await expect(page).toHaveScreenshot('home.png', {
      fullPage: true,
      mask: [home.search.date, home.popularRoutes.getByText(/^From \$/)],
    });
  });

  test('results', async ({ page, results }) => {
    const date = pickTravelDate();
    await page.goto(`/results?from=SFO&to=JFK&date=${date}&passengers=1`);
    await expect(results.flightList).toBeVisible();
    await expect(page).toHaveScreenshot('results.png', {
      mask: [
        page.getByText(/ · One way · /),
        results.summary(expectedTrip('SFO', 'JFK', date).flights.length).locator('..'),
        results.flightList.getByRole('paragraph'),
        results.flightList.getByText(/^\$/),
      ],
    });
  });

  test('checkout', async ({ page, results, checkout }) => {
    const date = pickTravelDate();
    const flight = expectedTrip('SFO', 'JFK', date).flights[0];
    await page.goto(`/results?from=SFO&to=JFK&date=${date}&passengers=1`);
    await results.fareLink(flight, flight.fares[1]).click();
    await expect(checkout.heading).toBeVisible();
    await expect(page).toHaveScreenshot('checkout.png', {
      fullPage: true,
      mask: [checkout.pay, checkout.summary.getByRole('paragraph'), checkout.summary.getByRole('list')],
    });
  });
});
