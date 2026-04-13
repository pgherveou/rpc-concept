/**
 * Electron Boot - Creates RpcClient from MessagePort and injects into guest app.
 * The preload exposes the port via contextBridge as window.rpcBridge.getPort().
 * Loaded after guest.js in the renderer.
 */

import { RpcClient, createConsoleLogger } from '@rpc-bridge/core';
import { MessagePortTransport } from '@rpc-bridge/transport-web';

declare global {
  interface Window {
    rpcBridge?: { getPort: () => Promise<MessagePort> };
  }
}

async function boot() {
  const bridge = window.rpcBridge;
  if (!bridge) {
    console.error('rpcBridge not exposed by preload script');
    return;
  }

  const port = await bridge.getPort();

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
    console.error('__rpcBridgeBoot callback not found. Is guest.js loaded?');
  }
}

boot();
