import { defineConfig } from '@playwright/test';

const python = process.env.STORE_E2E_PYTHON || (process.platform === 'win32' ? '../backend/.venv/Scripts/python.exe' : 'python');
const preview = !!process.env.CI || process.env.STOREFRONT_TEST_PREVIEW === '1';

export default defineConfig({
  testDir: './e2e-demo',
  workers: 1,
  timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:5176', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: `"${python}" ../demo/serve.py`, url: 'http://127.0.0.1:8004/api/v1/health', reuseExistingServer: !process.env.CI, timeout: 90000 },
    { command: `npx vite ${preview ? 'preview ' : ''}--host 127.0.0.1 --port 5176 --strictPort`, url: 'http://127.0.0.1:5176', reuseExistingServer: !process.env.CI, env: { STORE_API_TARGET: 'http://127.0.0.1:8004' } },
  ],
});
