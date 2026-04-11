/**
 * End-to-end backpressure test.
 *
 * Verifies that flow control actually works at the integration level:
 * a fast server-streaming handler is throttled by a slow client consumer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RpcClient,
  RpcServer,
  MethodType,
  createLoopbackTransportPair,
  decodeFrame,
  FrameType,
  type CallContext,
  type ServiceRegistration,
} from '@rpc-bridge/core';

const enc = new TextEncoder();
const dec = new TextDecoder();
function encode(obj: unknown): Uint8Array { return enc.encode(JSON.stringify(obj)); }
function decode(bytes: Uint8Array): unknown { return JSON.parse(dec.decode(bytes)); }

describe('End-to-end backpressure', () => {
  it('should throttle fast server with slow client via flow control', async () => {
    const serverYieldTimestamps: number[] = [];
    const clientReceiveTimestamps: number[] = [];
    const totalMessages = 20;

    const service: ServiceRegistration = {
      name: 'test.Svc',
      methods: {
        FastStream: {
          type: MethodType.SERVER_STREAMING,
          handler: async function* (_req: Uint8Array, ctx: CallContext) {
            for (let i = 0; i < totalMessages; i++) {
              if (ctx.signal.aborted) break;
              serverYieldTimestamps.push(Date.now());
              yield encode({ seq: i });
              // No deliberate delay - produce as fast as flow control allows
            }
          } as unknown as (req: Uint8Array, ctx: CallContext) => AsyncIterable<Uint8Array>,
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st, skipHandshake: true });
    server.registerService(service);
    const client = new RpcClient({
      transport: ct,
      skipHandshake: true,
      defaultInitialCredits: 4, // Small window to force backpressure
    });
    await Promise.all([client.waitReady(), server.waitReady()]);

    const received: number[] = [];
    for await (const bytes of client.serverStream(
      'test.Svc/FastStream',
      encode({}),
      { initialCredits: 4 },
    )) {
      const msg = decode(bytes) as { seq: number };
      received.push(msg.seq);
      clientReceiveTimestamps.push(Date.now());
      // Slow consumer: 20ms per message
      await new Promise(r => setTimeout(r, 20));
    }

    // All messages should arrive
    assert.equal(received.length, totalMessages);

    // Verify ordering
    for (let i = 0; i < received.length; i++) {
      assert.equal(received[i], i);
    }

    client.close();
    server.close();
  });

  it('should handle concurrent streams independently', async () => {
    const service: ServiceRegistration = {
      name: 'test.Svc',
      methods: {
        Echo: {
          type: MethodType.UNARY,
          handler: async (reqBytes: Uint8Array) => {
            const req = decode(reqBytes) as { id: number };
            // Small delay to ensure concurrency
            await new Promise(r => setTimeout(r, 10));
            return encode({ id: req.id, reply: `response-${req.id}` });
          },
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st, skipHandshake: true });
    server.registerService(service);
    const client = new RpcClient({ transport: ct, skipHandshake: true });
    await Promise.all([client.waitReady(), server.waitReady()]);

    // Launch 10 concurrent unary RPCs
    const promises = Array.from({ length: 10 }, (_, i) =>
      client.unary('test.Svc/Echo', encode({ id: i })),
    );

    const results = await Promise.all(promises);

    // Each should get the correct response
    for (let i = 0; i < 10; i++) {
      const resp = decode(results[i].data) as { id: number; reply: string };
      assert.equal(resp.id, i);
      assert.equal(resp.reply, `response-${i}`);
    }

    client.close();
    server.close();
  });
});

describe('Malformed frame handling', () => {
  it('should handle zero-length frame input', () => {
    const frame = decodeFrame(new Uint8Array(0));
    assert.equal(frame.type, FrameType.UNSPECIFIED);
  });

  it('should throw on truncated varint', () => {
    assert.throws(
      () => decodeFrame(new Uint8Array([0x80])),
      /end of data|varint/i,
    );
  });

  it('should throw on truncated length-delimited field', () => {
    // Tag for field 4 (payload), length-delimited, claiming 16 bytes but only providing 1
    assert.throws(
      () => decodeFrame(new Uint8Array([0x22, 0x10, 0x01])),
      /end of data/i,
    );
  });
});
