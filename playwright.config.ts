import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:4301',
    channel: 'chrome',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        channel: 'chrome',
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4301',
    reuseExistingServer: true,
  },
});
