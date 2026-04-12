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

import { MessageTransportBase, FrameEncoding, type Logger, type RpcFrame } from '@rpc-bridge/core';

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

/**
 * Electron main process-side transport using structured cloning.
 *
 * Passes RpcFrame objects directly via MessagePortMain postMessage.
 */
export class ElectronMainTransport extends MessageTransportBase {
  private readonly port: ElectronMessagePortMain;

  constructor(options: ElectronMainTransportOptions) {
    super(FrameEncoding.STRUCTURED_CLONE, options.logger);
    this.port = options.port;

    this.port.on('message', (event) => {
      this.handleRawMessage(event.data as RpcFrame);
    });

    this.port.on('close', () => {
      this.close();
    });

    this.port.start();
  }

  protected sendRaw(data: Uint8Array | string | RpcFrame): void {
    this.port.postMessage(data);
  }

  close(): void {
    if (!this.isOpen) return;
    this.port.close();
    super.close();
  }
}
