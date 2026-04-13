/**
 * Tests for the startup error feature: typed errors from streaming RPCs.
 *
 * Covers the full path: StartupError thrown by handler → ERROR frame with
 * details → client receives Subscription with typed error or success.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RpcClient,
  RpcServer,
  MethodType,
  RpcError,
  RpcStatusCode,
  StartupError,
  createLoopbackTransportPair,
  type CallContext,
  type ServiceRegistration,
} from '@rpc-bridge/core';

function createTestPair(service: ServiceRegistration) {
  const [clientTransport, serverTransport] = createLoopbackTransportPair();
  const server = new RpcServer({ transport: serverTransport });
  server.registerService(service);
  const client = new RpcClient({ transport: clientTransport });
  return { client, server };
}

describe('Startup Error', () => {
  it('should return startup error when handler throws before yielding', async () => {
    const errorDetails = { reason: 'not_found', id: 42 };
    const { client, server } = createTestPair({
      name: 'test.Svc',
      methods: {
        Subscribe: {
          type: MethodType.SERVER_STREAMING,
          handler: (_req: unknown, _ctx: CallContext) => {
            return (async function* () {
              throw new StartupError(errorDetails, 'Subscription failed');
            })();
          },
        },
      },
    });

    try {
      const result = await client.serverStreamWithStartupError(
        'test.Svc/Subscribe',
        { id: 1 },
      );
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.deepStrictEqual(result.error, errorDetails);
      }
    } finally {
      client.close();
      server.close();
    }
  });

  it('should return successful stream when handler yields normally', async () => {
    const { client, server } = createTestPair({
      name: 'test.Svc',
      methods: {
        Subscribe: {
          type: MethodType.SERVER_STREAMING,
          handler: (_req: unknown, _ctx: CallContext) => {
            return (async function* () {
              yield { event: 'a' };
              yield { event: 'b' };
              yield { event: 'c' };
            })();
          },
        },
      },
    });

    try {
      const result = await client.serverStreamWithStartupError(
        'test.Svc/Subscribe',
        {},
      );
      assert.equal(result.ok, true);
      if (result.ok) {
        const events: unknown[] = [];
        for await (const event of result.events) {
          events.push(event);
        }
        assert.deepStrictEqual(events, [
          { event: 'a' },
          { event: 'b' },
          { event: 'c' },
        ]);
      }
    } finally {
      client.close();
      server.close();
    }
  });

  it('should return empty stream when handler yields nothing', async () => {
    const { client, server } = createTestPair({
      name: 'test.Svc',
      methods: {
        Subscribe: {
          type: MethodType.SERVER_STREAMING,
          handler: (_req: unknown, _ctx: CallContext) => {
            return (async function* () {
              // empty
            })();
          },
        },
      },
    });

    try {
      const result = await client.serverStreamWithStartupError(
        'test.Svc/Subscribe',
        {},
      );
      assert.equal(result.ok, true);
      if (result.ok) {
        const events: unknown[] = [];
        for await (const event of result.events) {
          events.push(event);
        }
        assert.deepStrictEqual(events, []);
      }
    } finally {
      client.close();
      server.close();
    }
  });

  it('should throw RpcError for generic errors without details', async () => {
    const { client, server } = createTestPair({
      name: 'test.Svc',
      methods: {
        Subscribe: {
          type: MethodType.SERVER_STREAMING,
          handler: (_req: unknown, _ctx: CallContext) => {
            return (async function* () {
              throw new RpcError(RpcStatusCode.INTERNAL, 'something broke');
            })();
          },
        },
      },
    });

    try {
      await assert.rejects(
        () => client.serverStreamWithStartupError('test.Svc/Subscribe', {}),
        (err: unknown) => {
          assert(err instanceof RpcError);
          assert.equal(err.code, RpcStatusCode.INTERNAL);
          assert.equal(err.message, 'something broke');
          return true;
        },
      );
    } finally {
      client.close();
      server.close();
    }
  });

  it('should propagate mid-stream errors through events iterator', async () => {
    const { client, server } = createTestPair({
      name: 'test.Svc',
      methods: {
        Subscribe: {
          type: MethodType.SERVER_STREAMING,
          handler: (_req: unknown, _ctx: CallContext) => {
            return (async function* () {
              yield { event: 'first' };
              throw new Error('mid-stream failure');
            })();
          },
        },
      },
    });

    try {
      const result = await client.serverStreamWithStartupError(
        'test.Svc/Subscribe',
        {},
      );
      assert.equal(result.ok, true);
      if (result.ok) {
        const events: unknown[] = [];
        await assert.rejects(async () => {
          for await (const event of result.events) {
            events.push(event);
          }
        });
        assert.deepStrictEqual(events, [{ event: 'first' }]);
      }
    } finally {
      client.close();
      server.close();
    }
  });

  it('should pass details through ERROR frame JSON round-trip', async () => {
    const complexDetails = {
      code: 'PAYMENT_EXPIRED',
      metadata: { paymentId: 'pay-123', timestamp: 1234567890 },
    };

    const { client, server } = createTestPair({
      name: 'test.Svc',
      methods: {
        Subscribe: {
          type: MethodType.SERVER_STREAMING,
          handler: (_req: unknown, _ctx: CallContext) => {
            return (async function* () {
              throw new StartupError(complexDetails);
            })();
          },
        },
      },
    });

    try {
      const result = await client.serverStreamWithStartupError(
        'test.Svc/Subscribe',
        {},
      );
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.deepStrictEqual(result.error, complexDetails);
      }
    } finally {
      client.close();
      server.close();
    }
  });
});
