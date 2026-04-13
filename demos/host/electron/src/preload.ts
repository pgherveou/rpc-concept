/**
 * Electron Demo - Preload Script
 *
 * Receives a MessagePort from the main process and forwards it to the
 * renderer world via contextBridge. The guest app picks it up via
 * window.rpcBridge.getPort().
 */

import { contextBridge, ipcRenderer } from 'electron';

const portPromise = new Promise<MessagePort>((resolve) => {
  ipcRenderer.once('rpc-bridge-port', (event) => {
    const [port] = event.ports;
    if (port) resolve(port);
  });
  ipcRenderer.send('rpc-bridge-request-port');
});

contextBridge.exposeInMainWorld('rpcBridge', {
  getPort: () => portPromise,
});
