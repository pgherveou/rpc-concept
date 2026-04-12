/**
 * Tests for concurrent streams.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RpcClient,
  RpcServer,
  MethodType,
  createLoopbackTransportPair,
  type ServiceRegistration,
} from '@rpc-bridge/core';

describe('Concurrent streams', () => {
  it('should handle concurrent streams independently', async () => {
    const service: ServiceRegistration = {
      name: 'test.Svc',
      methods: {
        Echo: {
          type: MethodType.UNARY,
          handler: async (req: unknown) => {
            const { id } = req as { id: number };
            await new Promise(r => setTimeout(r, 10));
            return { id, reply: `response-${id}` };
          },
        },
      },
    };

    const [ct, st] = createLoopbackTransportPair();
    const server = new RpcServer({ transport: st });
    server.registerService(service);
    const client = new RpcClient({ transport: ct });

    const promises = Array.from({ length: 10 }, (_, i) =>
      client.unary('test.Svc/Echo', { id: i }),
    );

    const results = await Promise.all(promises);

    for (let i = 0; i < 10; i++) {
      const resp = results[i] as { id: number; reply: string };
      assert.equal(resp.id, i);
      assert.equal(resp.reply, `response-${i}`);
    }

    client.close();
    server.close();
  });
});
