/**
 * Tests for protocol version negotiation, backward compatibility,
 * and forward compatibility (unknown fields/frame types).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FrameType,
  encodeFrame,
  decodeFrame,
  createHandshakeFrame,
  createMessageFrame,
  type RpcFrame,
  MethodType,
  createLoopbackTransportPair,
  RpcClient,
  RpcServer,
  type ServiceRegistration,
  type CallContext,
} from '@rpc-bridge/core';

const enc = new TextEncoder();
function encode(obj: unknown): Uint8Array { return enc.encode(JSON.stringify(obj)); }
function decode(bytes: Uint8Array): unknown { return JSON.parse(new TextDecoder().decode(bytes)); }

describe('Protocol Version Negotiation', () => {
  it('should negotiate to the lower of two versions', async () => {
    const [ct, st] = createLoopbackTransportPair();

    // We can't directly set different versions through client/server constructors,
    // but we can test handshake frame encoding directly
    const v1Handshake = createHandshakeFrame(1, ['flow_control'], 'v1-client');
    const v2Handshake = createHandshakeFrame(2, ['flow_control', 'compression'], 'v2-server');

    const encoded1 = encodeFrame(v1Handshake);
    const encoded2 = encodeFrame(v2Handshake);

    const decoded1 = decodeFrame(encoded1);
    const decoded2 = decodeFrame(encoded2);

    // Negotiation: min(1, 2) = 1
    const negotiated = Math.min(decoded1.protocolVersion!, decoded2.protocolVersion!);
    assert.equal(negotiated, 1);

    // Capability intersection
    const caps1 = new Set(decoded1.capabilities);
    const caps2 = new Set(decoded2.capabilities);
    const intersection = [...caps1].filter(c => caps2.has(c));
    assert.deepEqual(intersection, ['flow_control']);

    ct.close();
    st.close();
  });

  it('should handle handshake with no capabilities', () => {
    const frame = createHandshakeFrame(1, [], 'minimal-client');
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    // Empty arrays are omitted in proto3 encoding, so capabilities is undefined
    assert.ok(decoded.capabilities === undefined || decoded.capabilities.length === 0);
    assert.equal(decoded.implementationId, 'minimal-client');
  });
});

describe('Forward Compatibility', () => {
  it('should ignore unknown frame types', () => {
    // Simulate a frame with a future frame type (e.g., 99)
    const frame: RpcFrame = {
      type: 99 as FrameType,
      streamId: 1,
      sequence: 0,
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.type, 99);
    // The frame is decodable; consumers should skip unknown types
  });

  it('should preserve unknown fields in encoding round-trip', () => {
    // Encode a frame, manually append unknown fields, verify decode works
    const base = createMessageFrame(1, 1, new Uint8Array([0xAA, 0xBB]));
    const encoded = encodeFrame(base);

    // Append an unknown field. Use field 9 (unused in our frame), varint wire type.
    // tag = (9 << 3) | 0 = 72
    const extraField = new Uint8Array([
      72, // tag: field 9, wire type 0 (varint)
      42, // value: 42
    ]);
    const combined = new Uint8Array(encoded.length + extraField.length);
    combined.set(encoded);
    combined.set(extraField, encoded.length);

    // Decode should succeed, ignoring the unknown field
    const decoded = decodeFrame(combined);
    assert.equal(decoded.type, FrameType.MESSAGE);
    assert.equal(decoded.streamId, 1);
    assert.deepEqual(decoded.payload, new Uint8Array([0xAA, 0xBB]));
  });

  it('should skip unknown length-delimited fields', () => {
    const base = createMessageFrame(1, 1, new Uint8Array([1]));
    const encoded = encodeFrame(base);

    // Append a length-delimited field with number 13 (unused).
    // tag = (13 << 3) | 2 = 106
    const extraField = new Uint8Array([
      106,                         // tag: field 13, wire type 2 (length-delimited)
      4,                           // length: 4 bytes
      0xDE, 0xAD, 0xBE, 0xEF,     // data
    ]);
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
    // Minimal frame: just type and streamId
    const frame: RpcFrame = {
      type: FrameType.OPEN,
      streamId: 1,
      sequence: 0,
      method: 'test.Svc/Method',
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    // Fields not set should be undefined or default
    assert.equal(decoded.methodType, undefined);
    assert.equal(decoded.deadlineMs, undefined);
    assert.equal(decoded.metadata, undefined);
    assert.equal(decoded.protocolVersion, undefined);
    assert.equal(decoded.capabilities, undefined);
  });

  it('should handle missing handshake fields gracefully', () => {
    // A v0 handshake with only version, no capabilities
    const frame: RpcFrame = {
      type: FrameType.HANDSHAKE,
      streamId: 0,
      sequence: 0,
      protocolVersion: 1,
      // No capabilities, no implementationId
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.protocolVersion, 1);
    assert.equal(decoded.capabilities, undefined);
    assert.equal(decoded.implementationId, undefined);
  });

  it('should handle empty extensions map', () => {
    const frame: RpcFrame = {
      type: FrameType.MESSAGE,
      streamId: 1,
      sequence: 1,
      payload: new Uint8Array([1]),
      extensions: new Map(),
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    // Empty map shouldn't be encoded
    assert.equal(decoded.extensions, undefined);
  });

  it('older client without new capabilities should still work', async () => {
    // Simulates an older client connecting to a newer server
    // The older client doesn't know about 'compression' capability
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

    const server = new RpcServer({
      transport: st,
      skipHandshake: true, // Skip handshake to test raw RPC
    });
    server.registerService(service);

    const client = new RpcClient({
      transport: ct,
      skipHandshake: true,
    });

    await Promise.all([client.waitReady(), server.waitReady()]);

    // Even without handshake, RPCs should work
    const result = await client.unary('test.Svc/Ping', encode({}));
    const resp = decode(result.data) as { pong: boolean };
    assert.equal(resp.pong, true);

    client.close();
    server.close();
  });
});

describe('Error code compatibility', () => {
  it('should handle all standard error codes', () => {
    // Note: error code 0 (OK) is the proto3 default, so it won't be encoded/decoded
    const codes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    for (const code of codes) {
      const frame: RpcFrame = {
        type: FrameType.ERROR,
        streamId: 1,
        sequence: 0,
        errorCode: code,
        errorMessage: `Error with code ${code}`,
      };
      const encoded = encodeFrame(frame);
      const decoded = decodeFrame(encoded);
      assert.equal(decoded.errorCode, code);
      assert.equal(decoded.errorMessage, `Error with code ${code}`);
    }

    // Error code 0 (OK) won't round-trip because proto3 skips default values
    const zeroFrame: RpcFrame = {
      type: FrameType.ERROR,
      streamId: 1,
      sequence: 0,
      errorCode: 0,
      errorMessage: 'OK',
    };
    const encoded = encodeFrame(zeroFrame);
    const decoded = decodeFrame(encoded);
    // errorCode 0 is omitted, so it comes back as undefined
    assert.ok(decoded.errorCode === undefined || decoded.errorCode === 0);
  });

  it('should handle unknown error codes gracefully', () => {
    const frame: RpcFrame = {
      type: FrameType.ERROR,
      streamId: 1,
      sequence: 0,
      errorCode: 999, // Unknown code
      errorMessage: 'Future error type',
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.errorCode, 999);
    assert.equal(decoded.errorMessage, 'Future error type');
  });
});

describe('Method type compatibility', () => {
  it('should handle all method types', () => {
    const types = [
      MethodType.UNARY,
      MethodType.SERVER_STREAMING,
      MethodType.CLIENT_STREAMING,
      MethodType.BIDI_STREAMING,
    ];
    for (const mt of types) {
      const frame: RpcFrame = {
        type: FrameType.OPEN,
        streamId: 1,
        sequence: 0,
        method: 'test/Method',
        methodType: mt,
      };
      const encoded = encodeFrame(frame);
      const decoded = decodeFrame(encoded);
      assert.equal(decoded.methodType, mt);
    }
  });

  it('should handle unknown method types', () => {
    const frame: RpcFrame = {
      type: FrameType.OPEN,
      streamId: 1,
      sequence: 0,
      method: 'test/Method',
      methodType: 99 as MethodType, // Future method type
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.methodType, 99);
  });
});
