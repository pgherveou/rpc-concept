/**
 * Host Playground - Host Page (web).
 *
 * Creates the RPC server with mock service implementations,
 * then transfers a MessagePort to the sandboxed iframe.
 */

import { RpcServer, createConsoleLogger } from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';
import { registerAllServices } from './setup-server.js';
import { createGeneralHandler } from './mocks/general.js';

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

  const generalHandler = createGeneralHandler({
    onNavigate: (url) => window.open(url, '_blank'),
  });

  registerAllServices(server, { generalHandler });

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
