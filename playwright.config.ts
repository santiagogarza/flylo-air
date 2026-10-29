import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  reporter: ci ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL,
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      testIgnore: /visual\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run build && npm start',
    url: baseURL,
    reuseExistingServer: !ci,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
