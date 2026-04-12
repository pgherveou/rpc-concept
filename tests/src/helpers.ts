/**
 * Shared test helpers to avoid duplication across test files.
 */

import {
  RpcClient,
  RpcServer,
  createLoopbackTransportPair,
  type ServiceRegistration,
} from '@rpc-bridge/core';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encode(obj: unknown): Uint8Array {
  return enc.encode(JSON.stringify(obj));
}

export function decode(bytes: Uint8Array): unknown {
  return JSON.parse(dec.decode(bytes));
}

export function createTestPair(service: ServiceRegistration) {
  const [clientTransport, serverTransport] = createLoopbackTransportPair();

  const server = new RpcServer({ transport: serverTransport });
  server.registerService(service);

  const client = new RpcClient({ transport: clientTransport });

  return { client, server, clientTransport, serverTransport };
}
