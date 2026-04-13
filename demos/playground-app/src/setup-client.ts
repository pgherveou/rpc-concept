/**
 * Shared client-side wiring: builds typed clients and renders the React UI.
 * Each platform bootstrap owns its transport and calls `renderApp(rpcClient)`.
 */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { RpcClient } from '@rpc-bridge/core';
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

export function createServiceClients(rpcClient: RpcClient): ServiceClients {
  return {
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
}

export function renderApp(rpcClient: RpcClient): void {
  const clients = createServiceClients(rpcClient);
  const root = createRoot(document.getElementById('app')!);
  root.render(createElement(App, { clients }));
}
