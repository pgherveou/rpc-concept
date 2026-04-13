/**
 * Host Playground - Product Entry Point (web + electron renderer).
 *
 * Receives an RpcClient over a MessagePort transferred by the host,
 * then renders the playground UI.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';
import { renderApp } from './setup-client.js';

export type { ServiceClients } from './setup-client.js';

window.addEventListener('message', (event) => {
  if (event.data?.type !== 'rpc-bridge-init') return;
  const port = event.ports[0];
  if (!port) return;

  const transport = new MessagePortTransport({
    port,
    logger: createConsoleLogger('Product-Transport'),
  });

  const client = new RpcClient({
    transport,
    logger: createConsoleLogger('Product-Client'),
  });

  renderApp(client);
});
