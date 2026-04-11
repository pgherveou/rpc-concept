/**
 * Tests for frame encoding and decoding.
 *
 * Validates:
 * - Round-trip encoding/decoding for all frame types
 * - Field preservation
 * - Forward compatibility (unknown fields are skipped)
 * - Edge cases (empty frames, large payloads, unicode strings)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FrameType,
  encodeFrame,
  decodeFrame,
  createHandshakeFrame,
  createOpenFrame,
  createMessageFrame,
  createHalfCloseFrame,
  createCloseFrame,
  createCancelFrame,
  createErrorFrame,
  createRequestNFrame,
  type RpcFrame,
  MethodType,
} from '@rpc-bridge/core';

describe('Frame Encoding/Decoding', () => {
  it('should round-trip a minimal frame', () => {
    const frame: RpcFrame = {
      type: FrameType.UNSPECIFIED,
      streamId: 0,
      sequence: 0,
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.type, FrameType.UNSPECIFIED);
    assert.equal(decoded.streamId, 0);
    assert.equal(decoded.sequence, 0);
  });

  it('should encode and decode HANDSHAKE frames', () => {
    const frame = createHandshakeFrame(1, ['flow_control', 'deadline', 'cancellation'], 'test-impl/1.0');
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.HANDSHAKE);
    assert.equal(decoded.streamId, 0);
    assert.equal(decoded.protocolVersion, 1);
    assert.deepEqual(decoded.capabilities, ['flow_control', 'deadline', 'cancellation']);
    assert.equal(decoded.implementationId, 'test-impl/1.0');
  });

  it('should encode and decode OPEN frames', () => {
    const frame = createOpenFrame(
      1,
      'demo.hello.v1.HelloBridgeService/SayHello',
      MethodType.UNARY,
      { 'x-request-id': '12345' },
      5000,
    );
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.OPEN);
    assert.equal(decoded.streamId, 1);
    assert.equal(decoded.method, 'demo.hello.v1.HelloBridgeService/SayHello');
    assert.equal(decoded.methodType, MethodType.UNARY);
    assert.equal(decoded.metadata?.['x-request-id'], '12345');
    assert.equal(decoded.deadlineMs, 5000);
  });

  it('should encode and decode MESSAGE frames with payload', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const frame = createMessageFrame(3, 1, payload);
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.MESSAGE);
    assert.equal(decoded.streamId, 3);
    assert.equal(decoded.sequence, 1);
    assert.deepEqual(decoded.payload, payload);
  });

  it('should encode and decode HALF_CLOSE frames', () => {
    const frame = createHalfCloseFrame(5);
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.HALF_CLOSE);
    assert.equal(decoded.streamId, 5);
  });

  it('should encode and decode CLOSE frames with trailers', () => {
    const frame = createCloseFrame(7, { 'grpc-status': '0', 'custom-trailer': 'value' });
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.CLOSE);
    assert.equal(decoded.streamId, 7);
    assert.equal(decoded.trailers?.['grpc-status'], '0');
    assert.equal(decoded.trailers?.['custom-trailer'], 'value');
  });

  it('should encode and decode CANCEL frames', () => {
    const frame = createCancelFrame(9);
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.CANCEL);
    assert.equal(decoded.streamId, 9);
  });

  it('should encode and decode ERROR frames', () => {
    const details = new Uint8Array([42, 43, 44]);
    const frame = createErrorFrame(11, 13, 'Internal server error', details);
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.ERROR);
    assert.equal(decoded.streamId, 11);
    assert.equal(decoded.errorCode, 13);
    assert.equal(decoded.errorMessage, 'Internal server error');
    assert.deepEqual(decoded.errorDetails, details);
  });

  it('should encode and decode REQUEST_N frames', () => {
    const frame = createRequestNFrame(13, 32);
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.REQUEST_N);
    assert.equal(decoded.streamId, 13);
    assert.equal(decoded.requestN, 32);
  });

  it('should handle large stream IDs', () => {
    const frame = createMessageFrame(65535, 1, new Uint8Array([1]));
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.streamId, 65535);
  });

  it('should handle large sequence numbers', () => {
    const frame: RpcFrame = {
      type: FrameType.MESSAGE,
      streamId: 1,
      sequence: 1000000,
      payload: new Uint8Array([1]),
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.sequence, 1000000);
  });

  it('should handle empty payload', () => {
    const frame = createMessageFrame(1, 1, new Uint8Array(0));
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    // Empty payload is omitted (protobuf default)
    assert.ok(!decoded.payload || decoded.payload.length === 0);
  });

  it('should handle unicode strings in metadata', () => {
    const frame = createOpenFrame(1, 'test/Method', MethodType.UNARY, {
      'greeting': 'こんにちは世界',
      'emoji': '🚀🌍',
    });
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.metadata?.['greeting'], 'こんにちは世界');
    assert.equal(decoded.metadata?.['emoji'], '🚀🌍');
  });

  it('should handle extensions map', () => {
    const frame: RpcFrame = {
      type: FrameType.MESSAGE,
      streamId: 1,
      sequence: 1,
      payload: new Uint8Array([1, 2, 3]),
      extensions: new Map([
        ['x-custom-ext', new Uint8Array([10, 20, 30])],
        ['x-another', new Uint8Array([40, 50])],
      ]),
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.ok(decoded.extensions);
    assert.deepEqual(decoded.extensions.get('x-custom-ext'), new Uint8Array([10, 20, 30]));
    assert.deepEqual(decoded.extensions.get('x-another'), new Uint8Array([40, 50]));
  });

  it('should handle large payloads', () => {
    const largePayload = new Uint8Array(100000);
    for (let i = 0; i < largePayload.length; i++) {
      largePayload[i] = i % 256;
    }
    const frame = createMessageFrame(1, 1, largePayload);
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.deepEqual(decoded.payload, largePayload);
  });

  it('should skip unknown fields for forward compatibility', () => {
    // Encode a normal frame
    const frame = createMessageFrame(1, 42, new Uint8Array([1, 2, 3]));
    const encoded = encodeFrame(frame);

    // Append extra fields (simulating a newer protocol version)
    // Field 14 (unused in our frame), varint wire type, value 42
    // tag = (14 << 3) | 0 = 112 (fits in one byte since < 128)
    const extra = new Uint8Array([
      (14 << 3) | 0,  // tag: field 14, wire type 0 (varint) = 112
      42,              // varint: 42
    ]);
    const combined = new Uint8Array(encoded.length + extra.length);
    combined.set(encoded);
    combined.set(extra, encoded.length);

    // Should decode successfully, ignoring the unknown field
    const decoded = decodeFrame(combined);
    assert.equal(decoded.type, FrameType.MESSAGE);
    assert.equal(decoded.streamId, 1);
    assert.equal(decoded.sequence, 42);
    assert.deepEqual(decoded.payload, new Uint8Array([1, 2, 3]));
  });

  it('should handle all frame flags', () => {
    const frame: RpcFrame = {
      type: FrameType.MESSAGE,
      streamId: 1,
      sequence: 1,
      flags: 0x01, // COMPRESSED_PAYLOAD
      payload: new Uint8Array([1]),
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.flags, 0x01);
  });
});

describe('Frame encoding edge cases', () => {
  it('should produce an empty buffer for all-defaults frame', () => {
    const frame: RpcFrame = {
      type: FrameType.UNSPECIFIED,
      streamId: 0,
      sequence: 0,
    };
    const encoded = encodeFrame(frame);
    // All default values are omitted in proto3
    assert.equal(encoded.length, 0);
  });

  it('should round-trip a fully populated frame', () => {
    // Use ERROR type so errorCode is encoded (only ERROR frames encode errorCode)
    const frame: RpcFrame = {
      type: FrameType.ERROR,
      streamId: 999,
      sequence: 42,
      payload: new Uint8Array([1, 2, 3]),
      metadata: { 'key1': 'val1', 'key2': 'val2' },
      flags: 1,
      protocolVersion: 2,
      capabilities: ['cap1', 'cap2'],
      implementationId: 'test/1.0',
      method: 'pkg.Svc/Method',
      deadlineMs: 30000,
      methodType: MethodType.BIDI_STREAMING,
      errorCode: 13,
      errorMessage: 'fail',
      errorDetails: new Uint8Array([7, 8, 9]),
      requestN: 64,
      trailers: { 'trailer-key': 'trailer-val' },
      extensions: new Map([['ext', new Uint8Array([99])]]),
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, frame.type);
    assert.equal(decoded.streamId, frame.streamId);
    assert.equal(decoded.sequence, frame.sequence);
    assert.deepEqual(decoded.payload, frame.payload);
    assert.deepEqual(decoded.metadata, frame.metadata);
    assert.equal(decoded.flags, frame.flags);
    assert.equal(decoded.protocolVersion, frame.protocolVersion);
    assert.deepEqual(decoded.capabilities, frame.capabilities);
    assert.equal(decoded.implementationId, frame.implementationId);
    assert.equal(decoded.method, frame.method);
    assert.equal(decoded.deadlineMs, frame.deadlineMs);
    assert.equal(decoded.methodType, frame.methodType);
    assert.equal(decoded.errorCode, frame.errorCode);
    assert.equal(decoded.errorMessage, frame.errorMessage);
    assert.deepEqual(decoded.errorDetails, frame.errorDetails);
    assert.equal(decoded.requestN, frame.requestN);
    assert.deepEqual(decoded.trailers, frame.trailers);
    assert.deepEqual(decoded.extensions?.get('ext'), new Uint8Array([99]));
  });
});
