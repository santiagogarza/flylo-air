import type { Locator, Page } from '@playwright/test';
import type { Fare, Flight } from '@/lib/flights';
import { farePrice, flightName } from '../support/trips';
import { SearchFormSection } from './search-form';

export class ResultsPage {
  readonly step: Locator;
  readonly routeHeading: Locator;
  readonly flightList: Locator;
  readonly editSearchToggle: Locator;
  readonly editSearch: SearchFormSection;

  constructor(readonly page: Page) {
    this.step = page.getByText('Step 1 of 2 · Choose a flight');
    this.routeHeading = page.getByRole('heading', { level: 1 });
    this.flightList = page.getByRole('list').filter({ has: page.getByRole('group', { name: /^Fares for / }) });
    this.editSearchToggle = page.getByText('Edit search', { exact: true });
    this.editSearch = new SearchFormSection(page.getByRole('form', { name: 'Search flights' }));
  }

  summary(count: number): Locator {
    return this.page.getByRole('heading', { level: 2, name: `${count} flights · prices per traveler` });
  }

  flight(flight: Flight): Locator {
    return this.flightList.getByRole('listitem', { name: flightName(flight) });
  }

  fareLink(flight: Flight, fare: Fare): Locator {
    return this.flight(flight).getByRole('link', {
      name: `Select ${fare.name} on ${flight.flightNumber} for ${farePrice(fare)} per traveler`,
    });
  }
}
