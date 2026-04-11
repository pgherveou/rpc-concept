/**
 * Shared demo UI for the RPC bridge framework.
 *
 * This module provides a platform-agnostic UI that works in
 * web browsers, WKWebView, Android WebView, and Electron.
 * It connects to a generated client to demonstrate all RPC patterns.
 */

/** Minimal interface for the demo service client. */
export interface DemoServiceClient {
  sayHello(request: { name: string; language?: string }): Promise<{ message: string; timestamp?: number }>;
  watchGreeting(request: { name: string; maxCount?: number; intervalMs?: number }): AsyncIterable<{ message: string; seq: number }>;
  chat(requests: AsyncIterable<{ from: string; text: string; seq?: number }>): AsyncIterable<{ from: string; text: string; seq: number }>;
}

export interface DemoUIOptions {
  /** Root element to mount the UI in */
  root: HTMLElement;
  /** The service client */
  client: DemoServiceClient;
  /** Optional platform name for display */
  platform?: string;
}

/**
 * Initialize and render the demo UI.
 */
export function createDemoUI(options: DemoUIOptions): DemoUIController {
  const { root, client, platform } = options;

  root.innerHTML = buildHTML(platform ?? 'RPC Bridge');
  const controller = new DemoUIController(root, client);
  controller.init();
  return controller;
}

export class DemoUIController {
  private logEl!: HTMLElement;
  private chatLogEl!: HTMLElement;
  private streamAbort?: AbortController;
  private chatAbort?: AbortController;
  private chatQueue: Array<{ from: string; text: string; seq: number }> = [];
  private chatResolve?: (value: IteratorResult<{ from: string; text: string; seq: number }>) => void;
  private chatSeq = 0;
  private chatDone = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly client: DemoServiceClient,
  ) {}

  init(): void {
    this.logEl = this.root.querySelector('#log')!;
    this.chatLogEl = this.root.querySelector('#chat-log')!;

    // Unary button
    this.root.querySelector('#btn-hello')!.addEventListener('click', () => {
      this.doUnaryHello();
    });

    // Stream button
    this.root.querySelector('#btn-stream')!.addEventListener('click', () => {
      this.doStreamGreeting();
    });

    // Stop stream button
    this.root.querySelector('#btn-stop-stream')!.addEventListener('click', () => {
      this.stopStream();
    });

    // Chat button
    this.root.querySelector('#btn-chat-start')!.addEventListener('click', () => {
      this.startChat();
    });

    // Send chat message
    this.root.querySelector('#btn-chat-send')!.addEventListener('click', () => {
      this.sendChatMessage();
    });

    // Stop chat
    this.root.querySelector('#btn-chat-stop')!.addEventListener('click', () => {
      this.stopChat();
    });

    this.log('UI initialized. Ready to test RPC methods.');
  }

  private async doUnaryHello(): Promise<void> {
    const nameInput = this.root.querySelector('#input-name') as HTMLInputElement;
    const name = nameInput.value.trim() || 'World';
    this.log(`Calling SayHello("${name}")...`);

    try {
      const response = await this.client.sayHello({ name });
      this.log(`Response: ${response.message}`);
    } catch (err) {
      this.log(`Error: ${err}`, true);
    }
  }

  private async doStreamGreeting(): Promise<void> {
    const nameInput = this.root.querySelector('#input-name') as HTMLInputElement;
    const name = nameInput.value.trim() || 'World';
    this.log(`Starting WatchGreeting("${name}")...`);

    this.streamAbort = new AbortController();

    try {
      const stream = this.client.watchGreeting({
        name,
        maxCount: 20,
        intervalMs: 1000,
      });

      for await (const event of stream) {
        if (this.streamAbort.signal.aborted) break;
        this.log(`[#${event.seq}] ${event.message}`);
      }
      this.log('Stream completed.');
    } catch (err) {
      if (String(err).includes('cancel') || String(err).includes('abort')) {
        this.log('Stream cancelled.');
      } else {
        this.log(`Stream error: ${err}`, true);
      }
    } finally {
      this.streamAbort = undefined;
    }
  }

  private stopStream(): void {
    if (this.streamAbort) {
      this.streamAbort.abort();
      this.log('Cancelling stream...');
    }
  }

  private startChat(): void {
    this.chatSeq = 0;
    this.chatDone = false;
    this.chatQueue = [];
    this.chatLogEl.innerHTML = '';

    this.chatAbort = new AbortController();
    const self = this;

    // Create the input async iterable
    const inputIterable: AsyncIterable<{ from: string; text: string; seq: number }> = {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<{ from: string; text: string; seq: number }>> {
            if (self.chatQueue.length > 0) {
              return Promise.resolve({ done: false, value: self.chatQueue.shift()! });
            }
            if (self.chatDone) {
              return Promise.resolve({ done: true, value: undefined as unknown as { from: string; text: string; seq: number } });
            }
            return new Promise((resolve) => {
              self.chatResolve = resolve;
            });
          },
          return(): Promise<IteratorResult<{ from: string; text: string; seq: number }>> {
            self.chatDone = true;
            return Promise.resolve({ done: true, value: undefined as unknown as { from: string; text: string; seq: number } });
          },
        };
      },
    };

    this.chatLog('Chat started. Type messages below.');

    // Start the bidi stream
    (async () => {
      try {
        const responses = this.client.chat(inputIterable);
        for await (const msg of responses) {
          if (this.chatAbort?.signal.aborted) break;
          this.chatLog(`[${msg.from}] ${msg.text}`);
        }
        this.chatLog('Chat ended.');
      } catch (err) {
        if (!String(err).includes('cancel') && !String(err).includes('abort')) {
          this.chatLog(`Chat error: ${err}`);
        } else {
          this.chatLog('Chat cancelled.');
        }
      }
    })();
  }

  private sendChatMessage(): void {
    const input = this.root.querySelector('#input-chat') as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    this.chatSeq++;
    const msg = { from: 'user', text, seq: this.chatSeq };
    this.chatLog(`[you] ${text}`);

    if (this.chatResolve) {
      const resolve = this.chatResolve;
      this.chatResolve = undefined;
      resolve({ done: false, value: msg });
    } else {
      this.chatQueue.push(msg);
    }
  }

  private stopChat(): void {
    this.chatDone = true;
    if (this.chatResolve) {
      const resolve = this.chatResolve;
      this.chatResolve = undefined;
      resolve({ done: true, value: undefined as unknown as { from: string; text: string; seq: number } });
    }
    if (this.chatAbort) {
      this.chatAbort.abort();
      this.chatAbort = undefined;
    }
  }

  private log(message: string, isError = false): void {
    const entry = document.createElement('div');
    entry.className = isError ? 'log-error' : 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.logEl.appendChild(entry);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private chatLog(message: string): void {
    const entry = document.createElement('div');
    entry.className = 'chat-entry';
    entry.textContent = message;
    this.chatLogEl.appendChild(entry);
    this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
  }
}

