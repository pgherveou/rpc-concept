/**
 * Client-side RPC runtime.
 *
 * RpcClient manages outgoing RPC calls over a Transport.
 * It handles stream lifecycle, frame dispatch, deadlines, and cancellation.
 *
 * Generated client stubs delegate to RpcClient methods.
 */

import {
  type RpcFrame,
  isMessageFrame,
  isCloseFrame,
  isErrorFrame,
  isHalfCloseFrame,
  isCancelFrame,
  createOpenFrame,
  createMessageFrame,
  createHalfCloseFrame,
  createCancelFrame,
} from './frame.js';
import type { Transport } from './transport.js';
import { Stream, StreamManager, StreamState } from './stream.js';
import { RpcError, RpcStatusCode, CancelledError, DeadlineExceededError } from './errors.js';
import { type CallOptions, type Logger, silentLogger } from './types.js';

/** Result type for streaming RPCs with startup_error. */
export type Subscription<T, E> =
  | { ok: true; events: AsyncGenerator<T, void, undefined> }
  | { ok: false; error: E };

export interface RpcClientOptions {
  transport: Transport;
  logger?: Logger;
  defaultDeadlineMs?: number;
}

export class RpcClient {
  private readonly transport: Transport;
  private readonly streams: StreamManager;
  private readonly logger: Logger;
  private readonly defaultDeadlineMs: number;
  private closed = false;

  constructor(options: RpcClientOptions) {
    this.transport = options.transport;
    this.logger = options.logger ?? silentLogger;
    this.streams = new StreamManager(true);
    this.defaultDeadlineMs = options.defaultDeadlineMs ?? 0;

    this.transport.onFrame((frame) => this.handleFrame(frame));
    this.transport.onError((err) => this.handleTransportError(err));
    this.transport.onClose(() => this.handleTransportClose());
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.streams.cancelAll('Client closed');
    this.transport.close();
  }

  async unary(
    method: string,
    request: unknown,
    options?: CallOptions,
  ): Promise<unknown> {
    this.ensureOpen();

    const stream = this.streams.createStream();
    const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
    const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);

