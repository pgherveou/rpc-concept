import { test, expect, _android as android } from '@playwright/test';
import { PlaygroundPage } from './helpers/playground.js';

const PKG = 'com.demo.rpcbridge';

test.describe('Android Demo', () => {
  let playground: PlaygroundPage;
  let device: Awaited<ReturnType<typeof android.devices>>[0];

  test.beforeAll(async () => {
    const devices = await android.devices();
    if (devices.length === 0) {
      throw new Error('No Android devices/emulators found. Start an emulator first.');
    }
    device = devices[0];
  });

  test.beforeEach(async () => {
    await device.shell(`am force-stop ${PKG}`);
    await device.shell(`am start -n ${PKG}/.MainActivity`);
    const webview = await device.webView({ pkg: PKG });
    const page = await webview.page();
    playground = new PlaygroundPage(page);
    await playground.waitForReady();
  });

  test.afterAll(async () => {
    await device.shell(`am force-stop ${PKG}`);
    await device.close();
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
