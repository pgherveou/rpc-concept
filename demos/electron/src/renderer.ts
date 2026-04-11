/**
 * Electron Demo - Renderer Process
 *
 * Runs in the BrowserWindow's renderer context. Consumes the RPC API
 * exposed by the preload script via contextBridge and adapts it into
 * the DemoServiceClient interface expected by the shared demo UI.
 *
 * The renderer has no access to Node.js APIs (contextIsolation + sandbox).
 * All RPC work happens inside the preload; this file only deals with
 * serializable proxies.
 */

import { createDemoUI, getDemoStyles, type DemoServiceClient } from '@rpc-bridge/shared-ui';

// ---------------------------------------------------------------------------
// Type declaration for the bridge API exposed by the preload script
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    rpcBridge: {
      sayHello(name: string): Promise<{ message: string; timestamp?: number }>;
      watchGreeting(
        name: string,
        maxCount: number,
        intervalMs: number,
        callback: (event: { message: string; seq: number }) => void,
      ): () => void;
      startChat(
        onMessage: (msg: { from: string; text: string; seq: number }) => void,
      ): { send: (text: string) => void; stop: () => void };
    };
  }
}

// ---------------------------------------------------------------------------
// DemoServiceClient adapter wrapping the preload's exposed API
// ---------------------------------------------------------------------------

const client: DemoServiceClient = {
  async sayHello(request) {
    return window.rpcBridge.sayHello(request.name);
  },

  /**
   * Convert the callback-based watchGreeting API into an AsyncIterable.
   */
  async *watchGreeting(request) {
    // Create a buffer + resolver pattern to bridge callback -> async iteration
    const buffer: Array<{ message: string; seq: number }> = [];
    let resolve: ((value: IteratorResult<{ message: string; seq: number }>) => void) | undefined;
    let done = false;

    const cancel = window.rpcBridge.watchGreeting(
      request.name,
      request.maxCount ?? 10,
      request.intervalMs ?? 1000,
      (event) => {
        if (done) return;
        if (resolve) {
          const r = resolve;
          resolve = undefined;
          r({ done: false, value: event });
        } else {
          buffer.push(event);
        }
      },
    );

    try {
      while (!done) {
        const result: IteratorResult<{ message: string; seq: number }> = buffer.length > 0
          ? { done: false, value: buffer.shift()! }
          : await new Promise<IteratorResult<{ message: string; seq: number }>>((r) => {
              resolve = r;
            });

        if (result.done) break;
        yield result.value;
      }
    } finally {
      done = true;
      cancel();
      // Unblock any pending promise
      if (resolve) {
        resolve({ done: true, value: undefined as unknown as { message: string; seq: number } });
      }
    }
  },

  /**
   * Convert the send/stop/onMessage API into AsyncIterable in/out for bidi streaming.
   */
  chat(requests) {
    // Buffer + resolver for incoming server messages
    const inBuffer: Array<{ from: string; text: string; seq: number }> = [];
    let inResolve: ((value: IteratorResult<{ from: string; text: string; seq: number }>) => void) | undefined;
    let streamDone = false;

    const controls = window.rpcBridge.startChat((msg) => {
      if (streamDone) return;
      if (inResolve) {
        const r = inResolve;
        inResolve = undefined;
        r({ done: false, value: msg });
      } else {
        inBuffer.push(msg);
      }
    });

    // Forward outgoing messages from the requests iterable to the chat controls
    (async () => {
      try {
        for await (const msg of requests) {
          if (streamDone) break;
          controls.send(msg.text);
        }
        // Input iterable exhausted -- signal stop
        if (!streamDone) {
          streamDone = true;
          controls.stop();
          if (inResolve) {
            const r = inResolve;
            inResolve = undefined;
            r({ done: true, value: undefined as unknown as { from: string; text: string; seq: number } });
          }
        }
      } catch {
        // Input stream errored
        if (!streamDone) {
          streamDone = true;
          controls.stop();
        }
      }
    })();

    // Return an AsyncIterable that yields incoming server messages
    type ChatMsg = { from: string; text: string; seq: number };
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<ChatMsg>> {
            if (streamDone && inBuffer.length === 0) {
              return { done: true, value: undefined as unknown as ChatMsg };
            }
            if (inBuffer.length > 0) {
              return { done: false, value: inBuffer.shift()! };
            }
            return new Promise<IteratorResult<ChatMsg>>((r) => {
              inResolve = r;
            });
          },
          async return(): Promise<IteratorResult<ChatMsg>> {
            streamDone = true;
            controls.stop();
            if (inResolve) {
              const r = inResolve;
              inResolve = undefined;
              r({ done: true, value: undefined as unknown as ChatMsg });
            }
            return { done: true, value: undefined as unknown as ChatMsg };
          },
        };
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Mount the Shared Demo UI
// ---------------------------------------------------------------------------

const style = document.createElement('style');
style.textContent = getDemoStyles();
document.head.appendChild(style);

createDemoUI({
  root: document.getElementById('app')!,
  client,
  platform: 'Electron',
});
