import { defineConfig, devices } from '@playwright/test';

const buildOnlyEnv = { NEON_AUTH_BASE_URL: 'https://build-only.invalid/auth', NEON_AUTH_COOKIE_SECRET: 'browser-test-only-not-a-runtime-secret', NEON_AUTH_GOOGLE_ENABLED: 'true', WEB_APP_URL: 'http://localhost:3000', OBSERVATORY_APP_URL: 'http://localhost:3001' };
export default defineConfig({
  testDir: './tests/ui',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run start --workspace=@minnow/web', url: 'http://localhost:3000', env: buildOnlyEnv, reuseExistingServer: false, timeout:30_000 },
    { command: 'npm run start --workspace=@minnow/observatory', url: 'http://localhost:3001/auth/sign-in', env: buildOnlyEnv, reuseExistingServer: false, timeout:30_000 },
  ],
  projects: [
    { name:'desktop', use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}} },
    { name:'mobile', use:{...devices['iPhone 13'],defaultBrowserType:'chromium'} },
  ],
});
