import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const ECHO_PORT = Number(process.env.ECHO_PORT ?? 4599);
const baseURL = `http://127.0.0.1:${PORT}`;
const echoURL = `http://127.0.0.1:${ECHO_PORT}`;

// Every outbound webhook points at the local echo listener; tests must never reach a real endpoint.
const serverEnv: Record<string, string> = {
  SUPPORT_WEBHOOK_URL: `${echoURL}/support-hook`,
  SUPPORT_WEBHOOK_HEADER: 'x-e2e-key',
  SUPPORT_WEBHOOK_KEY: 'e2e-webhook-key',
  DEMO_RESET_KEY: 'e2e-reset-key',
  XAI_API_KEY: '',
  LAKELINE_WEBHOOK_URL: '',
  LAKELINE_WEBHOOK_KEY: '',
  NEXT_TELEMETRY_DISABLED: '1',
};

const startCommand = `npx next start -p ${PORT} -H 127.0.0.1`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  // The app keeps tickets and cases in one server's memory, so specs run one at a time.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: {
    timeout: 7_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}',
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: `node e2e/fixtures/echo-server.mjs`,
      url: `${echoURL}/__health`,
      env: { ECHO_PORT: String(ECHO_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
    {
      command: process.env.E2E_SKIP_BUILD || process.env.CI ? startCommand : `npm run build && ${startCommand}`,
      url: `${baseURL}/support`,
      env: serverEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
