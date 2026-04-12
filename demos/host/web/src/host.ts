/**
 * Web Demo - Host Page
 *
 * Runs the RPC server and creates a sandboxed iframe with the client.
 * Communication happens over a MessagePort channel.
 *
 * Architecture:
 *   Host Page (this file)          Sandboxed Iframe
 *   +---------------------+       +---------------------+
 *   | RpcServer            |       | RpcClient            |
 *   | HelloServiceImpl     |<----->| HelloServiceClient   |
 *   | MessagePortTransport |  MP   | MessagePortTransport |
 *   +---------------------+       +---------------------+
 */

import {
  RpcServer,
  createConsoleLogger,
} from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';
import { registerHelloBridgeService, type IHelloBridgeServiceHandler } from '../../../generated/server.js';
import {
  HelloResponse,
  GreetingEvent,
  ChatMessage,
  CollectNamesResponse,
} from '../../../generated/messages.js';

const logger = createConsoleLogger('Host');

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
    const greetings = ['Hello', 'Hi', 'Hey', 'Greetings', 'Howdy', 'Salutations', 'Welcome', 'Good day'];

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

      await delay(500);
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

// --- Setup ---

function setupBridge(): void {
  logger.info('Setting up RPC bridge...');

  const channel = new MessageChannel();

  const hostTransport = new MessagePortTransport({
    port: channel.port1,
    logger: createConsoleLogger('Host-Transport'),
  });

  const server = new RpcServer({
    transport: hostTransport,
    logger: createConsoleLogger('Host-Server'),
  });

  server.registerService(registerHelloBridgeService(handler));

  logger.info('Server ready for RPCs');
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
  if (el) el.textContent = status;
}

// --- Boot ---

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', setupBridge);
}
