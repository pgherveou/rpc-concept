/**
 * Electron Demo - Preload Script
 *
 * Bridges the gap between the main process and the renderer process.
 * Receives a MessagePort from the main process via ipcRenderer and
 * exposes it to the renderer world via contextBridge.
 *
 * Security model:
 * - contextIsolation: true  -- renderer cannot access Node.js APIs
 * - sandbox: true           -- preload runs in a sandboxed environment
 * - The only API exposed is `window.rpcBridge.getPort()`, which returns
 *   the MessagePort once it arrives from the main process.
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Promise that resolves with the MessagePort sent from the main process.
 * The main process creates a MessageChannelMain pair and transfers one
 * port to us via `webContents.postMessage`.
 */
const portPromise = new Promise<MessagePort>((resolve) => {
  ipcRenderer.on('rpc-bridge-port', (event) => {
    // The port is transferred as part of the IPC message
    const [port] = event.ports;
    if (port) {
      resolve(port);
    }
  });

  // Request the port from the main process
  ipcRenderer.send('rpc-bridge-request-port');
});

/**
 * Expose a minimal bridge API to the renderer world.
 *
 * The renderer calls `window.rpcBridge.getPort()` to obtain the
 * MessagePort for RPC communication. This is the only surface area
 * exposed from the privileged preload context.
 */
contextBridge.exposeInMainWorld('rpcBridge', {
  /**
   * Returns a promise that resolves with the MessagePort connected
   * to the main process RPC server.
   */
  getPort: (): Promise<MessagePort> => portPromise,
});
