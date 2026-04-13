/**
 * Tests for frame JSON serialization and deserialization.
 *
 * Validates:
 * - Round-trip serialization for all frame types via frameToJSON/frameFromJSON
 * - Field preservation
 * - Forward compatibility (unknown body types are silently ignored)
 * - Edge cases (minimal frames, fully populated frames)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  frameToJSON,
  frameFromJSON,
  createOpenFrame,
  createMessageFrame,
  createHalfCloseFrame,
  createCloseFrame,
  createCancelFrame,
  createErrorFrame,
  isOpenFrame,
  isMessageFrame,
  isHalfCloseFrame,
  isCloseFrame,
  isCancelFrame,
  isErrorFrame,
  type RpcFrame,
} from '@rpc-bridge/core';

describe('Frame JSON Serialization', () => {
  it('should round-trip OPEN frames', () => {
    const frame = createOpenFrame(1, 'demo.hello.v1.HelloService/SayHello');
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.ok(isOpenFrame(decoded));
    assert.equal(decoded.streamId, 1);
    assert.equal(decoded.open.method, 'demo.hello.v1.HelloService/SayHello');
  });

  it('should round-trip MESSAGE frames with payload', () => {
    const payload = { values: [1, 2, 3, 4, 5], nested: { key: 'value' } };
    const frame = createMessageFrame(3, payload);
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.ok(isMessageFrame(decoded));
    assert.equal(decoded.streamId, 3);
    assert.deepEqual(decoded.message.payload, payload);
  });

  it('should round-trip HALF_CLOSE frames', () => {
    const frame = createHalfCloseFrame(5);
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.ok(isHalfCloseFrame(decoded));
    assert.equal(decoded.streamId, 5);
  });

  it('should round-trip CLOSE frames', () => {
    const frame = createCloseFrame(7);
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.ok(isCloseFrame(decoded));
    assert.equal(decoded.streamId, 7);
  });

  it('should round-trip CANCEL frames', () => {
    const frame = createCancelFrame(9);
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.ok(isCancelFrame(decoded));
    assert.equal(decoded.streamId, 9);
  });

  it('should round-trip ERROR frames', () => {
    const frame = createErrorFrame(11, 13, 'Internal server error');
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.ok(isErrorFrame(decoded));
    assert.equal(decoded.streamId, 11);
    assert.equal(decoded.error.errorCode, 13);
    assert.equal(decoded.error.errorMessage, 'Internal server error');
  });

  it('should round-trip ERROR frames with details', () => {
    const details = { reason: 'expired', paymentId: 'pay-123' };
    const frame = createErrorFrame(13, 3, 'Startup error', details);
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.ok(isErrorFrame(decoded));
    assert.equal(decoded.streamId, 13);
    assert.equal(decoded.error.errorCode, 3);
    assert.equal(decoded.error.errorMessage, 'Startup error');
    assert.deepStrictEqual(decoded.error.details, details);
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
    assert.ok(isMessageFrame(decoded));
    assert.equal(decoded.message.payload, null);
  });

  it('should handle string payload', () => {
    const frame = createMessageFrame(1, 'hello world');
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);
    assert.ok(isMessageFrame(decoded));
    assert.equal(decoded.message.payload, 'hello world');
  });

  it('should preserve unknown fields in JSON (forward compatibility)', () => {
    const frame = createMessageFrame(1, { msg: 'test' });
    const json = frameToJSON(frame);
    const parsed = JSON.parse(json);

    // Simulate a newer protocol version adding a new body type
    parsed.newBodyType = { data: 'future' };

    const decoded = frameFromJSON(JSON.stringify(parsed));
    // The existing body is still recognized
    assert.ok(isMessageFrame(decoded));
    assert.equal(decoded.streamId, 1);
    assert.deepEqual(decoded.message.payload, { msg: 'test' });
  });
});

describe('Frame JSON edge cases', () => {
  it('should produce correct JSON shape for an open frame', () => {
    const frame = createOpenFrame(1, 'pkg.Svc/Method');
    const json = frameToJSON(frame);
    const parsed = JSON.parse(json);
    assert.equal(parsed.streamId, 1);
    assert.deepEqual(parsed.open, { method: 'pkg.Svc/Method' });
    assert.equal(parsed.type, undefined);
  });

  it('should produce correct JSON shape for an error frame', () => {
    const frame = createErrorFrame(999, 13, 'fail');
    const json = frameToJSON(frame);
    const parsed = JSON.parse(json);
    assert.equal(parsed.streamId, 999);
    assert.deepEqual(parsed.error, { errorCode: 13, errorMessage: 'fail' });
  });
});
