/**
 * Web Demo - Sandboxed Iframe Client
 *
 * This runs inside the sandboxed iframe and communicates with the host
 * page's RPC server over a MessagePort received via postMessage.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';
import { createDemoUI, getDemoStyles, type DemoServiceClient } from '@rpc-bridge/shared-ui';

const logger = createConsoleLogger('Iframe');

// Simple JSON encode/decode for demo messages
function encodeMessage(obj: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}
function decodeMessage(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Wait for the MessagePort from the host
window.addEventListener('message', async (event) => {
  if (event.data?.type !== 'rpc-bridge-init') return;

  const port = event.ports[0];
  if (!port) {
    logger.error('No MessagePort received!');
    return;
  }

  logger.info('Received MessagePort from host, setting up client...');

  const transport = new MessagePortTransport({
    port,
    logger: createConsoleLogger('Iframe-Transport'),
  });

  const rpcClient = new RpcClient({
    transport,
    logger: createConsoleLogger('Iframe-Client'),
    skipHandshake: false,
  });

  await rpcClient.waitReady();
  logger.info('Client handshake complete, ready for RPCs');

  // Create a typed client wrapper
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
      // Transform typed messages to bytes for the raw bidi stream
      const byteRequests: AsyncIterable<Uint8Array> = {
        [Symbol.asyncIterator]() {
          const iter = requests[Symbol.asyncIterator]();
          return {
            async next() {
              const result = await iter.next();
              if (result.done) return { done: true, value: undefined as unknown as Uint8Array };
              return { done: false, value: encodeMessage(result.value as Record<string, unknown>) };
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

      // Transform bytes back to typed messages
      return {
        [Symbol.asyncIterator]() {
          const iter = rawStream[Symbol.asyncIterator]();
          return {
            async next() {
              const result = await iter.next();
              if (result.done) return { done: true, value: undefined as unknown as { from: string; text: string; seq: number } };
              return {
                done: false,
                value: decodeMessage(result.value) as { from: string; text: string; seq: number },
              };
            },
            async return(value?: unknown) {
              await iter.return?.(value);
              return { done: true, value: undefined as unknown as { from: string; text: string; seq: number } };
            },
          };
        },
      };
    },
  };

  // Mount the shared demo UI
  const style = document.createElement('style');
  style.textContent = getDemoStyles();
  document.head.appendChild(style);

  createDemoUI({
    root: document.getElementById('app')!,
    client,
    platform: 'Web (iframe)',
  });
});
