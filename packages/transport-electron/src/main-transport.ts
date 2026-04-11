/**
 * Electron main process-side transport.
 *
 * Wraps an Electron MessagePortMain for use in the main process.
 * The main process creates a MessageChannelMain, sends one port
 * to the renderer, and keeps the other for itself.
 *
 * This module uses a duck-typed interface for Electron's MessagePortMain
 * so it doesn't require importing Electron directly (which would fail
 * in non-Electron environments during type-checking).
 */

import { MessageTransportBase, FrameEncoding, type Logger } from '@rpc-bridge/core';

/**
 * Duck-typed interface for Electron's MessagePortMain.
 * Avoids a hard dependency on the electron package.
 */
export interface ElectronMessagePortMain {
  postMessage(message: unknown, transfer?: unknown[]): void;
  on(event: 'message', handler: (event: { data: unknown }) => void): this;
  on(event: 'close', handler: () => void): this;
  off(event: 'message', handler: (event: { data: unknown }) => void): this;
  off(event: 'close', handler: () => void): this;
  start(): void;
  close(): void;
}

export interface ElectronMainTransportOptions {
  /** MessagePortMain from MessageChannelMain. */
  port: ElectronMessagePortMain;
  /** Optional logger. */
  logger?: Logger;
}

export class ElectronMainTransport extends MessageTransportBase {
  private readonly port: ElectronMessagePortMain;

  constructor(options: ElectronMainTransportOptions) {
    super(FrameEncoding.BINARY, options.logger);
    this.port = options.port;

    this.port.on('message', (event) => {
      const data = event.data;
      if (data instanceof ArrayBuffer) {
        this.handleRawMessage(new Uint8Array(data));
      } else if (data instanceof Uint8Array) {
        this.handleRawMessage(data);
      } else if (typeof data === 'string') {
        this.handleRawMessage(data);
      } else if (Buffer.isBuffer(data)) {
        this.handleRawMessage(new Uint8Array(data));
      }
    });

    this.port.on('close', () => {
      this.close();
    });

    this.port.start();
  }

  protected sendRaw(data: Uint8Array | string): void {
    if (data instanceof Uint8Array) {
      // Copy into a standalone ArrayBuffer and transfer it for zero-copy send
      const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      this.port.postMessage(copy, [copy]);
    } else {
      this.port.postMessage(data);
    }
  }

  close(): void {
    if (!this.isOpen) return;
    this.port.close();
    super.close();
  }
}
