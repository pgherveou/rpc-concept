/**
 * Shared server-side wiring: registers the 11 mock services on an RpcServer.
 * Each platform host owns its transport and calls into here.
 */

import type { RpcServer } from '@rpc-bridge/core';
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

export function registerAllServices(
  server: RpcServer,
  opts?: { json?: boolean },
): void {
  server.registerService(registerGeneralService(generalHandler, opts));
  server.registerService(registerPermissionsService(permissionsHandler, opts));
  server.registerService(registerLocalStorageService(localStorageHandler, opts));
  server.registerService(registerAccountService(accountHandler, opts));
  server.registerService(registerSigningService(signingHandler, opts));
  server.registerService(registerChatService(chatHandler, opts));
  server.registerService(registerStatementStoreService(statementStoreHandler, opts));
  server.registerService(registerPreimageService(preimageHandler, opts));
  server.registerService(registerChainService(chainHandler, opts));
  server.registerService(registerPaymentService(paymentHandler, opts));
  server.registerService(registerEntropyService(entropyHandler, opts));
}
