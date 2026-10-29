import type { Locator, Page, Request } from '@playwright/test';

export class SupportPage {
  readonly heading: Locator;
  readonly fullName: Locator;
  readonly bookingReference: Locator;
  readonly email: Locator;
  readonly category: Locator;
  readonly description: Locator;
  readonly callButton: Locator;
  readonly callStatus: Locator;
  readonly ticketRequests: Request[] = [];

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1, name: 'Call FlyLo-Air Support' });
    this.fullName = page.getByLabel('Full name');
    this.bookingReference = page.getByLabel('Booking reference');
    this.email = page.getByLabel('Email', { exact: true });
    this.category = page.getByLabel('Issue category');
    this.description = page.getByLabel('Description');
    this.callButton = page.getByRole('button', { name: 'Call FlyLo-Air Support' });
    this.callStatus = page.getByRole('status');
  }

  /**
   * Keeps the smoke test read-only: no ticket can reach /api/tickets (so no webhook fires)
   * and no realtime voice socket can open, even if a key happens to be configured locally.
   */
  async lockDown() {
    await this.page.route('**/api/tickets**', (route) => {
      this.ticketRequests.push(route.request());
      return route.abort('blockedbyclient');
    });
    await this.page.routeWebSocket(/.*/, (socket) => socket.close());
    // CI has no microphone. A silent stream lets the call button reach the server-side voice check.
    await this.page.addInitScript(() => {
      const getUserMedia = async () => new MediaStream();
      if (navigator.mediaDevices) {
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: getUserMedia, configurable: true });
      } else {
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
      }
    });
  }

  async goto() {
    await this.page.goto('/support/');
  }
}
