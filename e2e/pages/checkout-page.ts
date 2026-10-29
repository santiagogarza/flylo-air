import type { Locator, Page } from '@playwright/test';

export class CheckoutPage {
  readonly step: Locator;
  readonly heading: Locator;
  readonly form: Locator;
  readonly fillSample: Locator;
  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly email: Locator;
  readonly cardName: Locator;
  readonly cardNumber: Locator;
  readonly cardExpiry: Locator;
  readonly cardCvc: Locator;
  readonly pay: Locator;
  readonly alert: Locator;
  readonly summary: Locator;
  readonly booked: Locator;
  readonly bookingReference: Locator;

  constructor(readonly page: Page) {
    this.step = page.getByText('Step 2 of 2 · Checkout');
    this.heading = page.getByRole('heading', { level: 1, name: 'Review and pay' });
    this.form = page.getByRole('form', { name: 'Checkout' });
    this.fillSample = this.form.getByRole('button', { name: 'Fill sample details' });
    this.firstName = this.form.getByLabel('First name');
    this.lastName = this.form.getByLabel('Last name');
    this.email = this.form.getByLabel('Email for confirmation');
    this.cardName = this.form.getByLabel('Name on card');
    this.cardNumber = this.form.getByLabel('Card number');
    this.cardExpiry = this.form.getByLabel('Expiry (MM/YY)');
    this.cardCvc = this.form.getByLabel('Security code');
    this.pay = this.form.getByRole('button', { name: /^Pay \$/ });
    this.alert = this.form.getByRole('alert');
    this.summary = page.getByRole('complementary', { name: /→/ });
    this.booked = page.getByRole('heading', { level: 1, name: "You're booked" });
    this.bookingReference = page.getByText(/^FLY-\d{5}$/);
  }
}
