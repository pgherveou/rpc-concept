import { test, expect } from '@playwright/test';
import { PlaygroundPage } from './helpers/playground.js';

test.describe('Web Demo', () => {
  let playground: PlaygroundPage;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status')).toHaveText('TruAPI Playground - Connected', { timeout: 10_000 });
    const iframe = page.frameLocator('#client-frame');
    playground = new PlaygroundPage(iframe);
    await playground.waitForReady();
  });

  test('service table shows all 11 services', async () => {
    const count = await playground.getServiceCount();
    expect(count).toBe(11);
  });

  test('unary RPC: FeatureSupported', async () => {
    await playground.selectMethod('GeneralService', 'FeatureSupported');
    await playground.clickCall();
    const response = await playground.waitForResponse();
    expect(response).toContain('"supported"');
    expect(response).toContain('true');
  });

  test('unary RPC: DeriveEntropy', async () => {
    await playground.selectMethod('EntropyService', 'DeriveEntropy');
    await playground.clickCall();
    const response = await playground.waitForResponse();
    expect(response).toContain('"entropy"');
  });

  test('server streaming: HeadFollow receives events', async () => {
    await playground.selectMethod('ChainService', 'HeadFollow');
    await playground.clickSubscribe();
    // Mock yields 3 events + "--- stream ended ---"
    const entries = await playground.waitForStreamEntries(4);
    expect(entries[0]).toContain('"initialized"');
    expect(entries[1]).toContain('"newBlock"');
    expect(entries[2]).toContain('"bestBlockChanged"');
    expect(entries[3]).toContain('stream ended');
  });

  test('back navigation returns to service table', async () => {
    await playground.selectMethod('GeneralService', 'FeatureSupported');
    await playground.clickBack();
    await playground.waitForReady();
    const count = await playground.getServiceCount();
    expect(count).toBe(11);
  });
});
