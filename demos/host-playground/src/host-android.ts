/**
 * Android Host - JS server running inside WebView.
 *
 * Uses AndroidWebViewTransport with a dedicated interface/callback pair
 * (RpcBridgeServer / __rpcServerReceive) so Kotlin can relay frames
 * between this server transport and the client transport.
 */

import { RpcServer, createConsoleLogger } from '@rpc-bridge/core';
import { AndroidWebViewTransport } from '@rpc-bridge/transport-android';
import {
  registerGeneralService,
  registerPermissionsService,
  registerLocalStorageService,
  registerAccountService,
  registerSigningService,
  registerChatService,
  registerStatementStoreService,
  registerPreimageService,
  registerChainService,
  registerPaymentService,
  registerEntropyService,
} from '../../proto/generated/server.js';
import { generalHandler } from './mocks/general.js';
import { permissionsHandler } from './mocks/permissions.js';
import { localStorageHandler } from './mocks/local-storage.js';
import { accountHandler } from './mocks/account.js';
import { signingHandler } from './mocks/signing.js';
import { chatHandler } from './mocks/chat.js';
import { statementStoreHandler } from './mocks/statement-store.js';
import { preimageHandler } from './mocks/preimage.js';
import { chainHandler } from './mocks/chain.js';
import { paymentHandler } from './mocks/payment.js';
import { entropyHandler } from './mocks/entropy.js';

const logger = createConsoleLogger('Android-Server');

const transport = new AndroidWebViewTransport({
  interfaceName: 'RpcBridgeServer',
  callbackName: '__rpcServerReceive',
  logger: createConsoleLogger('Android-Server-Transport'),
});

const server = new RpcServer({
  transport,
  logger,
});

const jsonOpts = { json: true };
server.registerService(registerGeneralService(generalHandler, jsonOpts));
server.registerService(registerPermissionsService(permissionsHandler, jsonOpts));
server.registerService(registerLocalStorageService(localStorageHandler, jsonOpts));
server.registerService(registerAccountService(accountHandler, jsonOpts));
server.registerService(registerSigningService(signingHandler, jsonOpts));
server.registerService(registerChatService(chatHandler, jsonOpts));
server.registerService(registerStatementStoreService(statementStoreHandler, jsonOpts));
server.registerService(registerPreimageService(preimageHandler, jsonOpts));
server.registerService(registerChainService(chainHandler, jsonOpts));
server.registerService(registerPaymentService(paymentHandler, jsonOpts));
server.registerService(registerEntropyService(entropyHandler, jsonOpts));

logger.info('Android server ready with 11 mock services');