    try {
      this.transport.send(createOpenFrame(stream.streamId, method));
      stream.open();

      this.transport.send(createMessageFrame(stream.streamId, request));

      this.transport.send(createHalfCloseFrame(stream.streamId));
      stream.setState(StreamState.HALF_CLOSED_LOCAL);

      return await stream.collectUnary();
    } catch (err) {
      this.cancelStream(stream);
      throw err;
    } finally {
      cleanup();
      this.streams.removeStream(stream.streamId);
    }
  }

  async *serverStream(
    method: string,
    request: unknown,
    options?: CallOptions,
  ): AsyncGenerator<unknown, void, undefined> {
    this.ensureOpen();

    const stream = this.streams.createStream();
    const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
    const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);

    try {
      this.transport.send(createOpenFrame(stream.streamId, method));
      stream.open();

      this.transport.send(createMessageFrame(stream.streamId, request));

      this.transport.send(createHalfCloseFrame(stream.streamId));
      stream.setState(StreamState.HALF_CLOSED_LOCAL);

      for await (const msg of stream.messages()) {
        yield msg;
      }
    } catch (err) {
      this.cancelStream(stream);
      throw err;
    } finally {
      cleanup();
      this.streams.removeStream(stream.streamId);
    }
  }

  /**
   * Server-streaming RPC that may fail with a typed startup error.
   *
   * Opens the stream and waits for the first frame:
   * - MESSAGE: resolves { ok: true, events } (first message is included)
   * - ERROR with details: resolves { ok: false, error: details }
   * - ERROR without details: throws RpcError (transport/protocol error)
   * - CLOSE: resolves { ok: true, events: empty }
   */
  async serverStreamWithStartupError<T = unknown, E = unknown>(
    method: string,
    request: unknown,
    options?: CallOptions,
  ): Promise<Subscription<T, E>> {
    this.ensureOpen();

    const stream = this.streams.createStream();
    const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
    const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);

    this.transport.send(createOpenFrame(stream.streamId, method));
    stream.open();

    this.transport.send(createMessageFrame(stream.streamId, request));

    this.transport.send(createHalfCloseFrame(stream.streamId));
    stream.setState(StreamState.HALF_CLOSED_LOCAL);

    // Wait for the first frame to discriminate startup error vs success.
    const gen = stream.messages();
    let first: IteratorResult<unknown>;
    try {
      first = await gen.next();
    } catch (err) {
      cleanup();
      this.cancelStream(stream);
      this.streams.removeStream(stream.streamId);

      if (err instanceof RpcError && err.details !== undefined) {
        return { ok: false, error: err.details as E };
      }
      throw err;
    }

    // Stream closed immediately with no messages (empty stream).
    if (first.done) {
      cleanup();
      this.streams.removeStream(stream.streamId);
      return {
        ok: true,
        events: (async function* () {})() as AsyncGenerator<T, void, undefined>,
      };
    }

    // First message received, return generator that yields it then the rest.
    const self = this;
    const events = (async function* () {
      try {
        yield first.value as T;
        for (;;) {
          const next = await gen.next();
          if (next.done) break;
          yield next.value as T;
        }
      } catch (err) {
        self.cancelStream(stream);
        throw err;
      } finally {
        cleanup();
        self.streams.removeStream(stream.streamId);
      }
    })();

    return { ok: true, events: events as AsyncGenerator<T, void, undefined> };
  }

  async clientStream(
    method: string,
    requests: AsyncIterable<unknown>,
    options?: CallOptions,
  ): Promise<unknown> {
    this.ensureOpen();

    const stream = this.streams.createStream();
    const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
    const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);

    try {
      this.transport.send(createOpenFrame(stream.streamId, method));
      stream.open();

      for await (const req of requests) {
        if (stream.state === StreamState.CANCELLED || stream.state === StreamState.ERROR) {
          break;
        }
        this.transport.send(createMessageFrame(stream.streamId, req));
      }

      if (stream.state === StreamState.OPEN) {
        this.transport.send(createHalfCloseFrame(stream.streamId));
        stream.setState(StreamState.HALF_CLOSED_LOCAL);
      }

      return await stream.collectUnary();
    } catch (err) {
      this.cancelStream(stream);
      throw err;
    } finally {
      cleanup();
      this.streams.removeStream(stream.streamId);
    }
  }

  bidiStream(
    method: string,
    requests: AsyncIterable<unknown>,
    options?: CallOptions,
  ): AsyncGenerator<unknown, void, undefined> {
    const self = this;
    return (async function* () {
      self.ensureOpen();

      const stream = self.streams.createStream();
      const deadlineMs = options?.deadlineMs ?? self.defaultDeadlineMs;
      const cleanup = self.setupCancellation(stream, options?.signal, deadlineMs);

      try {
        self.transport.send(createOpenFrame(stream.streamId, method));
        stream.open();

        const sendDone = (async () => {
          try {
            for await (const req of requests) {
              if (stream.state === StreamState.CANCELLED || stream.state === StreamState.ERROR) {
                break;
              }
              self.transport.send(createMessageFrame(stream.streamId, req));
            }
            if (stream.state === StreamState.OPEN) {
              self.transport.send(createHalfCloseFrame(stream.streamId));
              stream.setState(StreamState.HALF_CLOSED_LOCAL);
            }
          } catch (err) {
            if (!(err instanceof CancelledError)) {
              self.logger.error('Bidi send error:', err);
            }
          }
        })();

        try {
          for await (const msg of stream.messages()) {
            yield msg;
          }
        } finally {
          await sendDone.catch(() => {});
        }
      } catch (err) {
        self.cancelStream(stream);
        throw err;
      } finally {
        cleanup();
        self.streams.removeStream(stream.streamId);
      }
    })();
  }

  private handleFrame(frame: RpcFrame): void {
    const stream = this.streams.getStream(frame.streamId);
    if (!stream) {
      this.logger.warn(`Received frame for unknown stream ${frame.streamId}`);
      return;
    }

    if (isMessageFrame(frame)) {
      stream.pushMessage(frame.message.payload);
    } else if (isCloseFrame(frame)) {
      stream.setState(StreamState.CLOSED);
      stream.pushEnd();
    } else if (isErrorFrame(frame)) {
      stream.setState(StreamState.ERROR);
      stream.pushError(
        RpcError.fromFrame(frame.error.errorCode, frame.error.errorMessage, frame.error.details),
      );
    } else if (isHalfCloseFrame(frame)) {
      if (stream.state === StreamState.HALF_CLOSED_LOCAL) {
        stream.setState(StreamState.HALF_CLOSED_BOTH);
      } else {
        stream.setState(StreamState.HALF_CLOSED_REMOTE);
      }
    } else if (isCancelFrame(frame)) {
      stream.cancel('Cancelled by server');
    } else {
      this.logger.debug(`Ignoring unknown frame on stream ${frame.streamId}`);
    }
  }

  private handleTransportError(err: Error): void {
    this.logger.error('Transport error:', err);
    this.streams.cancelAll('Transport error');
  }

  private handleTransportClose(): void {
    this.logger.info('Transport closed');
    this.streams.cancelAll('Transport closed');
    this.closed = true;
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new RpcError(RpcStatusCode.INTERNAL, 'Client is closed');
    }
    if (!this.transport.isOpen) {
      throw new RpcError(RpcStatusCode.INTERNAL, 'Transport is not open');
    }
  }

  private setupCancellation(
    stream: Stream,
    signal?: AbortSignal,
    deadlineMs?: number,
  ): () => void {
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;

    if (signal) {
      if (signal.aborted) {
        stream.cancel('Aborted');
      } else {
        abortHandler = () => {
          stream.cancel('Aborted');
          this.cancelStream(stream);
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    }

    if (deadlineMs && deadlineMs > 0) {
      deadlineTimer = setTimeout(() => {
        if (stream.state === StreamState.OPEN ||
            stream.state === StreamState.HALF_CLOSED_LOCAL ||
            stream.state === StreamState.HALF_CLOSED_REMOTE) {
          stream.pushError(new DeadlineExceededError());
          stream.setState(StreamState.ERROR);
          this.cancelStream(stream);
        }
      }, deadlineMs);
    }

    return () => {
      if (deadlineTimer !== undefined) {
        clearTimeout(deadlineTimer);
      }
      if (abortHandler && signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    };
  }

  private cancelStream(stream: Stream): void {
    try {
      if (this.transport.isOpen &&
          stream.state !== StreamState.CLOSED &&
          stream.state !== StreamState.ERROR) {
        this.transport.send(createCancelFrame(stream.streamId));
      }
    } catch {
      // Best effort
    }
  }
}
