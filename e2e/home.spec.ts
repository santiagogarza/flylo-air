import { defaultTravelDate } from '@/lib/dates';
import { expect, test } from './fixtures';
import { expectedTrip } from './support/trips';

const POPULAR = [
  ['SFO', 'JFK'],
  ['SEA', 'LAX'],
  ['BOS', 'MIA'],
  ['DEN', 'HNL'],
] as const;

test.describe('Home', () => {
  test.beforeEach(async ({ home }) => {
    await home.goto();
  });

  test('shows the hero and a ready-to-search form', async ({ page, home }) => {
    await expect(page).toHaveTitle('FlyLo-Air · Fly more, pay less');
    await expect(home.heroHeading).toBeVisible();
    await expect(page.getByText('Fares that land softly')).toBeVisible();
    await expect(home.search.from).toHaveValue('SFO');
    await expect(home.search.to).toHaveValue('JFK');
    await expect(home.search.date).toHaveValue(defaultTravelDate());
    await expect(home.search.travelers).toHaveValue('1');
    await expect(home.search.submit).toBeEnabled();
  });

  test('popular routes link to their results', async ({ page, home }) => {
    const date = defaultTravelDate();
    for (const [from, to] of POPULAR) {
      await expect(home.popularRoute(from, to)).toHaveAttribute(
        'href',
        `/results?from=${from}&to=${to}&date=${date}&passengers=1`,
      );
    }

    const trip = expectedTrip('SEA', 'LAX', date);
    await home.popularRoute('SEA', 'LAX').click();
    await expect(page).toHaveURL(`/results?from=SEA&to=LAX&date=${date}&passengers=1`);
    await expect(page.getByRole('heading', { level: 1, name: `${trip.fromCity} to ${trip.toCity}` })).toBeVisible();
  });

  test('the same airport twice disables "Search flights"', async ({ home }) => {
    await home.search.from.selectOption('DEN');
    await home.search.to.selectOption('DEN');
    await expect(home.search.submit).toBeDisabled();
    await expect(home.search.to).toHaveAttribute('aria-invalid', 'true');
    await expect(home.search.to).toHaveAccessibleDescription('Choose a different destination.');
    await expect(home.search.sameAirportError).toBeVisible();

    await home.search.to.selectOption('HNL');
    await expect(home.search.submit).toBeEnabled();
    await expect(home.search.sameAirportError).toBeHidden();
  });
});
