/**
 * Web Demo - Host Page
 *
 * This is the host page that runs the RPC server and creates a sandboxed
 * iframe with the client. Communication happens over a MessagePort channel.
 *
 * Architecture:
 *   Host Page (this file)          Sandboxed Iframe
 *   ┌─────────────────────┐       ┌─────────────────────┐
 *   │ RpcServer            │       │ RpcClient            │
 *   │ HelloServiceImpl     │◄─────►│ HelloServiceClient   │
 *   │ MessagePortTransport │  MP   │ MessagePortTransport │
 *   └─────────────────────┘       └─────────────────────┘
 */

import {
  RpcServer,
  createConsoleLogger,
  MethodType,
  type CallContext,
  type ServiceRegistration,
} from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';

const logger = createConsoleLogger('Host');

// --- Service Implementation ---

async function sayHello(requestBytes: Uint8Array, context: CallContext): Promise<Uint8Array> {
  // Decode request (simple JSON for demo - in production use generated protobuf)
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

async function* watchGreeting(requestBytes: Uint8Array, context: CallContext): AsyncGenerator<Uint8Array> {
  const request = decodeMessage(requestBytes) as { name: string; maxCount?: number; intervalMs?: number };
  logger.info(`WatchGreeting called for "${request.name}"`);

  const maxCount = request.maxCount || 10;
  const interval = request.intervalMs || 1000;
  const greetings = ['Hello', 'Hi', 'Hey', 'Greetings', 'Howdy', 'Salutations', 'Welcome', 'Good day'];

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

    responseSeq++;
    // Echo back with a bot response
    const response = {
      from: 'bot',
      text: `You said: "${msg.text}" - that's interesting!`,
      seq: responseSeq,
      timestamp: Date.now(),
    };
    yield encodeMessage(response);

    // Add a follow-up after a short delay
    await delay(500);
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

// --- Setup ---

function setupBridge(): void {
  logger.info('Setting up RPC bridge...');

  // Create a MessageChannel for communication
  const channel = new MessageChannel();

  // Host side uses port1
  const hostTransport = new MessagePortTransport({
    port: channel.port1,
    logger: createConsoleLogger('Host-Transport'),
  });

  // Create and configure the RPC server
  const server = new RpcServer({
    transport: hostTransport,
    logger: createConsoleLogger('Host-Server'),
    skipHandshake: false,
  });

  // Register the service
  const helloService: ServiceRegistration = {
    name: 'demo.hello.v1.HelloBridgeService',
    methods: {
      SayHello: {
        type: MethodType.UNARY,
        handler: sayHello,
      },
      WatchGreeting: {
        type: MethodType.SERVER_STREAMING,
        handler: watchGreeting as unknown as (req: Uint8Array, ctx: CallContext) => AsyncIterable<Uint8Array>,
      },
      Chat: {
        type: MethodType.BIDI_STREAMING,
        handler: handleChat as unknown as (reqs: AsyncIterable<Uint8Array>, ctx: CallContext) => AsyncIterable<Uint8Array>,
      },
    },
  };
  server.registerService(helloService);

  // Start the server (begins handshake when client connects)
  server.waitReady().then(() => {
    logger.info('Server handshake complete, ready for RPCs');
    updateStatus('Connected');
  }).catch((err) => {
    logger.error('Server handshake failed:', err);
    updateStatus('Error: ' + err);
  });

  // Create the iframe and send it port2
  const iframe = document.getElementById('client-frame') as HTMLIFrameElement;
  iframe.addEventListener('load', () => {
    logger.info('Iframe loaded, transferring MessagePort...');
    // Use location.origin for same-origin iframes. In production, set this
    // to the exact origin of the sandboxed content. NEVER use '*' in production.
    const targetOrigin = location.origin;
    iframe.contentWindow!.postMessage(
      { type: 'rpc-bridge-init', port: true },
      targetOrigin,
      [channel.port2],
    );
  });

  // Set iframe source
  iframe.src = 'iframe.html';
}

function updateStatus(status: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = status;
}

// --- Message encoding helpers (simple JSON-in-protobuf-like wrapper) ---
// In production, use the generated protobuf encode/decode.
// For the demo, we use a simple JSON encoding wrapped in a length prefix.

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

// --- Boot ---

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', setupBridge);
}
