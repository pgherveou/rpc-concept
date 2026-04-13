/**
 * Android Boot - Creates RpcClient from AndroidWebViewTransport and injects into guest app.
 * Loaded after guest.js in the Android WebView.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { AndroidWebViewTransport } from '@rpc-bridge/transport-android';

const transport = new AndroidWebViewTransport({
  logger: createConsoleLogger('Android-Transport'),
});

const client = new RpcClient({
  transport,
  logger: createConsoleLogger('Guest-Client'),
});

(window as any).__rpcBridgeBoot(client, { json: true });
