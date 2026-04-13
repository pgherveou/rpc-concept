Build and run Electron e2e tests using Playwright.

## Requirements

- Node.js installed
- `npm install` completed at repo root (includes `electron` and `@playwright/test` as devDependencies)

## Steps

1. Run `npm run build` from the repo root to build all packages and the playground (includes electron main process + preload bundles)
2. Run `npx playwright test --project=electron` from the repo root
3. Report the results

The electron tests launch the app directly via `_electron.launch()` using `demos/host-playground/dist/host-electron.js` as the entry point. No web server needed.
