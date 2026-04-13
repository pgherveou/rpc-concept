/**
 * Web Boot - Creates RpcClient from MessagePort and injects into product app.
 * Loaded after product.js in the iframe.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';

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

  (window as any).__rpcBridgeBoot(client);
});
