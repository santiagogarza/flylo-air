import { expect, test } from './fixtures';
import { expectedTrip, farePrice, pickTravelDate, tripDateLabel } from './support/trips';

test.describe('Search to results', () => {
  test('SFO to JFK for one traveler lists every flight and fare', async ({ page, home, results }) => {
    const date = pickTravelDate();
    const trip = expectedTrip('SFO', 'JFK', date);

    await home.goto();
    await home.search.fill({ from: 'SFO', to: 'JFK', date, travelers: 1 });
    await home.search.submit.click();

    await expect(page).toHaveURL(`/results?from=SFO&to=JFK&date=${date}&passengers=1`);
    await expect(page).toHaveTitle('Choose a flight · FlyLo-Air');
    await expect(results.step).toBeVisible();
    await expect(results.routeHeading).toHaveText('San Francisco to New York');
    await expect(page.getByText(`${tripDateLabel(date)} · One way · 1 traveler`)).toBeVisible();
    await expect(results.summary(trip.flights.length)).toBeVisible();
    await expect(results.flightList.getByRole('listitem')).toHaveCount(trip.flights.length);

    for (const flight of trip.flights) {
      await expect(results.flight(flight)).toBeVisible();
      for (const fare of flight.fares) {
        const link = results.fareLink(flight, fare);
        await expect(link).toContainText(farePrice(fare));
        await expect(link).toHaveAttribute(
          'href',
          `/checkout?flight=${encodeURIComponent(flight.id)}&fare=${fare.key}&passengers=1`,
        );
      }
    }
  });

  test('Edit search runs a new search', async ({ page, results }) => {
    const date = pickTravelDate();
    await page.goto(`/results?from=SFO&to=JFK&date=${date}&passengers=1`);
    await expect(results.routeHeading).toHaveText('San Francisco to New York');

    await expect(results.editSearch.root).toBeHidden();
    await results.editSearchToggle.click();
    await expect(results.editSearch.from).toHaveValue('SFO');
    await expect(results.editSearch.to).toHaveValue('JFK');
    await expect(results.editSearch.date).toHaveValue(date);

    const trip = expectedTrip('SFO', 'HNL', date);
    await results.editSearch.to.selectOption('HNL');
    await results.editSearch.submit.click();

    await expect(page).toHaveURL(`/results?from=SFO&to=HNL&date=${date}&passengers=1`);
    await expect(results.routeHeading).toHaveText('San Francisco to Honolulu');
    await expect(results.summary(trip.flights.length)).toBeVisible();
    await expect(results.fareLink(trip.flights[0], trip.flights[0].fares[0])).toBeVisible();
  });
});
