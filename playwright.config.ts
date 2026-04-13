import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  projects: [
    {
      name: 'web',
      testMatch: 'web.spec.ts',
      use: { baseURL: 'http://localhost:3456' },
    },
    {
      name: 'electron',
      testMatch: 'electron.spec.ts',
    },
    {
      name: 'android',
      testMatch: 'android.spec.ts',
    },
  ],
  webServer: {
    command: 'npx serve demos/host-playground/dist -l 3456',
    port: 3456,
    reuseExistingServer: true,
  },
});
