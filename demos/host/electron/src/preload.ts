/**
 * Electron Demo - Preload Script
 *
 * Receives a MessagePort from the main process and transfers it to the
 * renderer world via window.postMessage. We defer posting until DOMContentLoaded
 * so boot.js has registered its listener.
 */

import { ipcRenderer } from 'electron';

ipcRenderer.once('rpc-bridge-port', (event) => {
  const [port] = event.ports;
  if (!port) return;

  // Wait for scripts to load before transferring the port
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.postMessage({ type: 'rpc-bridge-port' }, '*', [port]);
    });
  } else {
    window.postMessage({ type: 'rpc-bridge-port' }, '*', [port]);
  }
});
ipcRenderer.send('rpc-bridge-request-port');
