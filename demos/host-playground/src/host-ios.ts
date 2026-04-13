/**
 * iOS Host - JS server running inside WKWebView.
 *
 * Uses WKWebViewTransport with a dedicated handler/callback pair
 * (rpcBridgeServer / __rpcServerReceive) so Swift can relay frames
 * between this server transport and the client transport.
 */

import { RpcServer, createConsoleLogger } from '@rpc-bridge/core';
import { WKWebViewTransport } from '@rpc-bridge/transport-ios';
import { registerAllServices } from './setup-server.js';

const logger = createConsoleLogger('iOS-Server');

const transport = new WKWebViewTransport({
  handlerName: 'rpcBridgeServer',
  callbackName: '__rpcServerReceive',
  logger: createConsoleLogger('iOS-Server-Transport'),
});

const server = new RpcServer({ transport, logger });

registerAllServices(server, { json: true });

logger.info('iOS server ready with 11 mock services');
