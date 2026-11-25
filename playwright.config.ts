import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3300';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 8000 },
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    actionTimeout: 12000,
    navigationTimeout: 20000,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
          args: ['--no-sandbox', '--no-zygote', '--disable-dev-shm-usage'],
        }
      : {},
  },
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER
    ? undefined
    : {
        command: 'npm run start -- --port 3300 --hostname 127.0.0.1',
        url: baseURL + '/login',
        reuseExistingServer: false,
        timeout: 30000,
        env: { ALLOW_INSECURE_LOCAL_COOKIE: '1', APP_ORIGIN: baseURL },
      },
});
