/**
 * Transport abstraction layer.
 *
 * A Transport is the lowest-level interface for sending and receiving
 * RpcFrame messages. It is independent of any specific platform messaging
 * primitive (postMessage, WKWebView bridge, Android WebView, Electron IPC).
 *
 * Platform-specific adapters implement this interface.
 */

import { type RpcFrame, frameToJSON, frameFromJSON, frameType, isOpenFrame } from './frame.js';
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

  /** Register a handler for incoming frames. Returns an unsubscribe function. */
  onFrame(handler: FrameHandler): () => void;

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
  /** Structured clone: pass RpcFrame as a plain object. For MessagePort and Electron IPC. */
  STRUCTURED_CLONE = 'structured_clone',
  /** JSON string encoding. For bridges that only support strings (iOS, Android). */
  JSON = 'json',
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
    protected readonly encoding: FrameEncoding = FrameEncoding.STRUCTURED_CLONE,
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

    const method = isOpenFrame(frame) ? frame.open.method : '-';
    if (this.encoding === FrameEncoding.STRUCTURED_CLONE) {
      this.logger.debug(`TX frame ${frameType(frame)} stream=${frame.streamId} method=${method} (structured clone)`);
      this.sendRaw(frame);
    } else {
      this.logger.debug(`TX frame ${frameType(frame)} stream=${frame.streamId} method=${method} (json)`);
      this.sendRaw(frameToJSON(frame));
    }
  }

  /** Implement to send raw data over the platform bridge. */
  protected abstract sendRaw(data: string | RpcFrame): void;

  /** Call this from subclass when raw data arrives from the peer. */
  protected handleRawMessage(data: string | RpcFrame): void {
    try {
      if (this.encoding === FrameEncoding.STRUCTURED_CLONE) {
        const frame = data as RpcFrame;
        const method = isOpenFrame(frame) ? frame.open.method : '-';
        this.logger.debug(`RX frame ${frameType(frame)} stream=${frame.streamId} method=${method} (structured clone)`);
        this.dispatchFrame(frame);
      } else {
        const frame = frameFromJSON(data as string);
        const method = isOpenFrame(frame) ? frame.open.method : '-';
        this.logger.debug(`RX frame ${frameType(frame)} stream=${frame.streamId} method=${method} (json)`);
        this.dispatchFrame(frame);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Failed to decode frame:', error);
      this.emitError(error);
    }
  }

  private dispatchFrame(frame: RpcFrame): void {
    const handlers = [...this.frameHandlers];
    for (const handler of handlers) {
      try {
        handler(frame);
      } catch (err) {
        this.logger.error('Frame handler error:', err);
      }
    }
  }

  onFrame(handler: FrameHandler): () => void {
    this.frameHandlers.push(handler);
    return () => {
      const idx = this.frameHandlers.indexOf(handler);
      if (idx >= 0) this.frameHandlers.splice(idx, 1);
    };
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
      try {
        handler();
      } catch (err) {
        this.logger.error('Close handler error:', err);
      }
    }
    this.frameHandlers = [];
    this.errorHandlers = [];
    this.closeHandlers = [];
  }

  protected emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (err) {
        this.logger.error('Error handler threw:', err);
      }
    }
  }
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
    super(FrameEncoding.STRUCTURED_CLONE, logger);
  }

  setPeer(peer: LoopbackTransport): void {
    this.peer = peer;
  }

  protected sendRaw(data: string | RpcFrame): void {
    if (!this.peer || !this.peer.isOpen) {
      throw new Error(`Loopback peer (${this.side}) is not connected`);
    }
    const rawData = data;
    queueMicrotask(() => {
      if (this.peer?.isOpen) {
        this.peer.handleRawMessage(rawData);
      }
    });
  }
}
