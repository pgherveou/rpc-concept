/**
 * Shared test helpers to avoid duplication across test files.
 */

import {
  RpcClient,
  RpcServer,
  createLoopbackTransportPair,
  type ServiceRegistration,
} from '@rpc-bridge/core';

export function createTestPair(service: ServiceRegistration) {
  const [clientTransport, serverTransport] = createLoopbackTransportPair();

  const server = new RpcServer({ transport: serverTransport });
  server.registerService(service);

  const client = new RpcClient({ transport: clientTransport });

  return { client, server, clientTransport, serverTransport };
}
