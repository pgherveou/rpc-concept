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

import { MessageTransportBase, FrameEncoding, type Logger } from '@rpc-bridge/core';

export interface ElectronPreloadTransportOptions {
  /** MessagePort received from the main process. */
  port: MessagePort;
  /** Optional logger. */
  logger?: Logger;
}

export class ElectronPreloadTransport extends MessageTransportBase {
  private readonly port: MessagePort;

  constructor(options: ElectronPreloadTransportOptions) {
    super(FrameEncoding.BINARY, options.logger);
    this.port = options.port;

    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data instanceof ArrayBuffer) {
        this.handleRawMessage(new Uint8Array(data));
      } else if (data instanceof Uint8Array) {
        this.handleRawMessage(data);
      } else if (typeof data === 'string') {
        this.handleRawMessage(data);
      }
    };

    this.port.onmessageerror = () => {
      this.emitError(new Error('Electron MessagePort error'));
    };

    this.port.start();
  }

  protected sendRaw(data: Uint8Array | string): void {
    if (data instanceof Uint8Array) {
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      this.port.postMessage(buffer, [buffer]);
    } else {
      this.port.postMessage(data);
    }
  }

  close(): void {
    this.port.close();
    super.close();
  }
}
