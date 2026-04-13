/**
 * Android Client - JS client running inside WebView.
 *
 * Uses AndroidWebViewTransport with a dedicated interface/callback pair
 * (RpcBridgeClient / __rpcClientReceive). Kotlin relays frames between
 * this client transport and the server transport.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { AndroidWebViewTransport } from '@rpc-bridge/transport-android';
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
import type { ServiceClients } from './main.js';

const transport = new AndroidWebViewTransport({
  interfaceName: 'RpcBridgeClient',
  callbackName: '__rpcClientReceive',
  logger: createConsoleLogger('Android-Client-Transport'),
});

const rpcClient = new RpcClient({
  transport,
  logger: createConsoleLogger('Android-Client'),
});

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
