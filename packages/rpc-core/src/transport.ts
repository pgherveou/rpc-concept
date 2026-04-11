/**
 * Transport abstraction layer.
 *
 * A Transport is the lowest-level interface for sending and receiving
 * RpcFrame messages. It is independent of any specific platform messaging
 * primitive (postMessage, WKWebView bridge, Android WebView, Electron IPC).
 *
 * Platform-specific adapters implement this interface.
 */

import { type RpcFrame, encodeFrame, decodeFrame } from './frame.js';
import type { Logger } from './types.js';
import { silentLogger } from './types.js';

/** Handler called when a frame is received. */
export type FrameHandler = (frame: RpcFrame) => void;

/** Handler called when the transport encounters an error. */
export type TransportErrorHandler = (error: Error) => void;

/** Handler called when the transport is closed. */
export type TransportCloseHandler = () => void;

/**
 * Transport defines the interface for sending/receiving RpcFrames.
 * Implementations handle platform-specific encoding and messaging.
 */
export interface Transport {
  /** Send a frame to the peer. */
  send(frame: RpcFrame): void;

  /** Register a handler for incoming frames. */
  onFrame(handler: FrameHandler): void;

  /** Register a handler for transport-level errors. */
  onError(handler: TransportErrorHandler): void;

  /** Register a handler for transport close events. */
  onClose(handler: TransportCloseHandler): void;

  /** Close the transport and release resources. */
  close(): void;

  /** Whether the transport is currently open. */
  readonly isOpen: boolean;
}

/**
 * Encoding strategy for frame serialization over the wire.
 * Different platform bridges may need different encodings.
 */
export enum FrameEncoding {
  /** Binary protobuf encoding (Uint8Array). Most efficient. */
  BINARY = 'binary',
  /** Base64-encoded protobuf bytes (string). For bridges that only support strings. */
  BASE64 = 'base64',
}

/**
 * Base class for transports that work with a generic message-passing mechanism.
 * Subclasses implement sendRaw() and set up the receive path to call handleRawMessage().
 */
export abstract class MessageTransportBase implements Transport {
  private frameHandlers: FrameHandler[] = [];
  private errorHandlers: TransportErrorHandler[] = [];
  private closeHandlers: TransportCloseHandler[] = [];
  protected logger: Logger;
  private _isOpen = true;

  constructor(
    protected readonly encoding: FrameEncoding = FrameEncoding.BINARY,
    logger?: Logger,
  ) {
    this.logger = logger ?? silentLogger;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  send(frame: RpcFrame): void {
    if (!this._isOpen) {
      throw new Error('Transport is closed');
    }
    const encoded = encodeFrame(frame);
    this.logger.debug(`TX frame type=${frame.type} stream=${frame.streamId} seq=${frame.sequence} (${encoded.length} bytes)`);

    if (this.encoding === FrameEncoding.BASE64) {
      this.sendRaw(uint8ArrayToBase64(encoded));
    } else {
      this.sendRaw(encoded);
    }
  }

  /** Implement to send raw data over the platform bridge. */
  protected abstract sendRaw(data: Uint8Array | string): void;

  /** Call this from subclass when raw data arrives from the peer. */
  protected handleRawMessage(data: Uint8Array | string | ArrayBuffer): void {
    try {
      let bytes: Uint8Array;
      if (typeof data === 'string') {
        bytes = base64ToUint8Array(data);
      } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
      } else {
        bytes = data;
      }

      const frame = decodeFrame(bytes);
      this.logger.debug(`RX frame type=${frame.type} stream=${frame.streamId} seq=${frame.sequence} (${bytes.length} bytes)`);

      for (const handler of this.frameHandlers) {
        handler(frame);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Failed to decode frame:', error);
      this.emitError(error);
    }
  }

  onFrame(handler: FrameHandler): void {
    this.frameHandlers.push(handler);
  }

  onError(handler: TransportErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: TransportCloseHandler): void {
    this.closeHandlers.push(handler);
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.logger.info('Transport closed');
    for (const handler of this.closeHandlers) {
      handler();
    }
    this.frameHandlers = [];
    this.errorHandlers = [];
    this.closeHandlers = [];
  }

  protected emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }
}

// --- Base64 utilities ---

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Use built-in btoa if available (browser + modern Node)
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  // Node.js Buffer fallback
  return Buffer.from(bytes).toString('base64');
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  // Node.js Buffer fallback
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * In-memory loopback transport pair for testing.
 * Frames sent on one side are received by the other.
 */
export function createLoopbackTransportPair(logger?: Logger): [Transport, Transport] {
  const clientTransport = new LoopbackTransport('client', logger);
  const serverTransport = new LoopbackTransport('server', logger);
  clientTransport.setPeer(serverTransport);
  serverTransport.setPeer(clientTransport);
  return [clientTransport, serverTransport];
}

class LoopbackTransport extends MessageTransportBase {
  private peer?: LoopbackTransport;

  constructor(
    private readonly side: string,
    logger?: Logger,
  ) {
    super(FrameEncoding.BINARY, logger);
  }

  setPeer(peer: LoopbackTransport): void {
    this.peer = peer;
  }

  protected sendRaw(data: Uint8Array | string): void {
    if (!this.peer || !this.peer.isOpen) {
      throw new Error(`Loopback peer (${this.side}) is not connected`);
    }
    // Simulate async delivery (microtask)
    const rawData = data;
    queueMicrotask(() => {
      if (this.peer?.isOpen) {
        this.peer.handleRawMessage(rawData);
      }
    });
  }
}
