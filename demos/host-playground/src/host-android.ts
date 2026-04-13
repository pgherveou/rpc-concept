/**
 * Android Host - JS server running inside WebView.
 *
 * Uses AndroidWebViewTransport with a dedicated interface/callback pair
 * (RpcBridgeServer / __rpcServerReceive) so Kotlin can relay frames
 * between this server transport and the client transport.
 */

import { RpcServer, createConsoleLogger } from '@rpc-bridge/core';
import { AndroidWebViewTransport } from '@rpc-bridge/transport-android';
import { registerAllServices } from './setup-server.js';

const logger = createConsoleLogger('Android-Server');

const transport = new AndroidWebViewTransport({
  interfaceName: 'RpcBridgeServer',
  callbackName: '__rpcServerReceive',
  logger: createConsoleLogger('Android-Server-Transport'),
});

const server = new RpcServer({ transport, logger });

registerAllServices(server, { json: true });

logger.info('Android server ready with 11 mock services');
