import { defineConfig } from '@playwright/test';

const python = process.env.STORE_E2E_PYTHON || (process.platform === 'win32' ? '../backend/.venv/Scripts/python.exe' : 'python');

export default defineConfig({
  testDir: './e2e-admin',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5175', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: `"${python}" ../backend/tests/serve_admin.py`, url: 'http://127.0.0.1:8002/api/v1/health', reuseExistingServer: false },
    { command: 'npx vite --host 127.0.0.1 --port 5175 --strictPort', url: 'http://127.0.0.1:5175', reuseExistingServer: false, env: { STORE_API_TARGET: 'http://127.0.0.1:8002' } },
  ],
});
