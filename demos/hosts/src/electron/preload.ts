/**
 * Electron Preload - Forwards MessagePort from main process to renderer.
 *
 * The main process sends port2 via ipcRenderer. We forward it to the renderer
 * via window.postMessage with type 'rpc-bridge-init', which is what the
 * product's main.ts already listens for.
 */

import { ipcRenderer } from 'electron';

ipcRenderer.once('rpc-bridge-port', (event) => {
  const [port] = event.ports;
  if (!port) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.postMessage({ type: 'rpc-bridge-init' }, '*', [port]);
    });
  } else {
    window.postMessage({ type: 'rpc-bridge-init' }, '*', [port]);
  }
});

ipcRenderer.send('rpc-bridge-request-port');
