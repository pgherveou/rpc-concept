/**
 * Android Client - JS client running inside WebView.
 *
 * Uses AndroidWebViewTransport with default interface/callback names
 * (RpcBridge / __rpcBridgeReceive) to talk directly to the native
 * Kotlin RpcBridgeServer.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { AndroidWebViewTransport } from '@rpc-bridge/transport-android';
import { renderApp } from './setup-client.js';

const transport = new AndroidWebViewTransport({
  logger: createConsoleLogger('Android-Client-Transport'),
});

const rpcClient = new RpcClient({
  transport,
  logger: createConsoleLogger('Android-Client'),
});

renderApp(rpcClient);
