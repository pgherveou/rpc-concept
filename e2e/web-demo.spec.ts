import { test, expect, type FrameLocator } from '@playwright/test';

test.describe('Web Demo', () => {
  let iframe: FrameLocator;

  test.beforeEach(async ({ page }) => {
    await page.goto('/host.html');
    iframe = page.frameLocator('#client-frame');
    // Wait for connection to be ready
    await expect(page.locator('#status')).toHaveText('Connected', { timeout: 10_000 });
    await expect(iframe.locator('#log')).toContainText('Ready to test RPC methods');
  });

  test('host page shows connected status', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('RPC Bridge - Web Demo (Host Page)');
    await expect(page.locator('#status')).toHaveText('Connected');
  });

  test('unary RPC: SayHello with default name', async () => {
    await expect(iframe.locator('#input-name')).toHaveValue('World');
    await iframe.locator('#btn-hello').click();
    await expect(iframe.locator('#log')).toContainText('Response: Hello, World!');
  });

  test('unary RPC: SayHello with custom name', async () => {
    await iframe.locator('#input-name').fill('Alice');
    await iframe.locator('#btn-hello').click();
    await expect(iframe.locator('#log')).toContainText('Response: Hello, Alice!');
  });

  test('server streaming: WatchGreeting receives multiple updates', async () => {
    await iframe.locator('#btn-stream').click();
    await expect(iframe.locator('#log')).toContainText('Starting WatchGreeting');

    // Wait for at least 3 streaming updates
    await expect(iframe.locator('#log')).toContainText('[#1]', { timeout: 5_000 });
    await expect(iframe.locator('#log')).toContainText('[#2]', { timeout: 5_000 });
    await expect(iframe.locator('#log')).toContainText('[#3]', { timeout: 5_000 });

    // Stop the stream
    await iframe.locator('#btn-stop-stream').click();
    await expect(iframe.locator('#log')).toContainText('Stream completed');
  });

  test('server streaming: stop cancels the stream', async () => {
    await iframe.locator('#btn-stream').click();
    await expect(iframe.locator('#log')).toContainText('[#1]', { timeout: 5_000 });

    await iframe.locator('#btn-stop-stream').click();
    await expect(iframe.locator('#log')).toContainText('Stream completed');

    // Record the log content after stop, verify no new entries appear
    const logText = await iframe.locator('#log').textContent();
    const count = (logText!.match(/\[#\d+\]/g) || []).length;
    // Should have stopped early (fewer than 20 updates)
    expect(count).toBeLessThan(20);
  });

  test('bidi streaming: chat sends and receives messages', async () => {
    // Start chat
    await iframe.locator('#btn-chat-start').click();
    const chatLog = iframe.locator('#chat-log');
    await expect(chatLog).toContainText('Chat started');

    // Send a message
    await iframe.locator('#input-chat').fill('hello there');
    await iframe.locator('#btn-chat-send').click();

    // Verify our message and bot responses appear in the chat log
    await expect(chatLog).toContainText('[you] hello there');
    await expect(chatLog).toContainText('You said: "hello there"', { timeout: 5_000 });
    await expect(chatLog).toContainText('Nice to meet you!', { timeout: 5_000 });

    // End chat
    await iframe.locator('#btn-chat-stop').click();
  });

  test('bidi streaming: chat handles multiple messages', async () => {
    await iframe.locator('#btn-chat-start').click();
    const chatLog = iframe.locator('#chat-log');
    await expect(chatLog).toContainText('Chat started');

    // Send first message
    await iframe.locator('#input-chat').fill('hi');
    await iframe.locator('#btn-chat-send').click();
    await expect(chatLog).toContainText('[you] hi');
    await expect(chatLog).toContainText('Nice to meet you!', { timeout: 5_000 });

    // Send second message with a question
    await iframe.locator('#input-chat').fill('how are you?');
    await iframe.locator('#btn-chat-send').click();
    await expect(chatLog).toContainText('[you] how are you?');
    await expect(chatLog).toContainText('Great question!', { timeout: 5_000 });

    await iframe.locator('#btn-chat-stop').click();
  });
});
