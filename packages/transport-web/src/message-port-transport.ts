/**
 * MessagePort-based transport.
 *
 * Uses the MessagePort API (part of Channel Messaging) for communication.
 * This is the preferred transport for iframe/worker communication as it
 * provides a dedicated, bidirectional channel with transferable support.
 *
 * MessagePort can transfer ArrayBuffer objects without copying, making
 * this transport very efficient for binary protobuf frames.
 */

import { MessageTransportBase, FrameEncoding, type Logger } from '@rpc-bridge/core';

export interface MessagePortTransportOptions {
  /** The MessagePort to use for communication. */
  port: MessagePort;
  /** Optional logger. */
  logger?: Logger;
}

export class MessagePortTransport extends MessageTransportBase {
  private readonly port: MessagePort;

  constructor(options: MessagePortTransportOptions) {
    super(FrameEncoding.BINARY, options.logger);
    this.port = options.port;

    // Set up message handler
    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data instanceof ArrayBuffer) {
        this.handleRawMessage(new Uint8Array(data));
      } else if (data instanceof Uint8Array) {
        this.handleRawMessage(data);
      } else if (typeof data === 'string') {
        // Fallback: base64-encoded string
        this.handleRawMessage(data);
      } else {
        this.logger.warn('Unexpected message type on MessagePort:', typeof data);
      }
    };

    this.port.onmessageerror = (event: MessageEvent) => {
      this.emitError(new Error(`MessagePort error: ${event}`));
    };

    // Start receiving messages
    this.port.start();
  }

  protected sendRaw(data: Uint8Array | string): void {
    if (data instanceof Uint8Array) {
      // Transfer the underlying ArrayBuffer for zero-copy.
      // Only slice if the Uint8Array is a view into a larger buffer.
      const buffer = (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength)
        ? data.buffer
        : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
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
