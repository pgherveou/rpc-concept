/**
 * Tests for stream cancellation behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RpcClient,
  RpcServer,
  MethodType,
  CancelledError,
  createLoopbackTransportPair,
  type CallContext,
  type ServiceRegistration,
} from '@rpc-bridge/core';

describe('Cancellation', () => {
  it('should cancel a server-streaming RPC via AbortSignal', async () => {
    const service: ServiceRegistration = {
      name: 'test.Svc',
      methods: {
        InfiniteStream: {
          type: MethodType.SERVER_STREAMING,
          handler: async function* (_req: unknown, ctx: CallContext) {
            let seq = 0;
            while (!ctx.signal.aborted) {
              seq++;
              yield { seq };
              await new Promise(r => setTimeout(r, 50));
            }
          } as unknown as (req: unknown, ctx: CallContext) => AsyncIterable<unknown>,
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st });
    server.registerService(service);
    const client = new RpcClient({ transport: ct });

    const abort = new AbortController();
    const received: number[] = [];

    try {
      for await (const msg of client.serverStream(
        'test.Svc/InfiniteStream',
        {},
        { signal: abort.signal },
      )) {
        const resp = msg as { seq: number };
        received.push(resp.seq);
        if (received.length >= 3) {
          abort.abort();
        }
      }
    } catch (err) {
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
          handler: async (_req: unknown, ctx: CallContext) => {
            await new Promise((resolve, reject) => {
              const timer = setTimeout(resolve, 10000);
              ctx.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new Error('cancelled'));
              });
            });
            return { result: 'should not get here' };
          },
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st });
    server.registerService(service);
    const client = new RpcClient({ transport: ct });

    const abort = new AbortController();
    setTimeout(() => abort.abort(), 100);

    await assert.rejects(
      () => client.unary('test.Svc/SlowMethod', {}, { signal: abort.signal }),
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
          handler: async (_req: unknown, ctx: CallContext) => {
            await new Promise((resolve, reject) => {
              const timer = setTimeout(resolve, 10000);
              ctx.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new Error('cancelled'));
              });
            });
            return {};
          },
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st });
    server.registerService(service);
    const client = new RpcClient({ transport: ct });

    await assert.rejects(
      () => client.unary('test.Svc/SlowMethod', {}, { deadlineMs: 100 }),
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
          handler: async function* (_req: unknown, ctx: CallContext) {
            let seq = 0;
            while (!ctx.signal.aborted) {
              seq++;
              yield { seq };
              await new Promise(r => setTimeout(r, 50));
            }
          } as unknown as (req: unknown, ctx: CallContext) => AsyncIterable<unknown>,
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st });
    server.registerService(service);
    const client = new RpcClient({ transport: ct });

    const received: number[] = [];

    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Test timed out')), 2000),
    );

    const streamPromise = (async () => {
      try {
        for await (const msg of client.serverStream('test.Svc/Stream', {})) {
          const resp = msg as { seq: number };
          received.push(resp.seq);
          if (received.length >= 2) {
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
