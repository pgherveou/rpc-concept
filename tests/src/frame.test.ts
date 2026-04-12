/**
 * Tests for frame JSON serialization and deserialization.
 *
 * Validates:
 * - Round-trip serialization for all frame types via frameToJSON/frameFromJSON
 * - Field preservation
 * - Forward compatibility (unknown fields are preserved in JSON)
 * - Edge cases (minimal frames, fully populated frames)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FrameType,
  frameToJSON,
  frameFromJSON,
  createOpenFrame,
  createMessageFrame,
  createHalfCloseFrame,
  createCloseFrame,
  createCancelFrame,
  createErrorFrame,
  type RpcFrame,
} from '@rpc-bridge/core';

describe('Frame JSON Serialization', () => {
  it('should round-trip a minimal frame', () => {
    const frame: RpcFrame = {
      type: FrameType.UNSPECIFIED,
      streamId: 0,
    };
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);
    assert.equal(decoded.type, FrameType.UNSPECIFIED);
    assert.equal(decoded.streamId, 0);
  });

  it('should round-trip OPEN frames', () => {
    const frame = createOpenFrame(1, 'demo.hello.v1.HelloBridgeService/SayHello');
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.equal(decoded.type, FrameType.OPEN);
    assert.equal(decoded.streamId, 1);
    assert.equal(decoded.method, 'demo.hello.v1.HelloBridgeService/SayHello');
  });

  it('should round-trip MESSAGE frames with payload', () => {
    const payload = { values: [1, 2, 3, 4, 5], nested: { key: 'value' } };
    const frame = createMessageFrame(3, payload);
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.equal(decoded.type, FrameType.MESSAGE);
    assert.equal(decoded.streamId, 3);
    assert.deepEqual(decoded.payload, payload);
  });

  it('should round-trip HALF_CLOSE frames', () => {
    const frame = createHalfCloseFrame(5);
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.equal(decoded.type, FrameType.HALF_CLOSE);
    assert.equal(decoded.streamId, 5);
  });

  it('should round-trip CLOSE frames', () => {
    const frame = createCloseFrame(7);
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.equal(decoded.type, FrameType.CLOSE);
    assert.equal(decoded.streamId, 7);
  });

  it('should round-trip CANCEL frames', () => {
    const frame = createCancelFrame(9);
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.equal(decoded.type, FrameType.CANCEL);
    assert.equal(decoded.streamId, 9);
  });

  it('should round-trip ERROR frames', () => {
    const frame = createErrorFrame(11, 13, 'Internal server error');
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.equal(decoded.type, FrameType.ERROR);
    assert.equal(decoded.streamId, 11);
    assert.equal(decoded.errorCode, 13);
    assert.equal(decoded.errorMessage, 'Internal server error');
  });

  it('should handle large stream IDs', () => {
    const frame = createMessageFrame(65535, { data: 1 });
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);
    assert.equal(decoded.streamId, 65535);
  });

  it('should handle null payload', () => {
    const frame = createMessageFrame(1, null);
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);
    assert.equal(decoded.payload, null);
  });

  it('should handle string payload', () => {
    const frame = createMessageFrame(1, 'hello world');
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);
    assert.equal(decoded.payload, 'hello world');
  });

  it('should preserve unknown fields in JSON (forward compatibility)', () => {
    const frame = createMessageFrame(1, { msg: 'test' });
    const json = frameToJSON(frame);
    const parsed = JSON.parse(json);

    // Simulate a newer protocol version adding fields
    parsed.newField = 'future';
    parsed.anotherField = 99;

    const decoded = frameFromJSON(JSON.stringify(parsed));
    assert.equal(decoded.type, FrameType.MESSAGE);
    assert.equal(decoded.streamId, 1);
    assert.deepEqual(decoded.payload, { msg: 'test' });
    // Unknown fields naturally preserved
    assert.equal((decoded as unknown as Record<string, unknown>)['newField'], 'future');
    assert.equal((decoded as unknown as Record<string, unknown>)['anotherField'], 99);
  });
});

describe('Frame JSON edge cases', () => {
  it('should produce valid JSON for a minimal frame', () => {
    const frame: RpcFrame = {
      type: FrameType.UNSPECIFIED,
      streamId: 0,
    };
    const json = frameToJSON(frame);
    const parsed = JSON.parse(json);
    assert.equal(parsed.type, 0);
    assert.equal(parsed.streamId, 0);
  });

  it('should round-trip a fully populated frame', () => {
    const frame: RpcFrame = {
      type: FrameType.ERROR,
      streamId: 999,
      payload: { some: 'data' },
      method: 'pkg.Svc/Method',
      errorCode: 13,
      errorMessage: 'fail',
    };
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.equal(decoded.type, frame.type);
    assert.equal(decoded.streamId, frame.streamId);
    assert.deepEqual(decoded.payload, frame.payload);
    assert.equal(decoded.method, frame.method);
    assert.equal(decoded.errorCode, frame.errorCode);
    assert.equal(decoded.errorMessage, frame.errorMessage);
  });
});
