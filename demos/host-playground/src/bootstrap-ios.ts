/**
 * iOS Client - JS client running inside WKWebView.
 *
 * Uses WKWebViewTransport with a dedicated handler/callback pair
 * (rpcBridgeClient / __rpcClientReceive). Swift relays frames between
 * this client transport and the server transport.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { WKWebViewTransport } from '@rpc-bridge/transport-ios';
import { renderApp } from './setup-client.js';

const transport = new WKWebViewTransport({
  handlerName: 'rpcBridgeClient',
  callbackName: '__rpcClientReceive',
  logger: createConsoleLogger('iOS-Client-Transport'),
});

const rpcClient = new RpcClient({
  transport,
  logger: createConsoleLogger('iOS-Client'),
});

renderApp(rpcClient);
