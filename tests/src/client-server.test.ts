/**
 * Integration tests for RpcClient and RpcServer working together.
 *
 * Uses loopback transport for in-process testing.
 * Tests all four RPC patterns: unary, server-streaming, client-streaming, bidi.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RpcClient,
  RpcServer,
  MethodType,
  RpcError,
  RpcStatusCode,
  createLoopbackTransportPair,
  type CallContext,
  type ServiceRegistration,
} from '@rpc-bridge/core';

function createTestPair(service: ServiceRegistration) {
  const [clientTransport, serverTransport] = createLoopbackTransportPair();

  const server = new RpcServer({ transport: serverTransport });
  server.registerService(service);

  const client = new RpcClient({ transport: clientTransport });

  return { client, server, clientTransport, serverTransport };
}

describe('RpcClient + RpcServer Integration', () => {
  describe('Unary RPC', () => {
    it('should complete a simple unary call', async () => {
      const service: ServiceRegistration = {
        name: 'test.Svc',
        methods: {
          Echo: {
            type: MethodType.UNARY,
            handler: async (req: unknown, _ctx: CallContext) => {
              const { msg } = req as { msg: string };
              return { reply: `Echo: ${msg}` };
            },
          },
        },
      };

      const { client, server } = createTestPair(service);

      const result = await client.unary('test.Svc/Echo', { msg: 'hello' });
      const response = result as { reply: string };
      assert.equal(response.reply, 'Echo: hello');

      client.close();
      server.close();
    });

    it('should handle server errors in unary calls', async () => {
      const service: ServiceRegistration = {
        name: 'test.Svc',
        methods: {
          Fail: {
            type: MethodType.UNARY,
            handler: async () => {
              throw new RpcError(RpcStatusCode.INTERNAL, 'Something went wrong');
            },
          },
        },
      };

      const { client, server } = createTestPair(service);

      await assert.rejects(
        () => client.unary('test.Svc/Fail', {}),
        (err) => err instanceof RpcError && err.code === RpcStatusCode.INTERNAL,
      );

      client.close();
      server.close();
    });

    it('should return UNIMPLEMENTED for unknown methods', async () => {
      const service: ServiceRegistration = {
        name: 'test.Svc',
        methods: {},
      };

      const { client, server } = createTestPair(service);

      await assert.rejects(
        () => client.unary('test.Svc/Unknown', {}),
        (err) => err instanceof RpcError && err.code === RpcStatusCode.UNIMPLEMENTED,
      );

      client.close();
      server.close();
    });

    it('should return UNIMPLEMENTED for unknown services', async () => {
      const service: ServiceRegistration = {
        name: 'test.Svc',
        methods: {},
      };

      const { client, server } = createTestPair(service);

      await assert.rejects(
        () => client.unary('unknown.Svc/Method', {}),
        (err) => err instanceof RpcError && err.code === RpcStatusCode.UNIMPLEMENTED,
      );

      client.close();
      server.close();
    });
  });

  describe('Server Streaming RPC', () => {
    it('should stream multiple responses', async () => {
      const service: ServiceRegistration = {
        name: 'test.Svc',
        methods: {
          Count: {
            type: MethodType.SERVER_STREAMING,
            handler: async function* (req: unknown, _ctx: CallContext) {
              const { n } = req as { n: number };
              for (let i = 1; i <= n; i++) {
                yield { count: i };
              }
            } as unknown as (req: unknown, ctx: CallContext) => AsyncIterable<unknown>,
          },
        },
      };

      const { client, server } = createTestPair(service);

      const results: number[] = [];
      for await (const msg of client.serverStream('test.Svc/Count', { n: 5 })) {
        const resp = msg as { count: number };
        results.push(resp.count);
      }

      assert.deepEqual(results, [1, 2, 3, 4, 5]);

      client.close();
      server.close();
    });

    it('should handle empty server stream', async () => {
      const service: ServiceRegistration = {
        name: 'test.Svc',
        methods: {
          Empty: {
            type: MethodType.SERVER_STREAMING,
            handler: async function* () {
              // Yield nothing
            } as unknown as (req: unknown, ctx: CallContext) => AsyncIterable<unknown>,
          },
        },
      };

      const { client, server } = createTestPair(service);

      const results: unknown[] = [];
      for await (const msg of client.serverStream('test.Svc/Empty', {})) {
        results.push(msg);
      }

      assert.equal(results.length, 0);

      client.close();
      server.close();
    });
  });

  describe('Client Streaming RPC', () => {
    it('should collect client stream and return response', async () => {
      const service: ServiceRegistration = {
        name: 'test.Svc',
        methods: {
          Sum: {
            type: MethodType.CLIENT_STREAMING,
            handler: async (requests: AsyncIterable<unknown>, _ctx: CallContext) => {
              let sum = 0;
              let count = 0;
              for await (const req of requests) {
                const { value } = req as { value: number };
                sum += value;
                count++;
              }
              return { sum, count };
            },
          },
        },
      };

      const { client, server } = createTestPair(service);

      async function* generateRequests() {
        for (const value of [10, 20, 30, 40]) {
          yield { value };
        }
      }

      const result = await client.clientStream('test.Svc/Sum', generateRequests());
      const response = result as { sum: number; count: number };
      assert.equal(response.sum, 100);
      assert.equal(response.count, 4);

      client.close();
      server.close();
    });
  });

  describe('Bidirectional Streaming RPC', () => {
    it('should handle bidirectional message exchange', async () => {
      const service: ServiceRegistration = {
        name: 'test.Svc',
        methods: {
          Echo: {
            type: MethodType.BIDI_STREAMING,
            handler: async function* (requests: AsyncIterable<unknown>, _ctx: CallContext) {
              for await (const req of requests) {
                const { msg } = req as { msg: string };
                yield { reply: `Echo: ${msg}` };
              }
            } as unknown as (reqs: AsyncIterable<unknown>, ctx: CallContext) => AsyncIterable<unknown>,
          },
        },
      };

      const { client, server } = createTestPair(service);

      const messages = ['hello', 'world', 'foo'];

      async function* generateRequests() {
        for (const msg of messages) {
          yield { msg };
        }
      }

      const replies: string[] = [];
      for await (const msg of client.bidiStream('test.Svc/Echo', generateRequests())) {
        const resp = msg as { reply: string };
        replies.push(resp.reply);
      }

      assert.deepEqual(replies, ['Echo: hello', 'Echo: world', 'Echo: foo']);

      client.close();
      server.close();
    });
  });
});
