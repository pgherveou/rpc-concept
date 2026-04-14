/**
 * Host Playground - Host Page (web).
 *
 * Creates the RPC server with mock service implementations,
 * then transfers a MessagePort to the sandboxed iframe.
 */

import { RpcServer, createConsoleLogger } from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';
import { registerAllServices } from '../shared/setup-server.js';
<<<<<<<< HEAD:demos/hosts/src/web/host.ts
========
import { createGeneralHandler } from '../shared/general.js';
>>>>>>>> origin/pg/impl-general-service:demos/hosts/js/web/host.ts

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
    onNotification: (text, deeplink) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification('TruAPI Playground', { body: text });
        if (deeplink) {
          n.onclick = () => window.open(deeplink, '_blank');
        }
      } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            const n = new Notification('TruAPI Playground', { body: text });
            if (deeplink) {
              n.onclick = () => window.open(deeplink, '_blank');
            }
          }
        });
      } else {
        console.log('[host] Notification:', text, deeplink ?? '');
      }
    },
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
