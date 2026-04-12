/**
 * Tests for frame encoding and decoding.
 *
 * Validates:
 * - Round-trip encoding/decoding for all frame types
 * - Field preservation
 * - Forward compatibility (unknown fields are skipped)
 * - Edge cases (empty frames, large payloads)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FrameType,
  encodeFrame,
  decodeFrame,
  createOpenFrame,
  createMessageFrame,
  createHalfCloseFrame,
  createCloseFrame,
  createCancelFrame,
  createErrorFrame,
  type RpcFrame,
} from '@rpc-bridge/core';

describe('Frame Encoding/Decoding', () => {
  it('should round-trip a minimal frame', () => {
    const frame: RpcFrame = {
      type: FrameType.UNSPECIFIED,
      streamId: 0,
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.type, FrameType.UNSPECIFIED);
    assert.equal(decoded.streamId, 0);
  });

  it('should encode and decode OPEN frames', () => {
    const frame = createOpenFrame(1, 'demo.hello.v1.HelloBridgeService/SayHello');
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.OPEN);
    assert.equal(decoded.streamId, 1);
    assert.equal(decoded.method, 'demo.hello.v1.HelloBridgeService/SayHello');
  });

  it('should encode and decode MESSAGE frames with payload', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const frame = createMessageFrame(3, payload);
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.MESSAGE);
    assert.equal(decoded.streamId, 3);
    assert.deepEqual(decoded.payload, payload);
  });

  it('should encode and decode HALF_CLOSE frames', () => {
    const frame = createHalfCloseFrame(5);
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.HALF_CLOSE);
    assert.equal(decoded.streamId, 5);
  });

  it('should encode and decode CLOSE frames', () => {
    const frame = createCloseFrame(7);
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.CLOSE);
    assert.equal(decoded.streamId, 7);
  });

  it('should encode and decode CANCEL frames', () => {
    const frame = createCancelFrame(9);
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.CANCEL);
    assert.equal(decoded.streamId, 9);
  });

  it('should encode and decode ERROR frames', () => {
    const frame = createErrorFrame(11, 13, 'Internal server error');
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, FrameType.ERROR);
    assert.equal(decoded.streamId, 11);
    assert.equal(decoded.errorCode, 13);
    assert.equal(decoded.errorMessage, 'Internal server error');
  });

  it('should handle large stream IDs', () => {
    const frame = createMessageFrame(65535, new Uint8Array([1]));
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.streamId, 65535);
  });

  it('should handle empty payload', () => {
    const frame = createMessageFrame(1, new Uint8Array(0));
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.ok(!decoded.payload || decoded.payload.length === 0);
  });

  it('should handle large payloads', () => {
    const largePayload = new Uint8Array(100000);
    for (let i = 0; i < largePayload.length; i++) {
      largePayload[i] = i % 256;
    }
    const frame = createMessageFrame(1, largePayload);
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    assert.deepEqual(decoded.payload, largePayload);
  });

  it('should skip unknown fields for forward compatibility', () => {
    const frame = createMessageFrame(1, new Uint8Array([1, 2, 3]));
    const encoded = encodeFrame(frame);

    // Append extra field (field 14, varint wire type, value 42)
    const extra = new Uint8Array([
      (14 << 3) | 0,  // tag: field 14, wire type 0 (varint) = 112
      42,
    ]);
    const combined = new Uint8Array(encoded.length + extra.length);
    combined.set(encoded);
    combined.set(extra, encoded.length);

    const decoded = decodeFrame(combined);
    assert.equal(decoded.type, FrameType.MESSAGE);
    assert.equal(decoded.streamId, 1);
    assert.deepEqual(decoded.payload, new Uint8Array([1, 2, 3]));
  });
});

describe('Frame encoding edge cases', () => {
  it('should produce an empty buffer for all-defaults frame', () => {
    const frame: RpcFrame = {
      type: FrameType.UNSPECIFIED,
      streamId: 0,
    };
    const encoded = encodeFrame(frame);
    assert.equal(encoded.length, 0);
  });

  it('should round-trip a fully populated frame', () => {
    const frame: RpcFrame = {
      type: FrameType.ERROR,
      streamId: 999,
      payload: new Uint8Array([1, 2, 3]),
      method: 'pkg.Svc/Method',
      errorCode: 13,
      errorMessage: 'fail',
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);

    assert.equal(decoded.type, frame.type);
    assert.equal(decoded.streamId, frame.streamId);
    assert.deepEqual(decoded.payload, frame.payload);
    assert.equal(decoded.method, frame.method);
    assert.equal(decoded.errorCode, frame.errorCode);
    assert.equal(decoded.errorMessage, frame.errorMessage);
  });
});