function buildHTML(platform: string): string {
  return `
<div class="rpc-demo">
  <h1>RPC Bridge Demo - ${platform}</h1>

  <section class="section">
    <h2>Unary RPC: SayHello</h2>
    <div class="row">
      <input id="input-name" type="text" placeholder="Enter name" value="World" />
      <button id="btn-hello">Say Hello</button>
    </div>
  </section>

  <section class="section">
    <h2>Server Streaming: WatchGreeting</h2>
    <div class="row">
      <button id="btn-stream">Start Stream</button>
      <button id="btn-stop-stream">Stop Stream</button>
    </div>
  </section>

  <section class="section">
    <h2>Bidi Streaming: Chat</h2>
    <div class="row">
      <button id="btn-chat-start">Start Chat</button>
      <button id="btn-chat-stop">End Chat</button>
    </div>
    <div class="row">
      <input id="input-chat" type="text" placeholder="Type a message..." />
      <button id="btn-chat-send">Send</button>
    </div>
    <div id="chat-log" class="log-panel chat-panel"></div>
  </section>

  <section class="section">
    <h2>Log</h2>
    <div id="log" class="log-panel"></div>
  </section>
</div>
`;
}

export function getDemoStyles(): string {
  return `
.rpc-demo {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  color: #333;
}
h1 { font-size: 1.5rem; border-bottom: 2px solid #4a90d9; padding-bottom: 8px; }
h2 { font-size: 1.1rem; color: #4a90d9; margin-top: 24px; }
.section { margin-bottom: 16px; }
.row { display: flex; gap: 8px; margin: 8px 0; align-items: center; }
input[type="text"] {
  flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px;
  font-size: 14px;
}
button {
  padding: 8px 16px; background: #4a90d9; color: white; border: none;
  border-radius: 4px; cursor: pointer; font-size: 14px; white-space: nowrap;
}
button:hover { background: #357abd; }
button:active { background: #2a5f9e; }
.log-panel {
  background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 12px;
  max-height: 300px; overflow-y: auto; min-height: 100px;
}
.chat-panel { min-height: 150px; max-height: 200px; }
.log-entry { margin: 2px 0; }
.log-error { margin: 2px 0; color: #f44; }
.chat-entry { margin: 2px 0; color: #8cd; }
`;
}
