/**
 * Product App - Single Entry Point
 *
 * Platform-agnostic product. The host injects a ready-to-use RpcClient
 * by calling window.__rpcBridgeBoot(rpcClient).
 * The product has no transport or boot-path knowledge.
 */

import type { RpcClient } from '@rpc-bridge/core';
import { HelloBridgeServiceClient } from '../../proto/generated/client.js';
import { ChatServiceClient } from '../../proto/generated/client.js';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { ClientContext } from './context.js';
import { injectStyles } from './styles.js';

(window as any).__rpcBridgeBoot = (rpcClient: RpcClient, options?: { json?: boolean }) => {
  const clients = {
    hello: new HelloBridgeServiceClient(rpcClient, { json: options?.json }),
    chat: new ChatServiceClient(rpcClient, { json: options?.json }),
  };

  injectStyles();

  const root = createRoot(document.getElementById('app')!);
  root.render(
    createElement(ClientContext.Provider, { value: clients },
      createElement(App)
    )
  );
};
