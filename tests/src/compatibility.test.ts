/**
 * Tests for forward compatibility (unknown fields/frame types).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FrameType,
  frameToJSON,
  frameFromJSON,
  createMessageFrame,
  type RpcFrame,
  createLoopbackTransportPair,
  RpcClient,
  RpcServer,
  MethodType,
  type ServiceRegistration,
} from '@rpc-bridge/core';

describe('Forward Compatibility', () => {
  it('should round-trip unknown frame types through JSON', () => {
    const frame: RpcFrame = {
      type: 99 as FrameType,
      streamId: 1,
    };
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);
    assert.equal(decoded.type, 99);
    assert.equal(decoded.streamId, 1);
  });

  it('should preserve unknown fields in JSON round-trip', () => {
    const base = createMessageFrame(1, { data: 'test' });
    const json = frameToJSON(base);
    const parsed = JSON.parse(json);

    // Add unknown fields (simulating a newer protocol version)
    parsed.futureField = 'hello';
    parsed.anotherNewField = 42;

    const decoded = frameFromJSON(JSON.stringify(parsed));
    assert.equal(decoded.type, FrameType.MESSAGE);
    assert.equal(decoded.streamId, 1);
    assert.deepEqual(decoded.payload, { data: 'test' });
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
    assert.equal(decoded.type, FrameType.MESSAGE);
    assert.deepEqual(decoded.payload, { value: 1 });
  });
});

describe('Backward Compatibility', () => {
  it('should decode frames missing optional fields', () => {
    const frame: RpcFrame = {
      type: FrameType.OPEN,
      streamId: 1,
      method: 'test.Svc/Method',
    };
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);

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
        type: FrameType.ERROR,
        streamId: 1,
        errorCode: code,
        errorMessage: `Error with code ${code}`,
      };
      const json = frameToJSON(frame);
      const decoded = frameFromJSON(json);
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
    const json = frameToJSON(frame);
    const decoded = frameFromJSON(json);
    assert.equal(decoded.errorCode, 999);
    assert.equal(decoded.errorMessage, 'Future error type');
  });
});
