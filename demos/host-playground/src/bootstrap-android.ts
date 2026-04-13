/**
 * Android Client - JS client running inside WebView.
 *
 * Uses AndroidWebViewTransport with a dedicated interface/callback pair
 * (RpcBridgeClient / __rpcClientReceive). Kotlin relays frames between
 * this client transport and the server transport.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { AndroidWebViewTransport } from '@rpc-bridge/transport-android';
import { renderApp } from './setup-client.js';

const transport = new AndroidWebViewTransport({
  interfaceName: 'RpcBridgeClient',
  callbackName: '__rpcClientReceive',
  logger: createConsoleLogger('Android-Client-Transport'),
});

const rpcClient = new RpcClient({
  transport,
  logger: createConsoleLogger('Android-Client'),
});

renderApp(rpcClient);
