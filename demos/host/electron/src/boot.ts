/**
 * Electron Boot - Creates RpcClient from MessagePort and injects into product app.
 * The preload transfers the port via window.postMessage (contextBridge cannot
 * transfer MessagePort objects). Loaded after product.js in the renderer.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';

window.addEventListener('message', (event) => {
  if (event.data?.type !== 'rpc-bridge-port') return;

  const port = event.ports[0];
  if (!port) {
    console.error('rpc-bridge-port message received without a port');
    return;
  }

  const transport = new MessagePortTransport({
    port,
    logger: createConsoleLogger('Guest-Transport'),
  });

  const client = new RpcClient({
    transport,
    logger: createConsoleLogger('Guest-Client'),
  });

  const bootFn = (window as any).__rpcBridgeBoot;
  if (typeof bootFn === 'function') {
    bootFn(client);
  } else {
    console.error('__rpcBridgeBoot callback not found. Is product.js loaded?');
  }
}, { once: true });
