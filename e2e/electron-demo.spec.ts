import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import * as path from 'node:path';

const appPath = path.resolve(__dirname, '..', 'demos', 'host', 'electron', 'dist', 'main.js');

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({ args: [appPath] });
  page = await app.firstWindow();
  // Wait for product app to boot and connect
  await expect(page.locator('#log')).toContainText('Ready to test RPC methods', { timeout: 10_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test.describe('Electron Demo', () => {
  test('app window loads product UI', async () => {
    await expect(page.locator('h1')).toHaveText('RPC Bridge Demo');
  });

  test('unary RPC: SayHello with default name', async () => {
    await expect(page.locator('#input-name')).toHaveValue('World');
    await page.locator('#btn-hello').click();
    await expect(page.locator('#log')).toContainText('Response: Hello, World!');
  });

  test('unary RPC: SayHello with custom name', async () => {
    await page.locator('#input-name').fill('Alice');
    await page.locator('#btn-hello').click();
    await expect(page.locator('#log')).toContainText('Response: Hello, Alice!');
  });

  test('server streaming: WatchGreeting receives multiple updates', async () => {
    await page.locator('#btn-stream').click();
    await expect(page.locator('#log')).toContainText('Starting WatchGreeting');

    await expect(page.locator('#log')).toContainText('[#1]', { timeout: 5_000 });
    await expect(page.locator('#log')).toContainText('[#2]', { timeout: 5_000 });
    await expect(page.locator('#log')).toContainText('[#3]', { timeout: 5_000 });

    await page.locator('#btn-stop-stream').click();
    await expect(page.locator('#log')).toContainText('Stream completed');
  });

  test('server streaming: stop cancels the stream', async () => {
    await page.locator('#btn-stream').click();
    await expect(page.locator('#log')).toContainText('[#1]', { timeout: 5_000 });

    await page.locator('#btn-stop-stream').click();
    await expect(page.locator('#log')).toContainText('Stream completed');

    const logText = await page.locator('#log').textContent();
    const count = (logText!.match(/\[#\d+\]/g) || []).length;
    expect(count).toBeLessThan(20);
  });

  test('bidi streaming: chat sends and receives messages', async () => {
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

  test('bidi streaming: chat handles multiple messages', async () => {
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
