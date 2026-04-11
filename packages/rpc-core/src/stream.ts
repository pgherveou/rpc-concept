/**
 * Stream lifecycle management.
 *
 * Each RPC call creates one or more logical streams identified by streamId.
 * This module manages the state machine for streams and provides
 * async iteration interfaces for consuming stream messages.
 */

import { RpcError, CancelledError, RpcStatusCode } from './errors.js';
import { SendFlowController, ReceiveFlowController, DEFAULT_INITIAL_CREDITS } from './flow-control.js';
import type { Metadata } from './types.js';

/** Possible states for a stream. */
export enum StreamState {
  /** Stream has been created but OPEN not yet sent/received. */
  IDLE = 'idle',
  /** OPEN sent/received, stream is active. */
  OPEN = 'open',
  /** Local side has sent HALF_CLOSE (no more outgoing messages). */
  HALF_CLOSED_LOCAL = 'half_closed_local',
  /** Remote side has sent HALF_CLOSE (no more incoming messages). */
  HALF_CLOSED_REMOTE = 'half_closed_remote',
  /** Both sides have half-closed. */
  HALF_CLOSED_BOTH = 'half_closed_both',
  /** Stream completed normally (CLOSE received). */
  CLOSED = 'closed',
  /** Stream terminated with error. */
  ERROR = 'error',
  /** Stream was cancelled. */
  CANCELLED = 'cancelled',
}

/** Queued item for the message buffer. */
type QueueItem<T> =
  | { type: 'message'; value: T }
  | { type: 'error'; error: Error }
  | { type: 'end'; trailers?: Metadata };

/**
 * Manages a single logical stream's lifecycle and message buffering.
 * Used by both client and server sides.
 */
export class Stream<TIncoming = Uint8Array> {
  readonly streamId: number;
  private _state: StreamState = StreamState.IDLE;
  private readonly abortController = new AbortController();

  // Incoming message queue
  private readonly queue: QueueItem<TIncoming>[] = [];
  private waiter: ((item: QueueItem<TIncoming>) => void) | null = null;

  // Flow control
  readonly sendFlow: SendFlowController;
  readonly receiveFlow: ReceiveFlowController;

  // Sequence tracking
  private sendSequence = 0;
  private receiveSequence = 0;

  // Metadata
  private _responseMetadata?: Metadata;
  private _trailers?: Metadata;

  constructor(
    streamId: number,
    initialCredits: number = DEFAULT_INITIAL_CREDITS,
  ) {
    this.streamId = streamId;
    this.sendFlow = new SendFlowController();
    this.receiveFlow = new ReceiveFlowController(initialCredits);
  }

  get state(): StreamState {
    return this._state;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  get responseMetadata(): Metadata | undefined {
    return this._responseMetadata;
  }

  get trailers(): Metadata | undefined {
    return this._trailers;
  }

  /** Transition to a new state with validation. */
  setState(newState: StreamState): void {
    this._state = newState;
  }

  /** Mark stream as open. */
  open(): void {
    this._state = StreamState.OPEN;
  }

  /** Get and increment send sequence number. */
  nextSendSequence(): number {
    return ++this.sendSequence;
  }

  /** Validate and track incoming sequence number. */
  validateReceiveSequence(seq: number): boolean {
    if (seq <= 0) return true; // 0 means no sequence tracking
    if (seq !== this.receiveSequence + 1) {
      return false; // Out of order or duplicate
    }
    this.receiveSequence = seq;
    return true;
  }

  /** Push an incoming message to the queue. */
  pushMessage(message: TIncoming): void {
    const item: QueueItem<TIncoming> = { type: 'message', value: message };
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(item);
    } else {
      this.queue.push(item);
    }
  }

  /** Signal that no more incoming messages will arrive. */
  pushEnd(trailers?: Metadata): void {
    this._trailers = trailers;
    const item: QueueItem<TIncoming> = { type: 'end', trailers };
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(item);
    } else {
      this.queue.push(item);
    }
  }

  /** Signal an error on the incoming side. */
  pushError(error: Error): void {
    const item: QueueItem<TIncoming> = { type: 'error', error };
    this.abortController.abort(error);
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(item);
    } else {
      this.queue.push(item);
    }
  }

  /** Cancel this stream. */
  cancel(reason?: string): void {
    if (this._state === StreamState.CLOSED ||
        this._state === StreamState.ERROR ||
        this._state === StreamState.CANCELLED) {
      return;
    }
    this._state = StreamState.CANCELLED;
    const err = new CancelledError(reason ?? 'Stream cancelled');
    this.abortController.abort(err);
    this.sendFlow.cancel();
    this.pushError(err);
  }

  /** Set response metadata from OPEN response or first MESSAGE. */
  setResponseMetadata(metadata: Metadata): void {
    this._responseMetadata = metadata;
  }

  /**
   * Async iterator for consuming incoming messages.
   * Yields messages until the stream ends or errors.
   */
  async *messages(): AsyncGenerator<TIncoming, void, undefined> {
    while (true) {
      const item = await this.nextItem();
      if (item.type === 'message') {
        yield item.value;
      } else if (item.type === 'error') {
        throw item.error;
      } else {
        // 'end'
        return;
      }
    }
  }

  /** Wait for the next item from the queue. */
  private nextItem(): Promise<QueueItem<TIncoming>> {
    // Check queue first
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift()!);
    }

    // Wait for next item
    return new Promise<QueueItem<TIncoming>>((resolve) => {
      this.waiter = resolve;
    });
  }

  /**
   * Collect a single response (for unary calls).
   * Expects exactly one message followed by end.
   */
  async collectUnary(): Promise<TIncoming> {
    const item = await this.nextItem();
    if (item.type === 'error') throw item.error;
    if (item.type === 'end') {
      throw new RpcError(RpcStatusCode.INTERNAL, 'Expected response message but stream ended');
    }

    // Wait for end
    const endItem = await this.nextItem();
    if (endItem.type === 'error') throw endItem.error;

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

  /** Allocate a new stream ID and create a stream. */
  createStream(initialCredits?: number): Stream {
    const id = this.nextStreamId;
    this.nextStreamId += 2;
    const stream = new Stream(id, initialCredits);
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
