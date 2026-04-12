/**
 * Guest App - Single Entry Point
 *
 * Platform-agnostic guest. The host injects a ready-to-use RpcClient
 * by calling window.__rpcBridgeBoot(rpcClient).
 * The guest has no transport or boot-path knowledge.
 */

import type { RpcClient } from '@rpc-bridge/core';
import { HelloBridgeServiceClient } from '../../generated/client.js';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { ClientContext } from './context.js';
import { injectStyles } from './styles.js';

(window as any).__rpcBridgeBoot = (rpcClient: RpcClient) => {
  const client = new HelloBridgeServiceClient(rpcClient);

  injectStyles();

  const root = createRoot(document.getElementById('app')!);
  root.render(
    createElement(ClientContext.Provider, { value: client },
      createElement(App)
    )
  );
};
