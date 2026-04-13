/**
 * Native Client - JS client running inside a native WebView (iOS or Android).
 *
 * Uses NativeWebViewTransport which auto-detects the platform and uses
 * the appropriate bridge API (WKWebView on iOS, WebView on Android).
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { NativeWebViewTransport } from '@rpc-bridge/transport-native';
import { renderApp } from './setup-client.js';

const transport = new NativeWebViewTransport({
  logger: createConsoleLogger('Native-Client-Transport'),
});

const rpcClient = new RpcClient({
  transport,
  logger: createConsoleLogger('Native-Client'),
});

renderApp(rpcClient);
