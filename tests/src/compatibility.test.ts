/**
 * Tests for forward compatibility (unknown fields/frame types).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FrameType,
  encodeFrame,
  decodeFrame,
  createMessageFrame,
  type RpcFrame,
  createLoopbackTransportPair,
  RpcClient,
  RpcServer,
  MethodType,
  type ServiceRegistration,
} from '@rpc-bridge/core';

const enc = new TextEncoder();
function encode(obj: unknown): Uint8Array { return enc.encode(JSON.stringify(obj)); }
function decode(bytes: Uint8Array): unknown { return JSON.parse(new TextDecoder().decode(bytes)); }

describe('Forward Compatibility', () => {
  it('should ignore unknown frame types', () => {
    const frame: RpcFrame = {
      type: 99 as FrameType,
      streamId: 1,
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.type, 99);
  });

  it('should preserve unknown fields in encoding round-trip', () => {
    const base = createMessageFrame(1, new Uint8Array([0xAA, 0xBB]));
    const encoded = encodeFrame(base);

    // Append unknown field 9, varint wire type, value 42
    const extraField = new Uint8Array([72, 42]);
    const combined = new Uint8Array(encoded.length + extraField.length);
    combined.set(encoded);
    combined.set(extraField, encoded.length);

    const decoded = decodeFrame(combined);
    assert.equal(decoded.type, FrameType.MESSAGE);
    assert.equal(decoded.streamId, 1);
    assert.deepEqual(decoded.payload, new Uint8Array([0xAA, 0xBB]));
  });

  it('should skip unknown length-delimited fields', () => {
    const base = createMessageFrame(1, new Uint8Array([1]));
    const encoded = encodeFrame(base);

    // Field 13 (unused), length-delimited, 4 bytes
    const extraField = new Uint8Array([106, 4, 0xDE, 0xAD, 0xBE, 0xEF]);
    const combined = new Uint8Array(encoded.length + extraField.length);
    combined.set(encoded);
    combined.set(extraField, encoded.length);

    const decoded = decodeFrame(combined);
    assert.equal(decoded.type, FrameType.MESSAGE);
    assert.deepEqual(decoded.payload, new Uint8Array([1]));
  });
});

describe('Backward Compatibility', () => {
  it('should decode frames missing optional fields', () => {
    const frame: RpcFrame = {
      type: FrameType.OPEN,
      streamId: 1,
      method: 'test.Svc/Method',
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.errorCode, undefined);
    assert.equal(decoded.errorMessage, undefined);
    assert.equal(decoded.payload, undefined);
  });

  it('should work without any optional fields', async () => {
    const service: ServiceRegistration = {
      name: 'test.Svc',
      methods: {
        Ping: {
          type: MethodType.UNARY,
          handler: async () => encode({ pong: true }),
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st });
    server.registerService(service);
    const client = new RpcClient({ transport: ct });

    const result = await client.unary('test.Svc/Ping', encode({}));
    const resp = decode(result) as { pong: boolean };
    assert.equal(resp.pong, true);

    client.close();
    server.close();
  });
});

describe('Error code compatibility', () => {
  it('should handle standard error codes', () => {
    const codes = [1, 3, 4, 12, 13];
    for (const code of codes) {
      const frame: RpcFrame = {
        type: FrameType.ERROR,
        streamId: 1,
        errorCode: code,
        errorMessage: `Error with code ${code}`,
      };
      const encoded = encodeFrame(frame);
      const decoded = decodeFrame(encoded);
      assert.equal(decoded.errorCode, code);
      assert.equal(decoded.errorMessage, `Error with code ${code}`);
    }
  });

  it('should handle unknown error codes gracefully', () => {
    const frame: RpcFrame = {
      type: FrameType.ERROR,
      streamId: 1,
      errorCode: 999,
      errorMessage: 'Future error type',
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.errorCode, 999);
    assert.equal(decoded.errorMessage, 'Future error type');
  });
});
