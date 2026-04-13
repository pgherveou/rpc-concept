/**
 * Host Playground - Product Entry Point
 *
 * Receives an RpcClient from the host and renders the playground UI.
 */

import type { RpcClient } from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';
import { RpcClient as RpcClientImpl, createConsoleLogger } from '@rpc-bridge/core';
import {
  GeneralServiceClient,
  PermissionsServiceClient,
  LocalStorageServiceClient,
  AccountServiceClient,
  SigningServiceClient,
  ChatServiceClient,
  StatementStoreServiceClient,
  PreimageServiceClient,
  ChainServiceClient,
  PaymentServiceClient,
  EntropyServiceClient,
} from '../../proto/generated/client.js';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

export interface ServiceClients {
  general: GeneralServiceClient;
  permissions: PermissionsServiceClient;
  localStorage: LocalStorageServiceClient;
  account: AccountServiceClient;
  signing: SigningServiceClient;
  chat: ChatServiceClient;
  statementStore: StatementStoreServiceClient;
  preimage: PreimageServiceClient;
  chain: ChainServiceClient;
  payment: PaymentServiceClient;
  entropy: EntropyServiceClient;
}

function boot(rpcClient: RpcClient): void {
  const clients: ServiceClients = {
    general: new GeneralServiceClient(rpcClient),
    permissions: new PermissionsServiceClient(rpcClient),
    localStorage: new LocalStorageServiceClient(rpcClient),
    account: new AccountServiceClient(rpcClient),
    signing: new SigningServiceClient(rpcClient),
    chat: new ChatServiceClient(rpcClient),
    statementStore: new StatementStoreServiceClient(rpcClient),
    preimage: new PreimageServiceClient(rpcClient),
    chain: new ChainServiceClient(rpcClient),
    payment: new PaymentServiceClient(rpcClient),
    entropy: new EntropyServiceClient(rpcClient),
  };

  const root = createRoot(document.getElementById('app')!);
  root.render(createElement(App, { clients }));
}

// Receive MessagePort from host
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'rpc-bridge-init') return;
  const port = event.ports[0];
  if (!port) return;

  const transport = new MessagePortTransport({
    port,
    logger: createConsoleLogger('Product-Transport'),
  });

  const client = new RpcClientImpl({
    transport,
    logger: createConsoleLogger('Product-Client'),
  });

  boot(client);
});
