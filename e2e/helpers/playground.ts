import { type Page, type FrameLocator, type Locator, expect } from '@playwright/test';

type Container = Page | FrameLocator;

export class PlaygroundPage {
  private root: Container;

  constructor(root: Container) {
    this.root = root;
  }

  private locator(selector: string): Locator {
    return this.root.locator(selector);
  }

  async waitForReady() {
    await expect(this.locator('text=TruAPI v0.2 Playground')).toBeVisible({ timeout: 10_000 });
  }

  async getServiceCount(): Promise<number> {
    return this.locator('[data-testid^="service-"]').count();
  }

  async selectMethod(service: string, method: string) {
    await this.locator(`[data-testid="method-${service}-${method}"]`).click();
  }

  async fillRequest(json: string) {
    const editor = this.locator('[data-testid="request-editor"]');
    await editor.fill(json);
  }

  async clickCall() {
    await this.locator('[data-testid="call-button"]').click();
  }

  async clickSubscribe() {
    await this.locator('[data-testid="subscribe-button"]').click();
  }

  async clickStop() {
    await this.locator('[data-testid="stop-button"]').click();
  }

  async clickBack() {
    await this.locator('[data-testid="back-button"]').click();
  }

  async waitForResponse(timeout = 5_000): Promise<string> {
    const el = this.locator('[data-testid="response-content"]');
    await expect(el).toBeVisible({ timeout });
    return el.textContent() as Promise<string>;
  }

  async waitForStreamEntries(count: number, timeout = 10_000): Promise<string[]> {
    const container = this.locator('[data-testid="stream-log"]');
    await expect(container).toBeVisible({ timeout });
    await expect(container.locator('[data-testid="stream-entry"]')).toHaveCount(count, { timeout });
    const entries = container.locator('[data-testid="stream-entry"]');
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      texts.push(await entries.nth(i).textContent() as string);
    }
    return texts;
  }

  async getStreamEntryCount(): Promise<number> {
    return this.locator('[data-testid="stream-entry"]').count();
  }

  async getErrorText(): Promise<string | null> {
    const el = this.locator('[data-testid="error-display"]');
    if (await el.isVisible()) {
      return el.textContent();
    }
    return null;
  }
}
