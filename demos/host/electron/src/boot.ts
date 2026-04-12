/**
 * Electron Boot - Creates RpcClient from MessagePort and injects into guest app.
 * The preload forwards a MessagePort from main process via window.postMessage.
 * Loaded after guest.js in the renderer.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';

window.addEventListener('message', (event) => {
  if (event.data?.type !== 'rpc-bridge-init') return;

  const port = event.ports[0];
  if (!port) return;

  const transport = new MessagePortTransport({
    port,
    logger: createConsoleLogger('Guest-Transport'),
  });

  const client = new RpcClient({
    transport,
    logger: createConsoleLogger('Guest-Client'),
  });

  (window as any).__rpcBridgeBoot(client);
});
