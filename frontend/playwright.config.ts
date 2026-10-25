import { defineConfig } from '@playwright/test';

const preview = !!process.env.CI || process.env.STOREFRONT_TEST_PREVIEW === '1';
const baseURL = preview ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: preview ? 'npm run preview' : 'npm run dev', url: baseURL, reuseExistingServer: !process.env.CI },
});
