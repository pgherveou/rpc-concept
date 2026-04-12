/**
 * Tests for concurrent streams and malformed frame handling.
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
  type ServiceRegistration,
} from '@rpc-bridge/core';

const enc = new TextEncoder();
const dec = new TextDecoder();
function encode(obj: unknown): Uint8Array { return enc.encode(JSON.stringify(obj)); }
function decode(bytes: Uint8Array): unknown { return JSON.parse(dec.decode(bytes)); }

describe('Concurrent streams', () => {
  it('should handle concurrent streams independently', async () => {
    const service: ServiceRegistration = {
      name: 'test.Svc',
      methods: {
        Echo: {
          type: MethodType.UNARY,
          handler: async (reqBytes: Uint8Array) => {
            const req = decode(reqBytes) as { id: number };
            await new Promise(r => setTimeout(r, 10));
            return encode({ id: req.id, reply: `response-${req.id}` });
          },
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st });
    server.registerService(service);
    const client = new RpcClient({ transport: ct });

    const promises = Array.from({ length: 10 }, (_, i) =>
      client.unary('test.Svc/Echo', encode({ id: i })),
    );

    const results = await Promise.all(promises);

    for (let i = 0; i < 10; i++) {
      const resp = decode(results[i]) as { id: number; reply: string };
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
      /end of data|varint|premature EOF/i,
    );
  });

  it('should throw on truncated length-delimited field', () => {
    assert.throws(
      () => decodeFrame(new Uint8Array([0x22, 0x10, 0x01])),
      /end of data|premature EOF/i,
    );
  });
});
