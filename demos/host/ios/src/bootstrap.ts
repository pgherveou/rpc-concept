/**
 * iOS Boot - Creates RpcClient from WKWebViewTransport and injects into guest app.
 * Loaded after guest.js in the WKWebView.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { WKWebViewTransport } from '@rpc-bridge/transport-ios';

const transport = new WKWebViewTransport({
  logger: createConsoleLogger('iOS-Transport'),
});

const client = new RpcClient({
  transport,
  logger: createConsoleLogger('Guest-Client'),
});

(window as any).__rpcBridgeBoot(client);
