/**
 * Tests for forward and backward compatibility with the oneof-based frame format.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  frameToJSON,
  frameFromJSON,
  createMessageFrame,
  createOpenFrame,
  isOpenFrame,
  isMessageFrame,
  isErrorFrame,
  type RpcFrame,
  createLoopbackTransportPair,
  RpcClient,
  RpcServer,
  MethodType,
  type ServiceRegistration,
} from '@rpc-bridge/core';

describe('Forward Compatibility', () => {
  it('should tolerate unknown body types in JSON', () => {
    // Simulate a frame with a body type not yet known to this version
    const json = JSON.stringify({ streamId: 1, futureBody: { data: 42 } });
    const decoded = frameFromJSON(json);
    // None of the known type guards match
    assert.equal(isOpenFrame(decoded), false);
    assert.equal(isMessageFrame(decoded), false);
    assert.equal(isErrorFrame(decoded), false);
    // streamId is still accessible
    assert.equal(decoded.streamId, 1);
  });

  it('should preserve unknown fields alongside known body in JSON round-trip', () => {
    const base = createMessageFrame(1, { data: 'test' });
    const json = frameToJSON(base);
    const parsed = JSON.parse(json);

    // Add unknown fields (simulating a newer protocol version)
    parsed.futureField = 'hello';
    parsed.anotherNewField = 42;

    const decoded = frameFromJSON(JSON.stringify(parsed));
    assert.ok(isMessageFrame(decoded));
    assert.equal(decoded.streamId, 1);
    assert.deepEqual(decoded.message.payload, { data: 'test' });
    // Unknown fields are naturally preserved in JSON
    assert.equal((decoded as unknown as Record<string, unknown>)['futureField'], 'hello');
    assert.equal((decoded as unknown as Record<string, unknown>)['anotherNewField'], 42);
  });

  it('should handle extra nested objects in JSON', () => {
    const base = createMessageFrame(1, { value: 1 });
    const json = frameToJSON(base);
    const parsed = JSON.parse(json);

    // Add an unknown nested field
    parsed.metadata = { version: 2, flags: [1, 2, 3] };

    const decoded = frameFromJSON(JSON.stringify(parsed));
    assert.ok(isMessageFrame(decoded));
    assert.deepEqual(decoded.message.payload, { value: 1 });
  });
});

describe('Backward Compatibility', () => {
  it('should decode frames with only the body key present', () => {
    const frame = createOpenFrame(1, 'test.Svc/Method');
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

    assert.ok(isOpenFrame(decoded));
    assert.equal(decoded.open.method, 'test.Svc/Method');
  });

  it('should work with basic unary RPC', async () => {
    const service: ServiceRegistration = {
      name: 'test.Svc',
      methods: {
        Ping: {
          type: MethodType.UNARY,
          handler: async () => ({ pong: true }),
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st });
    server.registerService(service);
    const client = new RpcClient({ transport: ct });

    const result = await client.unary('test.Svc/Ping', {});
    const resp = result as { pong: boolean };
    assert.equal(resp.pong, true);

    client.close();
    server.close();
  });
});

describe('Error code compatibility', () => {
  it('should handle standard error codes through JSON', () => {
    const codes = [1, 3, 4, 12, 13];
    for (const code of codes) {
      const frame: RpcFrame = {
        streamId: 1,
        error: { errorCode: code, errorMessage: `Error with code ${code}` },
      };
      const json = frameToJSON(frame);
      const decoded = frameFromJSON(json);
      assert.ok(isErrorFrame(decoded));
      assert.equal(decoded.error.errorCode, code);
      assert.equal(decoded.error.errorMessage, `Error with code ${code}`);
    }
  });

  it('should handle unknown error codes gracefully', () => {
    const frame: RpcFrame = {
      streamId: 1,
      error: { errorCode: 999, errorMessage: 'Future error type' },
    };
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);
    assert.ok(isErrorFrame(decoded));
    assert.equal(decoded.error.errorCode, 999);
    assert.equal(decoded.error.errorMessage, 'Future error type');
  });
});
