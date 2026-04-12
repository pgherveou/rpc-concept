/**
 * Electron Demo - Preload Script
 *
 * Receives a MessagePort from the main process and forwards it to the
 * renderer world via window.postMessage. The guest app picks it up
 * the same way as in the web iframe demo.
 */

import { ipcRenderer } from 'electron';

ipcRenderer.once('rpc-bridge-port', (event) => {
  const [port] = event.ports;
  if (!port) return;
  window.postMessage({ type: 'rpc-bridge-init' }, '*', [port]);
});

ipcRenderer.send('rpc-bridge-request-port');
