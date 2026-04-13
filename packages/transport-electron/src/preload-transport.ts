/**
 * Electron preload/renderer-side transport.
 *
 * Uses Electron's MessagePort API for communication between the renderer
 * process and the main process. MessagePort is the recommended approach
 * for high-performance IPC in Electron.
 *
 * Setup flow:
 * 1. Main process creates a MessageChannelMain pair
 * 2. Main sends one port to the renderer via ipcMain/webContents
 * 3. Renderer receives port in preload script via ipcRenderer
 * 4. Both sides wrap their port in a transport
 *
 * Alternative: Uses contextBridge + ipcRenderer for environments
 * where MessagePort isn't available.
 */

import { MessageTransportBase, FrameEncoding, type Logger, type RpcFrame } from '@rpc-bridge/core';

export interface ElectronPreloadTransportOptions {
  /** MessagePort received from the main process. */
  port: MessagePort;
  /** Optional logger. */
  logger?: Logger;
}

/**
 * Electron preload/renderer-side transport using structured cloning.
 *
 * Passes RpcFrame objects directly via MessagePort postMessage.
 */
export class ElectronPreloadTransport extends MessageTransportBase {
  private readonly port: MessagePort;

  constructor(options: ElectronPreloadTransportOptions) {
    super(FrameEncoding.STRUCTURED_CLONE, options.logger);
    this.port = options.port;

    this.port.onmessage = (event: MessageEvent) => {
      this.handleRawMessage(event.data);
    };

    this.port.onmessageerror = () => {
      this.emitError(new Error('Electron MessagePort error'));
    };

    this.port.start();
  }

  protected sendRaw(data: string | RpcFrame): void {
    this.port.postMessage(data);
  }

  close(): void {
    if (!this.isOpen) return;
    this.port.onmessage = null;
    this.port.onmessageerror = null;
    this.port.close();
    super.close();
  }
}
