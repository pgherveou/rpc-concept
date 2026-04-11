/**
 * Electron Demo - Main Process
 *
 * Creates a BrowserWindow with a secure renderer, establishes a MessagePort
 * channel between main and renderer, and runs the RPC server that implements
 * the HelloBridgeService.
 *
 * Architecture:
 *   Main Process (this file)            Renderer Process
 *   ┌──────────────────────────┐       ┌──────────────────────────┐
 *   │ RpcServer                │       │ (preload) RpcClient      │
 *   │ HelloBridgeService impl  │◄─────►│ contextBridge proxies    │
 *   │ ElectronMainTransport    │  MP   │ ElectronPreloadTransport │
 *   └──────────────────────────┘       └──────────────────────────┘
 *
 * The main process creates a MessageChannelMain pair, keeps one port for itself
 * (wrapped in ElectronMainTransport), and sends the other to the preload script.
 * The preload creates the RPC client internally and exposes only serializable
 * method proxies to the renderer via contextBridge.
 */

import { app, BrowserWindow, MessageChannelMain } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RpcServer,
  createConsoleLogger,
  MethodType,
  type CallContext,
  type ServiceRegistration,
} from '@rpc-bridge/core';
import { ElectronMainTransport } from '@rpc-bridge/transport-electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createConsoleLogger('Main');

// ---------------------------------------------------------------------------
// Message encoding helpers (simple JSON as Uint8Array for the demo)
// In production, use the generated protobuf encode/decode functions.
// ---------------------------------------------------------------------------

function encodeMessage(obj: Record<string, unknown>): Uint8Array {
  const json = JSON.stringify(obj);
  return new TextEncoder().encode(json);
}

function decodeMessage(bytes: Uint8Array): Record<string, unknown> {
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    }, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/** Unary RPC: returns a greeting string. */
async function sayHello(requestBytes: Uint8Array, _context: CallContext): Promise<Uint8Array> {
  const request = decodeMessage(requestBytes) as { name: string; language?: string };
  logger.info(`SayHello called with name="${request.name}"`);

  const greeting = request.language === 'es' ? `¡Hola, ${request.name}!`
    : request.language === 'fr' ? `Bonjour, ${request.name}!`
    : `Hello, ${request.name}!`;

  const response = {
    message: greeting,
    timestamp: Date.now(),
    serverVersion: '0.1.0',
  };

  return encodeMessage(response);
}

/** Server-streaming RPC: yields periodic greeting events. */
async function* watchGreeting(
  requestBytes: Uint8Array,
  context: CallContext,
): AsyncGenerator<Uint8Array> {
  const request = decodeMessage(requestBytes) as {
    name: string;
    maxCount?: number;
    intervalMs?: number;
  };
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
    const event = {
      message: `${greeting}, ${request.name}! (update #${seq})`,
      seq,
      timestamp: Date.now(),
    };

    yield encodeMessage(event);

    if (seq < maxCount) {
      await delay(interval, context.signal);
    }
  }
}

/** Bidi-streaming RPC: echoes messages back with bot responses. */
async function* handleChat(
  requests: AsyncIterable<Uint8Array>,
  context: CallContext,
): AsyncGenerator<Uint8Array> {
  logger.info('Chat stream started');
  let responseSeq = 0;

  for await (const reqBytes of requests) {
    if (context.signal.aborted) break;

    const msg = decodeMessage(reqBytes) as { from: string; text: string; seq?: number };
    logger.info(`Chat message from ${msg.from}: ${msg.text}`);

    // Echo back with a bot response
    responseSeq++;
    const response = {
      from: 'bot',
      text: `You said: "${msg.text}" - that's interesting!`,
      seq: responseSeq,
      timestamp: Date.now(),
    };
    yield encodeMessage(response);

    // Add a follow-up after a short delay (pass signal for cleanup)
    await delay(500, context.signal);
    responseSeq++;
    const followUp = {
      from: 'bot',
      text: getFollowUp(msg.text),
      seq: responseSeq,
      timestamp: Date.now(),
    };
    yield encodeMessage(followUp);
  }

  logger.info('Chat stream ended');
}

function getFollowUp(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('hello') || lower.includes('hi')) return 'Nice to meet you!';
  if (lower.includes('?')) return 'Great question! Let me think about that...';
  if (lower.includes('bye')) return 'Goodbye! Have a great day!';
  return 'Tell me more about that!';
}

// ---------------------------------------------------------------------------
// Window & Bridge Setup
// ---------------------------------------------------------------------------

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

  // Create a MessageChannelMain pair for communication
  const { port1, port2 } = new MessageChannelMain();

  // Main process keeps port1, wrapped in ElectronMainTransport
  const mainTransport = new ElectronMainTransport({
    port: port1,
    logger: createConsoleLogger('Main-Transport'),
  });

  // Create and configure the RPC server
  const server = new RpcServer({
    transport: mainTransport,
    logger: createConsoleLogger('Main-Server'),
    skipHandshake: false,
  });

  // Register the HelloBridgeService
  const helloService: ServiceRegistration = {
    name: 'demo.hello.v1.HelloBridgeService',
    methods: {
      SayHello: {
        type: MethodType.UNARY,
        handler: sayHello,
      },
      WatchGreeting: {
        type: MethodType.SERVER_STREAMING,
        handler: watchGreeting as unknown as (
          req: Uint8Array, ctx: CallContext,
        ) => AsyncIterable<Uint8Array>,
      },
      Chat: {
        type: MethodType.BIDI_STREAMING,
        handler: handleChat as unknown as (
          reqs: AsyncIterable<Uint8Array>, ctx: CallContext,
        ) => AsyncIterable<Uint8Array>,
      },
    },
  };
  server.registerService(helloService);

  // Wait for the handshake to complete
  server.waitReady().then(() => {
    logger.info('Server handshake complete, ready for RPCs');
  }).catch((err) => {
    logger.error('Server handshake failed:', err);
  });

  // Send port2 to the renderer/preload when it requests it (scoped to this window)
  win.webContents.ipc.once('rpc-bridge-request-port', (event) => {
    logger.info('Renderer requested MessagePort, transferring...');
    event.sender.postMessage('rpc-bridge-port', null, [port2]);
  });

  // Clean up server and transport when the window is closed
  win.on('closed', () => {
    logger.info('Window closed, cleaning up server and transport...');
    server.close();
    mainTransport.close();
  });

  // Navigation guards: prevent navigating away from the app
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  const win = createWindow();
  setupBridge(win);

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked and no windows exist
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow();
      setupBridge(newWin);
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep the app running until the user explicitly quits
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
