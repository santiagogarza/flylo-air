import { expect, test } from './fixtures';
import { expectedTrip, farePrice, pickTravelDate } from './support/trips';

test.describe('Checkout with one traveler', () => {
  const date = pickTravelDate();
  const trip = expectedTrip('SFO', 'JFK', date);
  const flight = trip.flights[0];
  const fare = flight.fares[1];

  test.beforeEach(async ({ page, results, checkout }) => {
    await page.goto(`/results?from=SFO&to=JFK&date=${date}&passengers=1`);
    await results.fareLink(flight, fare).click();
    await expect(page).toHaveURL(/\/checkout\?/);
    await expect(checkout.step).toBeVisible();
    await expect(checkout.heading).toBeVisible();
  });

  test('results to booked with sample details', async ({ checkout }) => {
    await expect(checkout.summary).toContainText(`${flight.flightNumber} · ${fare.name} fare`);
    await expect(checkout.pay).toHaveText(`Pay ${farePrice(fare)}`);

    await checkout.fillSample.click();
    await expect(checkout.firstName).toHaveValue('Maya');
    await expect(checkout.lastName).toHaveValue('Chen');
    await expect(checkout.email).toHaveValue('maya.chen@example.com');
    await expect(checkout.cardNumber).toHaveValue('4242 4242 4242 4242');

    await checkout.pay.click();

    await expect(checkout.booked).toBeVisible();
    await expect(checkout.bookingReference).toHaveText(/^FLY-\d{5}$/);
    await expect(checkout.page.getByText(`${flight.flightNumber} · San Francisco to New York`)).toBeVisible();
    await expect(checkout.page.getByRole('link', { name: 'Book another trip' })).toHaveAttribute('href', '/');
  });

  test('an empty submit flags every field', async ({ page, checkout }) => {
    const payments: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/checkout')) payments.push(request.url());
    });

    await checkout.pay.click();

    await expect(checkout.alert).toHaveText('Check the highlighted fields, then pay again.');
    await expect(page.getByText('Enter a first and last name as shown on the ID.')).toBeVisible();
    for (const field of [checkout.firstName, checkout.lastName, checkout.email, checkout.cardName, checkout.cardNumber, checkout.cardExpiry, checkout.cardCvc]) {
      await expect(field).toHaveAttribute('aria-invalid', 'true');
    }
    await expect(checkout.email).toHaveAccessibleDescription('Enter an email for your confirmation.');
    await expect(checkout.cardName).toHaveAccessibleDescription('Enter the name on the card.');
    await expect(checkout.cardNumber).toHaveAccessibleDescription('Enter a valid card number.');
    await expect(checkout.cardExpiry).toHaveAccessibleDescription('Enter the expiry as MM/YY.');
    await expect(checkout.cardCvc).toHaveAccessibleDescription('Enter the 3 or 4 digit security code.');
    await expect(checkout.booked).toBeHidden();
    expect(payments).toEqual([]);
  });

  test('an invalid card number is rejected before paying', async ({ page, checkout }) => {
    await checkout.fillSample.click();
    await checkout.cardNumber.fill('4242424242424241');
    await expect(checkout.cardNumber).toHaveValue('4242 4242 4242 4241');

    await checkout.pay.click();

    await expect(checkout.alert).toHaveText('Check the highlighted fields, then pay again.');
    await expect(checkout.cardNumber).toHaveAttribute('aria-invalid', 'true');
    await expect(checkout.cardNumber).toHaveAccessibleDescription('Enter a valid card number.');
    for (const field of [checkout.firstName, checkout.email, checkout.cardName, checkout.cardExpiry, checkout.cardCvc]) {
      await expect(field).not.toHaveAttribute('aria-invalid');
    }

    await checkout.cardNumber.fill('4242 4242 4242 4242');
    await checkout.pay.click();
    await expect(checkout.booked).toBeVisible();
    await expect(page.getByText(/^FLY-\d{5}$/)).toBeVisible();
  });
});
