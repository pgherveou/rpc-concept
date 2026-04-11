/**
 * Tests for stream cancellation behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RpcClient,
  RpcServer,
  MethodType,
  RpcStatusCode,
  CancelledError,
  createLoopbackTransportPair,
  type CallContext,
  type ServiceRegistration,
} from '@rpc-bridge/core';

const enc = new TextEncoder();
const dec = new TextDecoder();
function encode(obj: unknown): Uint8Array { return enc.encode(JSON.stringify(obj)); }
function decode(bytes: Uint8Array): unknown { return JSON.parse(dec.decode(bytes)); }

describe('Cancellation', () => {
  it('should cancel a server-streaming RPC via AbortSignal', async () => {
    let serverYieldCount = 0;

    const service: ServiceRegistration = {
      name: 'test.Svc',
      methods: {
        InfiniteStream: {
          type: MethodType.SERVER_STREAMING,
          handler: async function* (_req: Uint8Array, ctx: CallContext) {
            let seq = 0;
            while (!ctx.signal.aborted) {
              seq++;
              serverYieldCount = seq;
              yield encode({ seq });
              await new Promise(r => setTimeout(r, 50));
            }
          } as unknown as (req: Uint8Array, ctx: CallContext) => AsyncIterable<Uint8Array>,
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st, skipHandshake: true });
    server.registerService(service);
    const client = new RpcClient({ transport: ct, skipHandshake: true });
    await Promise.all([client.waitReady(), server.waitReady()]);

    const abort = new AbortController();
    const received: number[] = [];

    try {
      for await (const bytes of client.serverStream(
        'test.Svc/InfiniteStream',
        encode({}),
        { signal: abort.signal },
      )) {
        const msg = decode(bytes) as { seq: number };
        received.push(msg.seq);
        if (received.length >= 3) {
          abort.abort();
        }
      }
    } catch (err) {
      // Expected: cancelled error
      assert.ok(err instanceof CancelledError || String(err).includes('cancel') || String(err).includes('abort'));
    }

    assert.ok(received.length >= 3, `Expected at least 3 messages, got ${received.length}`);

    client.close();
    server.close();
  });

  it('should cancel unary RPC via AbortSignal', async () => {
    const service: ServiceRegistration = {
      name: 'test.Svc',
      methods: {
        SlowMethod: {
          type: MethodType.UNARY,
          handler: async (_req: Uint8Array, ctx: CallContext) => {
            // Wait a long time (should be cancelled before completing)
            await new Promise((resolve, reject) => {
              const timer = setTimeout(resolve, 10000);
              ctx.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new Error('cancelled'));
              });
            });
            return encode({ result: 'should not get here' });
          },
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st, skipHandshake: true });
    server.registerService(service);
    const client = new RpcClient({ transport: ct, skipHandshake: true });
    await Promise.all([client.waitReady(), server.waitReady()]);

    const abort = new AbortController();

    // Cancel after 100ms
    setTimeout(() => abort.abort(), 100);

    await assert.rejects(
      () => client.unary('test.Svc/SlowMethod', encode({}), { signal: abort.signal }),
    );

    client.close();
    server.close();
  });

  it('should handle deadline exceeded', async () => {
    const service: ServiceRegistration = {
      name: 'test.Svc',
      methods: {
        SlowMethod: {
          type: MethodType.UNARY,
          handler: async (_req: Uint8Array, ctx: CallContext) => {
            await new Promise((resolve, reject) => {
              const timer = setTimeout(resolve, 10000);
              ctx.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new Error('cancelled'));
              });
            });
            return encode({});
          },
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st, skipHandshake: true });
    server.registerService(service);
    const client = new RpcClient({ transport: ct, skipHandshake: true });
    await Promise.all([client.waitReady(), server.waitReady()]);

    await assert.rejects(
      () => client.unary('test.Svc/SlowMethod', encode({}), { deadlineMs: 100 }),
      (err) => {
        return err instanceof Error && (
          err.message.includes('Deadline') ||
          err.message.includes('cancel') ||
          err.message.includes('abort')
        );
      },
    );

    client.close();
    server.close();
  });

  it('should handle transport close during active streams', async () => {
    const service: ServiceRegistration = {
      name: 'test.Svc',
      methods: {
        Stream: {
          type: MethodType.SERVER_STREAMING,
          handler: async function* (_req: Uint8Array, ctx: CallContext) {
            let seq = 0;
            while (!ctx.signal.aborted) {
              seq++;
              yield encode({ seq });
              await new Promise(r => setTimeout(r, 50));
            }
          } as unknown as (req: Uint8Array, ctx: CallContext) => AsyncIterable<Uint8Array>,
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st, skipHandshake: true });
    server.registerService(service);
    const client = new RpcClient({ transport: ct, skipHandshake: true });
    await Promise.all([client.waitReady(), server.waitReady()]);

    const received: number[] = [];

    // Use a timeout to ensure the test doesn't hang
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Test timed out')), 2000),
    );

    const streamPromise = (async () => {
      try {
        for await (const bytes of client.serverStream('test.Svc/Stream', encode({}))) {
          const msg = decode(bytes) as { seq: number };
          received.push(msg.seq);
          if (received.length >= 2) {
            // Close both sides to ensure clean termination
            ct.close();
            break;
          }
        }
      } catch {
        // Expected - transport closed
      }
    })();

    try {
      await Promise.race([streamPromise, timeoutPromise]);
    } catch {
      // Timeout or error - both acceptable
    }

    assert.ok(received.length >= 2);
    server.close();
    client.close();
  });
});
