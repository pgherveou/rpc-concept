/**
 * Stream lifecycle management.
 *
 * Each RPC call creates one or more logical streams identified by streamId.
 * This module manages the state machine for streams and provides
 * async iteration interfaces for consuming stream messages.
 */

import { RpcError, CancelledError, RpcStatusCode } from './errors.js';

/** Possible states for a stream. */
export enum StreamState {
  IDLE = 'idle',
  OPEN = 'open',
  HALF_CLOSED_LOCAL = 'half_closed_local',
  HALF_CLOSED_REMOTE = 'half_closed_remote',
  HALF_CLOSED_BOTH = 'half_closed_both',
  CLOSED = 'closed',
  ERROR = 'error',
  CANCELLED = 'cancelled',
}

/** Queued item for the message buffer. */
type QueueItem =
  | { type: 'message'; value: Uint8Array }
  | { type: 'error'; error: Error }
  | { type: 'end' };

/**
 * Manages a single logical stream's lifecycle and message buffering.
 */
export class Stream {
  readonly streamId: number;
  private _state: StreamState = StreamState.IDLE;
  private readonly abortController = new AbortController();

  // Incoming message queue
  private readonly queue: QueueItem[] = [];
  private waiter: ((item: QueueItem) => void) | null = null;

  constructor(streamId: number) {
    this.streamId = streamId;
  }

  get state(): StreamState {
    return this._state;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  setState(newState: StreamState): void {
    this._state = newState;
  }

  open(): void {
    this._state = StreamState.OPEN;
  }

  pushMessage(message: Uint8Array): void {
    const item: QueueItem = { type: 'message', value: message };
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(item);
    } else {
      this.queue.push(item);
    }
  }

  pushEnd(): void {
    const item: QueueItem = { type: 'end' };
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(item);
    } else {
      this.queue.push(item);
    }
  }

  pushError(error: Error): void {
    const item: QueueItem = { type: 'error', error };
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(item);
    } else {
      this.queue.push(item);
    }
  }

  cancel(reason?: string): void {
    if (this._state === StreamState.CLOSED ||
        this._state === StreamState.ERROR ||
        this._state === StreamState.CANCELLED) {
      return;
    }
    this._state = StreamState.CANCELLED;
    const err = new CancelledError(reason ?? 'Stream cancelled');
    this.abortController.abort(err);
    this.pushError(err);
  }

  async *messages(): AsyncGenerator<Uint8Array, void, undefined> {
    while (true) {
      const item = await this.nextItem();
      if (item.type === 'message') {
        yield item.value;
      } else if (item.type === 'error') {
        throw item.error;
      } else {
        return;
      }
    }
  }

  private nextItem(): Promise<QueueItem> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift()!);
    }
    return new Promise<QueueItem>((resolve) => {
      this.waiter = resolve;
    });
  }

  async collectUnary(): Promise<Uint8Array> {
    const item = await this.nextItem();
    if (item.type === 'error') throw item.error;
    if (item.type === 'end') {
      throw new RpcError(RpcStatusCode.INTERNAL, 'Expected response message but stream ended');
    }

    const endItem = await this.nextItem();
    if (endItem.type === 'error') throw endItem.error;
    if (endItem.type === 'message') {
      throw new RpcError(RpcStatusCode.INTERNAL, 'Expected end of stream but received another message');
    }

    return item.value;
  }
}

/**
 * StreamManager tracks all active streams for a connection.
 */
export class StreamManager {
  private readonly streams = new Map<number, Stream>();
  private nextStreamId: number;

  constructor(clientSide: boolean) {
    // Client uses odd IDs, server uses even IDs (starting from 2)
    this.nextStreamId = clientSide ? 1 : 2;
  }

  createStream(): Stream {
    const id = this.nextStreamId;
    this.nextStreamId += 2;
    const stream = new Stream(id);
    this.streams.set(id, stream);
    return stream;
  }

  /** Register an externally-created stream (e.g., server accepting a client stream). */
  registerStream(stream: Stream): void {
    this.streams.set(stream.streamId, stream);
  }

  /** Get a stream by ID. */
  getStream(streamId: number): Stream | undefined {
    return this.streams.get(streamId);
  }

  /** Remove a stream (after it's fully closed). */
  removeStream(streamId: number): void {
    this.streams.delete(streamId);
  }

  /** Cancel all active streams. */
  cancelAll(reason?: string): void {
    for (const stream of this.streams.values()) {
      stream.cancel(reason);
    }
    this.streams.clear();
  }

  /** Number of active streams. */
  get size(): number {
    return this.streams.size;
  }
}
