/**
 * Host Playground - Host Page
 *
 * Creates the RPC server with mock service implementations,
 * then transfers a MessagePort to the sandboxed iframe.
 */

import { RpcServer, createConsoleLogger } from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';
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

const logger = createConsoleLogger('Host');

function setupBridge(): void {
  logger.info('Setting up TruAPI playground...');

  const channel = new MessageChannel();

  const hostTransport = new MessagePortTransport({
    port: channel.port1,
    logger: createConsoleLogger('Host-Transport'),
  });

  const server = new RpcServer({
    transport: hostTransport,
    logger: createConsoleLogger('Host-Server'),
  });

  server.registerService(registerGeneralService(generalHandler));
  server.registerService(registerPermissionsService(permissionsHandler));
  server.registerService(registerLocalStorageService(localStorageHandler));
  server.registerService(registerAccountService(accountHandler));
  server.registerService(registerSigningService(signingHandler));
  server.registerService(registerChatService(chatHandler));
  server.registerService(registerStatementStoreService(statementStoreHandler));
  server.registerService(registerPreimageService(preimageHandler));
  server.registerService(registerChainService(chainHandler));
  server.registerService(registerPaymentService(paymentHandler));
  server.registerService(registerEntropyService(entropyHandler));

  logger.info('Server ready with 11 mock services');
  updateStatus('Connected');

  const iframe = document.getElementById('client-frame') as HTMLIFrameElement;
  iframe.addEventListener('load', () => {
    logger.info('Iframe loaded, transferring MessagePort...');
    iframe.contentWindow!.postMessage(
      { type: 'rpc-bridge-init' },
      '*',
      [channel.port2],
    );
  });

  iframe.src = 'iframe.html';
}

function updateStatus(status: string): void {
  const el = document.getElementById('status');
  if (el) {
    el.textContent = `TruAPI Playground - ${status}`;
    el.className = status === 'Connected' ? 'connected' : '';
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', setupBridge);
}
