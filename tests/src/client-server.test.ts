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

const enc = new TextEncoder();
const dec = new TextDecoder();
function encode(obj: unknown): Uint8Array { return enc.encode(JSON.stringify(obj)); }
function decode(bytes: Uint8Array): unknown { return JSON.parse(dec.decode(bytes)); }

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
            handler: async (reqBytes: Uint8Array, _ctx: CallContext) => {
              const req = decode(reqBytes) as { msg: string };
              return encode({ reply: `Echo: ${req.msg}` });
            },
          },
        },
      };

      const { client, server } = createTestPair(service);

      const result = await client.unary('test.Svc/Echo', encode({ msg: 'hello' }));
      const response = decode(result) as { reply: string };
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
        () => client.unary('test.Svc/Fail', encode({})),
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
        () => client.unary('test.Svc/Unknown', encode({})),
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
        () => client.unary('unknown.Svc/Method', encode({})),
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
            handler: async function* (reqBytes: Uint8Array, _ctx: CallContext) {
              const req = decode(reqBytes) as { n: number };
              for (let i = 1; i <= req.n; i++) {
                yield encode({ count: i });
              }
            } as unknown as (req: Uint8Array, ctx: CallContext) => AsyncIterable<Uint8Array>,
          },
        },
      };

      const { client, server } = createTestPair(service);

      const results: number[] = [];
      for await (const bytes of client.serverStream('test.Svc/Count', encode({ n: 5 }))) {
        const msg = decode(bytes) as { count: number };
        results.push(msg.count);
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
            } as unknown as (req: Uint8Array, ctx: CallContext) => AsyncIterable<Uint8Array>,
          },
        },
      };

      const { client, server } = createTestPair(service);

      const results: unknown[] = [];
      for await (const bytes of client.serverStream('test.Svc/Empty', encode({}))) {
        results.push(decode(bytes));
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
            handler: async (requests: AsyncIterable<Uint8Array>, _ctx: CallContext) => {
              let sum = 0;
              let count = 0;
              for await (const reqBytes of requests) {
                const req = decode(reqBytes) as { value: number };
                sum += req.value;
                count++;
              }
              return encode({ sum, count });
            },
          },
        },
      };

      const { client, server } = createTestPair(service);

      async function* generateRequests() {
        for (const value of [10, 20, 30, 40]) {
          yield encode({ value });
        }
      }

      const result = await client.clientStream('test.Svc/Sum', generateRequests());
      const response = decode(result) as { sum: number; count: number };
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
            handler: async function* (requests: AsyncIterable<Uint8Array>, _ctx: CallContext) {
              for await (const reqBytes of requests) {
                const req = decode(reqBytes) as { msg: string };
                yield encode({ reply: `Echo: ${req.msg}` });
              }
            } as unknown as (reqs: AsyncIterable<Uint8Array>, ctx: CallContext) => AsyncIterable<Uint8Array>,
          },
        },
      };

      const { client, server } = createTestPair(service);

      const messages = ['hello', 'world', 'foo'];

      async function* generateRequests() {
        for (const msg of messages) {
          yield encode({ msg });
        }
      }

      const replies: string[] = [];
      for await (const bytes of client.bidiStream('test.Svc/Echo', generateRequests())) {
        const msg = decode(bytes) as { reply: string };
        replies.push(msg.reply);
      }

      assert.deepEqual(replies, ['Echo: hello', 'Echo: world', 'Echo: foo']);

      client.close();
      server.close();
    });
  });
});
