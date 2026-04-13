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

import { MessageTransportBase, FrameEncoding, type Logger, type RpcFrame } from '@rpc-bridge/core';

export interface MessagePortTransportOptions {
  /** The MessagePort to use for communication. */
  port: MessagePort;
  /** Optional logger. */
  logger?: Logger;
}

/**
 * MessagePort-based transport using structured cloning.
 *
 * Passes RpcFrame objects directly via postMessage, relying on the browser's
 * structured clone algorithm. This avoids protobuf encode/decode overhead
 * entirely. Uint8Array payloads within frames are cloned automatically.
 */
export class MessagePortTransport extends MessageTransportBase {
  private readonly port: MessagePort;

  constructor(options: MessagePortTransportOptions) {
    super(FrameEncoding.STRUCTURED_CLONE, options.logger);
    this.port = options.port;

    this.port.onmessage = (event: MessageEvent) => {
      this.handleRawMessage(event.data);
    };

    this.port.onmessageerror = (event: MessageEvent) => {
      this.emitError(new Error(`MessagePort error: ${event}`));
    };

    // Start receiving messages
    this.port.start();
  }

  protected sendRaw(data: string | RpcFrame): void {
    this.port.postMessage(data);
  }

  close(): void {
    // Null out handlers before closing so no further events fire
    // after the port is closed and resources are cleaned up.
    this.port.onmessage = null;
    this.port.onmessageerror = null;
    this.port.close();
    super.close();
  }
}
