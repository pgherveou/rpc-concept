import { test as base, expect, type Page } from '@playwright/test';
import { _android } from 'playwright-core';

// Connects to an Android emulator's WebView via Playwright's Android API.
// Prerequisites: emulator running with the demo app installed and launched.

const test = base.extend<{}, { androidPage: Page }>({
  androidPage: [async ({}, use) => {
    const [device] = await _android.devices();
    if (!device) throw new Error('No Android device/emulator found');

    const webview = await device.webView({ pkg: 'com.demo.rpcbridge' });
    const page = await webview.page();
    await use(page);
    await device.close();
  }, { scope: 'worker' }],
});

test.describe('Android Demo', () => {
  test.beforeEach(async ({ androidPage: page }) => {
    await expect(page.locator('#log')).toContainText('Ready to test RPC methods', { timeout: 10_000 });
  });

  test('unary RPC: SayHello with default name', async ({ androidPage: page }) => {
    await page.locator('#input-name').fill('World');
    await page.locator('#btn-hello').click();
    await expect(page.locator('#log')).toContainText('Response: Hello, World!');
  });

  test('unary RPC: SayHello with custom name', async ({ androidPage: page }) => {
    await page.locator('#input-name').fill('Alice');
    await page.locator('#btn-hello').click();
    await expect(page.locator('#log')).toContainText('Response: Hello, Alice!');
  });

  test('server streaming: WatchGreeting receives multiple updates', async ({ androidPage: page }) => {
    await page.locator('#btn-stream').click();
    await expect(page.locator('#log')).toContainText('Starting WatchGreeting');

    await expect(page.locator('#log')).toContainText('[#1]', { timeout: 5_000 });
    await expect(page.locator('#log')).toContainText('[#2]', { timeout: 5_000 });
    await expect(page.locator('#log')).toContainText('[#3]', { timeout: 5_000 });

    await page.locator('#btn-stop-stream').click();
    await expect(page.locator('#log')).toContainText('Stream completed');
  });

  test('server streaming: stop cancels the stream', async ({ androidPage: page }) => {
    await page.locator('#btn-stream').click();
    await expect(page.locator('#log')).toContainText('[#1]', { timeout: 5_000 });

    await page.locator('#btn-stop-stream').click();
    await expect(page.locator('#log')).toContainText('Stream completed');

    const logText = await page.locator('#log').textContent();
    const count = (logText!.match(/\[#\d+\]/g) || []).length;
    expect(count).toBeLessThan(20);
  });

  test('bidi streaming: chat sends and receives messages', async ({ androidPage: page }) => {
    await page.locator('#btn-chat-start').click();
    const chatLog = page.locator('#chat-log');
    await expect(chatLog).toContainText('Chat started');

    await page.locator('#input-chat').fill('hello there');
    await page.locator('#btn-chat-send').click();

    await expect(chatLog).toContainText('[you] hello there');
    await expect(chatLog).toContainText('You said: "hello there"', { timeout: 5_000 });
    await expect(chatLog).toContainText('Nice to meet you!', { timeout: 5_000 });

    await page.locator('#btn-chat-stop').click();
  });

  test('bidi streaming: chat handles multiple messages', async ({ androidPage: page }) => {
    await page.locator('#btn-chat-start').click();
    const chatLog = page.locator('#chat-log');
    await expect(chatLog).toContainText('Chat started');

    await page.locator('#input-chat').fill('hi');
    await page.locator('#btn-chat-send').click();
    await expect(chatLog).toContainText('[you] hi');
    await expect(chatLog).toContainText('Nice to meet you!', { timeout: 5_000 });

    await page.locator('#input-chat').fill('how are you?');
    await page.locator('#btn-chat-send').click();
    await expect(chatLog).toContainText('[you] how are you?');
    await expect(chatLog).toContainText('Great question!', { timeout: 5_000 });

    await page.locator('#btn-chat-stop').click();
  });
});
