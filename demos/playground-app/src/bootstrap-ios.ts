/**
 * iOS Client - JS client running inside WKWebView.
 *
 * Uses WKWebViewTransport with default handler/callback names
 * (rpcBridge / __rpcBridgeReceive) to talk directly to the native
 * Swift RpcBridgeServer.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { WKWebViewTransport } from '@rpc-bridge/transport-ios';
import { renderApp } from './setup-client.js';

const transport = new WKWebViewTransport({
  logger: createConsoleLogger('iOS-Client-Transport'),
});

const rpcClient = new RpcClient({
  transport,
  logger: createConsoleLogger('iOS-Client'),
});

renderApp(rpcClient);
