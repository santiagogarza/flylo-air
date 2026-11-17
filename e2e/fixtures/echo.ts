import { test as base, expect, type APIRequestContext } from '@playwright/test';

export const ECHO_PORT = Number(process.env.ECHO_PORT ?? 4599);
export const ECHO_URL = `http://127.0.0.1:${ECHO_PORT}`;
export const RESET_KEY = 'e2e-reset-key';

export type EchoRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  at: number;
};

export type EchoMode = { status?: number; delayMs?: number; times?: number };

export class Echo {
  constructor(private readonly api: APIRequestContext) {}

  async reset() {
    await this.api.post(`${ECHO_URL}/__reset`);
  }

  async setMode(mode: EchoMode | null) {
    await this.api.post(`${ECHO_URL}/__mode`, { data: mode ?? {} });
  }

  async requests(path?: string): Promise<EchoRequest[]> {
    const response = await this.api.get(`${ECHO_URL}/__requests`);
    const all = (await response.json()) as EchoRequest[];
    return path ? all.filter((item) => item.path === path) : all;
  }

  async waitForRequests(count: number, path?: string, timeout = 10_000): Promise<EchoRequest[]> {
    let latest: EchoRequest[] = [];
    await expect
      .poll(
        async () => {
          latest = await this.requests(path);
          return latest.length;
        },
        { timeout },
      )
      .toBeGreaterThanOrEqual(count);
    return latest;
  }
}

/** Clears the server's in-memory tickets (and cases, once the reset route covers them). */
export async function resetDemo(api: APIRequestContext, baseURL: string) {
  const response = await api.post(`${baseURL}/api/reset`, { headers: { 'x-demo-reset-key': RESET_KEY } });
  expect(response.status(), 'POST /api/reset should accept the e2e reset key').toBe(200);
}

export const test = base.extend<{ echo: Echo }>({
  // Automatic so every test starts from the seeded demo, even when it does not ask for `echo`.
  echo: [
    async ({ playwright, baseURL }, use) => {
      const api = await playwright.request.newContext();
      const echo = new Echo(api);
      await echo.reset();
      await resetDemo(api, baseURL!);
      await use(echo);
      await echo.reset();
      await api.dispose();
    },
    { auto: true },
  ],
});

export { expect };
