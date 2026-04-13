/**
 * Electron Host - Main Process
 *
 * Creates a BrowserWindow, establishes a MessagePort channel between
 * main and renderer, and runs the RPC server with all TruAPI mock services.
 */

import { app, BrowserWindow, MessageChannelMain } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RpcServer, createConsoleLogger } from '@rpc-bridge/core';
import { ElectronMainTransport } from '@rpc-bridge/transport-electron';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createConsoleLogger('Main');

function createWindow(): BrowserWindow {
  return new BrowserWindow({
    width: 900,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
}

function setupBridge(win: BrowserWindow): void {
  logger.info('Setting up TruAPI playground bridge...');

  const { port1, port2 } = new MessageChannelMain();

  const transport = new ElectronMainTransport({
    port: port1,
    logger: createConsoleLogger('Main-Transport'),
  });

  const server = new RpcServer({
    transport,
    logger: createConsoleLogger('Main-Server'),
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

  win.webContents.ipc.once('rpc-bridge-request-port', (event) => {
    logger.info('Renderer requested MessagePort, transferring...');
    event.sender.postMessage('rpc-bridge-port', null, [port2]);
  });

  win.on('closed', () => {
    server.close();
    transport.close();
  });

  win.loadFile(path.join(__dirname, 'electron-index.html'));
}

app.whenReady().then(() => {
  const win = createWindow();
  setupBridge(win);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
