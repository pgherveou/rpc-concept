Build and run web e2e tests using Playwright.

## Requirements

- Node.js installed
- `npm install` completed at repo root
- Playwright chromium browser installed (`npx playwright install chromium`)

## Steps

1. Run `npm run build` from the repo root to build all packages and the playground
2. Run `npx playwright test --project=web` from the repo root
3. Report the results

The web tests serve `demos/host-playground/dist/` on port 3456 (configured in `playwright.config.ts` webServer) and test the playground via an iframe.
