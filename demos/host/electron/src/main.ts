/**
 * Electron Demo - Main Process
 *
 * Creates a BrowserWindow with a secure renderer, establishes a MessagePort
 * channel between main and renderer, and runs the RPC server that implements
 * the HelloBridgeService.
 *
 * Architecture:
 *   Main Process (this file)            Renderer Process
 *   +--------------------------+       +--------------------------+
 *   | RpcServer                |       | (preload forwards port)  |
 *   | HelloBridgeService impl  |<----->| Guest app (RpcClient)    |
 *   | ElectronMainTransport    |  MP   | MessagePortTransport     |
 *   +--------------------------+       +--------------------------+
 *
 * The preload receives the MessagePort from main and forwards it to the
 * renderer via window.postMessage. The guest app picks it up the same
 * way as in the web iframe demo.
 */

import { app, BrowserWindow, MessageChannelMain } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RpcServer,
  createConsoleLogger,
  type CallContext,
} from '@rpc-bridge/core';
import { ElectronMainTransport } from '@rpc-bridge/transport-electron';
import { registerHelloBridgeService, type IHelloBridgeServiceHandler } from '../../../generated/server.js';
import {
  HelloResponse,
  GreetingEvent,
  ChatMessage,
  CollectNamesResponse,
} from '../../../generated/messages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createConsoleLogger('Main');

// --- Service Implementation ---

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    }, { once: true });
  });
}

function getFollowUp(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('hello') || lower.includes('hi')) return 'Nice to meet you!';
  if (lower.includes('?')) return 'Great question! Let me think about that...';
  if (lower.includes('bye')) return 'Goodbye! Have a great day!';
  return 'Tell me more about that!';
}

const handler: IHelloBridgeServiceHandler = {
  async sayHello(request) {
    logger.info(`SayHello called with name="${request.name}"`);

    const greeting = request.language === 'es' ? `¡Hola, ${request.name}!`
      : request.language === 'fr' ? `Bonjour, ${request.name}!`
      : `Hello, ${request.name}!`;

    return new HelloResponse({
      message: greeting,
      timestamp: BigInt(Date.now()),
      serverVersion: '0.1.0',
    });
  },

  async *watchGreeting(request, context) {
    logger.info(`WatchGreeting called for "${request.name}"`);

    const maxCount = request.maxCount || 10;
    const interval = request.intervalMs || 1000;
    const greetings = [
      'Hello', 'Hi', 'Hey', 'Greetings',
      'Howdy', 'Salutations', 'Welcome', 'Good day',
    ];

    for (let seq = 1; seq <= maxCount; seq++) {
      if (context.signal.aborted) break;

      const greeting = greetings[(seq - 1) % greetings.length];
      yield new GreetingEvent({
        message: `${greeting}, ${request.name}! (update #${seq})`,
        seq: BigInt(seq),
        timestamp: BigInt(Date.now()),
      });

      if (seq < maxCount) {
        await delay(interval, context.signal);
      }
    }
  },

  async *chat(requests, context) {
    logger.info('Chat stream started');
    let responseSeq = 0;

    for await (const msg of requests) {
      if (context.signal.aborted) break;
      logger.info(`Chat message from ${msg.from}: ${msg.text}`);

      responseSeq++;
      yield new ChatMessage({
        from: 'bot',
        text: `You said: "${msg.text}" - that's interesting!`,
        seq: BigInt(responseSeq),
        timestamp: BigInt(Date.now()),
      });

      await delay(500, context.signal);
      responseSeq++;
      yield new ChatMessage({
        from: 'bot',
        text: getFollowUp(msg.text),
        seq: BigInt(responseSeq),
        timestamp: BigInt(Date.now()),
      });
    }

    logger.info('Chat stream ended');
  },

  async collectNames(requests) {
    const names: string[] = [];
    for await (const req of requests) {
      if (req.name) names.push(req.name);
    }
    return new CollectNamesResponse({
      message: `Collected ${names.length} names: ${names.join(', ')}`,
      count: names.length,
    });
  },
};

// --- Window & Bridge Setup ---

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  return win;
}

function setupBridge(win: BrowserWindow): void {
  logger.info('Setting up RPC bridge...');

  const { port1, port2 } = new MessageChannelMain();

  const mainTransport = new ElectronMainTransport({
    port: port1,
    logger: createConsoleLogger('Main-Transport'),
  });

  const server = new RpcServer({
    transport: mainTransport,
    logger: createConsoleLogger('Main-Server'),
  });

  server.registerService(registerHelloBridgeService(handler));

  logger.info('Server ready for RPCs');

  // Send port2 to the renderer/preload when it requests it
  win.webContents.ipc.once('rpc-bridge-request-port', (event) => {
    logger.info('Renderer requested MessagePort, transferring...');
    event.sender.postMessage('rpc-bridge-port', null, [port2]);
  });

  win.on('closed', () => {
    logger.info('Window closed, cleaning up server and transport...');
    server.close();
    mainTransport.close();
  });

  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
}

// --- App Lifecycle ---

app.whenReady().then(() => {
  const win = createWindow();
  setupBridge(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow();
      setupBridge(newWin);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
