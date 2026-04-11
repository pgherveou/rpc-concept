/**
 * Electron Demo - Renderer Process
 *
 * Runs in the BrowserWindow's renderer context. Obtains the MessagePort
 * exposed by the preload script, creates an RPC client transport, and
 * mounts the shared demo UI.
 *
 * The renderer has no access to Node.js APIs (contextIsolation + sandbox).
 * All communication with the main process happens via the MessagePort-based
 * RPC bridge.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { ElectronPreloadTransport } from '@rpc-bridge/transport-electron';
import { createDemoUI, getDemoStyles, type DemoServiceClient } from '@rpc-bridge/shared-ui';

/** Type declaration for the bridge API exposed by the preload script. */
declare global {
  interface Window {
    rpcBridge: {
      getPort(): Promise<MessagePort>;
    };
  }
}

const logger = createConsoleLogger('Renderer');

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
// Client Setup
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  logger.info('Waiting for MessagePort from preload...');

  // Obtain the MessagePort exposed by the preload script
  const port = await window.rpcBridge.getPort();
  logger.info('Received MessagePort, setting up RPC client...');

  // Create the transport wrapping the MessagePort
  const transport = new ElectronPreloadTransport({
    port,
    logger: createConsoleLogger('Renderer-Transport'),
  });

  // Create the RPC client and wait for the handshake
  const rpcClient = new RpcClient({
    transport,
    logger: createConsoleLogger('Renderer-Client'),
    skipHandshake: false,
  });

  await rpcClient.waitReady();
  logger.info('Client handshake complete, ready for RPCs');

  // ---------------------------------------------------------------------------
  // Typed Client Wrapper
  // ---------------------------------------------------------------------------

  const client: DemoServiceClient = {
    async sayHello(request) {
      const result = await rpcClient.unary(
        'demo.hello.v1.HelloBridgeService/SayHello',
        encodeMessage(request),
      );
      return decodeMessage(result.data) as { message: string; timestamp?: number };
    },

    async *watchGreeting(request) {
      const stream = rpcClient.serverStream(
        'demo.hello.v1.HelloBridgeService/WatchGreeting',
        encodeMessage(request),
      );
      for await (const bytes of stream) {
        yield decodeMessage(bytes) as { message: string; seq: number };
      }
    },

    chat(requests) {
      // Transform typed request messages to raw bytes for the bidi stream
      const byteRequests: AsyncIterable<Uint8Array> = {
        [Symbol.asyncIterator]() {
          const iter = requests[Symbol.asyncIterator]();
          return {
            async next() {
              const result = await iter.next();
              if (result.done) {
                return { done: true, value: undefined as unknown as Uint8Array };
              }
              return {
                done: false,
                value: encodeMessage(result.value as Record<string, unknown>),
              };
            },
            async return(value?: unknown) {
              await iter.return?.(value);
              return { done: true, value: undefined as unknown as Uint8Array };
            },
          };
        },
      };

      const rawStream = rpcClient.bidiStream(
        'demo.hello.v1.HelloBridgeService/Chat',
        byteRequests,
      );

      // Transform raw bytes back to typed response messages
      return {
        [Symbol.asyncIterator]() {
          const iter = rawStream[Symbol.asyncIterator]();
          return {
            async next() {
              const result = await iter.next();
              if (result.done) {
                return {
                  done: true,
                  value: undefined as unknown as { from: string; text: string; seq: number },
                };
              }
              return {
                done: false,
                value: decodeMessage(result.value) as { from: string; text: string; seq: number },
              };
            },
            async return(value?: unknown) {
              await iter.return?.(value);
              return {
                done: true,
                value: undefined as unknown as { from: string; text: string; seq: number },
              };
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
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

init().catch((err) => {
  logger.error('Failed to initialize renderer:', err);
  const app = document.getElementById('app');
  if (app) {
    app.textContent = `Failed to initialize: ${err}`;
  }
});
