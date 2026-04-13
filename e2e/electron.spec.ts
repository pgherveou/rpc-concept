import path from 'path';
import { test, expect, _electron as electron } from '@playwright/test';
import { PlaygroundPage } from './helpers/playground.js';

const appPath = path.resolve('demos/host-playground/dist/electron/host-electron.js');

test.describe('Electron Demo', () => {
  let playground: PlaygroundPage;
  let electronApp: Awaited<ReturnType<typeof electron.launch>>;
  let page: Awaited<ReturnType<typeof electronApp.firstWindow>>;

  test.beforeEach(async () => {
    electronApp = await electron.launch({ args: [appPath] });
    page = await electronApp.firstWindow();
    playground = new PlaygroundPage(page);
    await playground.waitForReady();
  });

  test.afterEach(async () => {
    await electronApp.close();
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
