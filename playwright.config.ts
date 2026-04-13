import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  projects: [
    {
      name: 'web',
      testMatch: 'web-demo.spec.ts',
      use: {
        baseURL: 'http://localhost:3000',
      },
    },
    {
      name: 'electron',
      testMatch: 'electron-demo.spec.ts',
    },
    {
      name: 'android',
      testMatch: 'android-demo.spec.ts',
    },
  ],
  webServer: {
    command: 'node demos/host/web/serve.js',
    port: 3000,
    reuseExistingServer: true,
  },
});
