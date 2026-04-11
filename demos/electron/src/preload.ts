/**
 * Electron Demo - Preload Script
 *
 * Bridges the gap between the main process and the renderer process.
 * Receives a MessagePort from the main process, creates the RPC client
 * and transport internally, then exposes only serializable method proxies
 * via contextBridge.exposeInMainWorld.
 *
 * Security model:
 * - contextIsolation: true  -- renderer cannot access Node.js APIs
 * - sandbox: true           -- preload runs in a sandboxed environment
 * - MessagePort never crosses the context bridge (it cannot be serialized)
 * - Only plain-object method proxies are exposed to the renderer world
 */

import { contextBridge, ipcRenderer } from 'electron';
import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { ElectronPreloadTransport } from '@rpc-bridge/transport-electron';

const logger = createConsoleLogger('Preload');

// ---------------------------------------------------------------------------
// Message encoding helpers (simple JSON as Uint8Array for the demo)
// ---------------------------------------------------------------------------

function encodeMessage(obj: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

function decodeMessage(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes));
}

// ---------------------------------------------------------------------------
// Port receipt & RPC client setup (all inside preload)
// ---------------------------------------------------------------------------

const PORT_TIMEOUT_MS = 10_000;

const clientReady: Promise<RpcClient> = new Promise<RpcClient>((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error('Timed out waiting for MessagePort from main process'));
  }, PORT_TIMEOUT_MS);

  ipcRenderer.once('rpc-bridge-port', (event) => {
    clearTimeout(timeout);

    const [port] = event.ports;
    if (!port) {
      reject(new Error('No MessagePort received from main process'));
      return;
    }

    logger.info('Received MessagePort, setting up RPC client...');

    const transport = new ElectronPreloadTransport({
      port,
      logger: createConsoleLogger('Preload-Transport'),
    });

    const rpcClient = new RpcClient({
      transport,
      logger: createConsoleLogger('Preload-Client'),
      skipHandshake: false,
    });

    rpcClient.waitReady().then(() => {
      logger.info('Client handshake complete, ready for RPCs');
      resolve(rpcClient);
    }).catch(reject);
  });

  // Request the port from the main process
  ipcRenderer.send('rpc-bridge-request-port');
});

// ---------------------------------------------------------------------------
// Expose typed RPC API via contextBridge
// Only serializable values cross the bridge -- no MessagePort, no classes.
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld('rpcBridge', {
  /**
   * Unary RPC: SayHello
   */
  sayHello: async (name: string): Promise<{ message: string; timestamp?: number }> => {
    const client = await clientReady;
    const result = await client.unary(
      'demo.hello.v1.HelloBridgeService/SayHello',
      encodeMessage({ name }),
    );
    return decodeMessage(result.data) as { message: string; timestamp?: number };
  },

  /**
   * Server-streaming RPC: WatchGreeting
   *
   * Since AsyncIterables cannot cross contextBridge, we use a callback API.
   * Returns a cancel function.
   */
  watchGreeting: (
    name: string,
    maxCount: number,
    intervalMs: number,
    callback: (event: { message: string; seq: number }) => void,
  ): (() => void) => {
    let cancelled = false;

    (async () => {
      try {
        const client = await clientReady;
        const stream = client.serverStream(
          'demo.hello.v1.HelloBridgeService/WatchGreeting',
          encodeMessage({ name, maxCount, intervalMs }),
        );
        for await (const bytes of stream) {
          if (cancelled) break;
          const event = decodeMessage(bytes) as { message: string; seq: number };
          callback(event);
        }
      } catch (err) {
        if (!cancelled) {
          logger.error('WatchGreeting error:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  },

  /**
   * Bidi-streaming RPC: Chat
   *
   * Returns controls for sending messages and stopping, with an onMessage callback.
   */
  startChat: (
    onMessage: (msg: { from: string; text: string; seq: number }) => void,
  ): { send: (text: string) => void; stop: () => void } => {
    let sendResolve: ((value: IteratorResult<Uint8Array>) => void) | undefined;
    let stopped = false;
    const queue: Uint8Array[] = [];
    let chatSeq = 0;

    const inputIterable: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<Uint8Array>> {
            if (queue.length > 0) {
              return Promise.resolve({ done: false, value: queue.shift()! });
            }
            if (stopped) {
              return Promise.resolve({ done: true, value: undefined as unknown as Uint8Array });
            }
            return new Promise<IteratorResult<Uint8Array>>((resolve) => {
              sendResolve = resolve;
            });
          },
          return(): Promise<IteratorResult<Uint8Array>> {
            stopped = true;
            return Promise.resolve({ done: true, value: undefined as unknown as Uint8Array });
          },
        };
      },
    };

    (async () => {
      try {
        const client = await clientReady;
        const rawStream = client.bidiStream(
          'demo.hello.v1.HelloBridgeService/Chat',
          inputIterable,
        );
        for await (const bytes of rawStream) {
          if (stopped) break;
          const msg = decodeMessage(bytes) as { from: string; text: string; seq: number };
          onMessage(msg);
        }
      } catch (err) {
        if (!stopped) {
          logger.error('Chat error:', err);
        }
      }
    })();

    return {
      send(text: string): void {
        if (stopped) return;
        chatSeq++;
        const encoded = encodeMessage({ from: 'user', text, seq: chatSeq });
        if (sendResolve) {
          const resolve = sendResolve;
          sendResolve = undefined;
          resolve({ done: false, value: encoded });
        } else {
          queue.push(encoded);
        }
      },
      stop(): void {
        stopped = true;
        if (sendResolve) {
          const resolve = sendResolve;
          sendResolve = undefined;
          resolve({ done: true, value: undefined as unknown as Uint8Array });
        }
      },
    };
  },
});
