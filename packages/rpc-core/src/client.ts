/**
 * Client-side RPC runtime.
 *
 * RpcClient manages outgoing RPC calls over a Transport.
 * It handles stream lifecycle, frame dispatch, flow control,
 * deadlines, and cancellation.
 *
 * Generated client stubs delegate to RpcClient methods.
 */

import {
  FrameType,
  type RpcFrame,
  createOpenFrame,
  createMessageFrame,
  createHalfCloseFrame,
  createCancelFrame,
  createRequestNFrame,
} from './frame.js';
import type { Transport } from './transport.js';
import { Stream, StreamManager, StreamState } from './stream.js';
import { RpcError, RpcStatusCode, CancelledError, DeadlineExceededError } from './errors.js';
import { type CallOptions, MethodType, type Logger, silentLogger } from './types.js';
import { performHandshake, type HandshakeResult } from './handshake.js';
import { DEFAULT_INITIAL_CREDITS } from './flow-control.js';

export interface RpcClientOptions {
  /** Transport for sending/receiving frames. */
  transport: Transport;
  /** Logger instance. */
  logger?: Logger;
  /** Skip the handshake (for testing or when handshake is handled externally). */
  skipHandshake?: boolean;
  /** Default deadline in ms for all calls (0 = no deadline). */
  defaultDeadlineMs?: number;
  /** Default initial flow control credits. */
  defaultInitialCredits?: number;
}

export class RpcClient {
  private readonly transport: Transport;
  private readonly streams: StreamManager;
  private readonly logger: Logger;
  private readonly defaultDeadlineMs: number;
  private readonly defaultInitialCredits: number;
  private handshakeResult?: HandshakeResult;
  private ready: Promise<void>;
  private closed = false;

  constructor(options: RpcClientOptions) {
    this.transport = options.transport;
    this.logger = options.logger ?? silentLogger;
    this.streams = new StreamManager(true); // client side
    this.defaultDeadlineMs = options.defaultDeadlineMs ?? 0;
    this.defaultInitialCredits = options.defaultInitialCredits ?? DEFAULT_INITIAL_CREDITS;

    // Set up frame dispatch
    this.transport.onFrame((frame) => this.handleFrame(frame));
    this.transport.onError((err) => this.handleTransportError(err));
    this.transport.onClose(() => this.handleTransportClose());

    // Perform handshake
    if (options.skipHandshake) {
      this.ready = Promise.resolve();
    } else {
      this.ready = performHandshake(this.transport, { logger: this.logger })
        .then((result) => {
          this.handshakeResult = result;
        });
    }
  }

  /** Wait for the client to be ready (handshake complete). */
  async waitReady(): Promise<void> {
    await this.ready;
  }

  /** Get the handshake result, if handshake was performed. */
  getHandshakeResult(): HandshakeResult | undefined {
    return this.handshakeResult;
  }

  /** Close the client and cancel all active streams. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.streams.cancelAll('Client closed');
    this.transport.close();
  }

  // --- RPC call methods ---

  /**
   * Unary RPC: send one request, get one response.
   */
  async unary(
    method: string,
    requestBytes: Uint8Array,
    options?: CallOptions,
  ): Promise<{ data: Uint8Array; metadata?: Record<string, string>; trailers?: Record<string, string> }> {
    await this.ready;
    this.ensureOpen();

    const credits = options?.initialCredits ?? this.defaultInitialCredits;
    const stream = this.streams.createStream(credits);
    const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;

    try {
      // Set up cancellation
      this.setupCancellation(stream, options?.signal, deadlineMs);

      // Send OPEN
      const openFrame = createOpenFrame(
        stream.streamId,
        method,
        MethodType.UNARY,
        options?.metadata,
        deadlineMs,
      );
      this.transport.send(openFrame);
      stream.open();

      // Send initial REQUEST_N
      this.transport.send(createRequestNFrame(stream.streamId, credits));

      // Send message
      const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), requestBytes);
      this.transport.send(msgFrame);

      // Send HALF_CLOSE (client done sending)
      this.transport.send(createHalfCloseFrame(stream.streamId));
      stream.setState(StreamState.HALF_CLOSED_LOCAL);

      // Wait for response
      const responseBytes = await stream.collectUnary();
      return {
        data: responseBytes as Uint8Array,
        metadata: stream.responseMetadata,
        trailers: stream.trailers,
      };
    } catch (err) {
      this.cancelStream(stream);
      throw err;
    } finally {
      this.streams.removeStream(stream.streamId);
    }
  }

  /**
   * Server-streaming RPC: send one request, get a stream of responses.
   */
  async *serverStream(
    method: string,
    requestBytes: Uint8Array,
    options?: CallOptions,
  ): AsyncGenerator<Uint8Array, void, undefined> {
    await this.ready;
    this.ensureOpen();

    const credits = options?.initialCredits ?? this.defaultInitialCredits;
    const stream = this.streams.createStream(credits);
    const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;

    try {
      this.setupCancellation(stream, options?.signal, deadlineMs);

      // Send OPEN
      const openFrame = createOpenFrame(
        stream.streamId,
        method,
        MethodType.SERVER_STREAMING,
        options?.metadata,
        deadlineMs,
      );
      this.transport.send(openFrame);
      stream.open();

      // Send initial REQUEST_N
      this.transport.send(createRequestNFrame(stream.streamId, credits));

      // Send request message
      const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), requestBytes);
      this.transport.send(msgFrame);

      // Send HALF_CLOSE
      this.transport.send(createHalfCloseFrame(stream.streamId));
      stream.setState(StreamState.HALF_CLOSED_LOCAL);

      // Yield incoming messages with flow control
      for await (const msg of stream.messages()) {
        yield msg as Uint8Array;
        // Replenish flow control credits
        const additionalCredits = stream.receiveFlow.onMessageReceived();
        if (additionalCredits > 0) {
          this.transport.send(createRequestNFrame(stream.streamId, additionalCredits));
        }
      }
    } catch (err) {
      this.cancelStream(stream);
      throw err;
    } finally {
      this.streams.removeStream(stream.streamId);
    }
  }

  /**
   * Client-streaming RPC: send a stream of requests, get one response.
   */
  async clientStream(
    method: string,
    requests: AsyncIterable<Uint8Array>,
    options?: CallOptions,
  ): Promise<{ data: Uint8Array; metadata?: Record<string, string>; trailers?: Record<string, string> }> {
    await this.ready;
    this.ensureOpen();

    const credits = options?.initialCredits ?? this.defaultInitialCredits;
    const stream = this.streams.createStream(credits);
    const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;

    try {
      this.setupCancellation(stream, options?.signal, deadlineMs);

      // Send OPEN
      const openFrame = createOpenFrame(
        stream.streamId,
        method,
        MethodType.CLIENT_STREAMING,
        options?.metadata,
        deadlineMs,
      );
      this.transport.send(openFrame);
      stream.open();

      // Send initial REQUEST_N for the response
      this.transport.send(createRequestNFrame(stream.streamId, credits));

      // Stream request messages with flow control
      for await (const reqBytes of requests) {
        if (stream.state === StreamState.CANCELLED || stream.state === StreamState.ERROR) {
          break;
        }
        await stream.sendFlow.acquire(stream.signal);
        const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), reqBytes);
        this.transport.send(msgFrame);
      }

      // Send HALF_CLOSE
      this.transport.send(createHalfCloseFrame(stream.streamId));
      stream.setState(StreamState.HALF_CLOSED_LOCAL);

      // Wait for single response
      const responseBytes = await stream.collectUnary();
      return {
        data: responseBytes as Uint8Array,
        metadata: stream.responseMetadata,
        trailers: stream.trailers,
      };
    } catch (err) {
      this.cancelStream(stream);
      throw err;
    } finally {
      this.streams.removeStream(stream.streamId);
    }
  }

  /**
   * Bidirectional streaming RPC: send and receive message streams concurrently.
   */
  bidiStream(
    method: string,
    requests: AsyncIterable<Uint8Array>,
    options?: CallOptions,
  ): AsyncGenerator<Uint8Array, void, undefined> {
    const credits = options?.initialCredits ?? this.defaultInitialCredits;
    // We need to create and return the generator immediately but do
    // setup asynchronously inside it.
    const self = this;
    return (async function* () {
      await self.ready;
      self.ensureOpen();

      const stream = self.streams.createStream(credits);
      const deadlineMs = options?.deadlineMs ?? self.defaultDeadlineMs;

      try {
        self.setupCancellation(stream, options?.signal, deadlineMs);

        // Send OPEN
        const openFrame = createOpenFrame(
          stream.streamId,
          method,
          MethodType.BIDI_STREAMING,
          options?.metadata,
          deadlineMs,
        );
        self.transport.send(openFrame);
        stream.open();

        // Send initial REQUEST_N
        self.transport.send(createRequestNFrame(stream.streamId, credits));

        // Start sending in the background
        const sendDone = (async () => {
          try {
            for await (const reqBytes of requests) {
              if (stream.state === StreamState.CANCELLED || stream.state === StreamState.ERROR) {
                break;
              }
              await stream.sendFlow.acquire(stream.signal);
              const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), reqBytes);
              self.transport.send(msgFrame);
            }
            // Send HALF_CLOSE when client is done sending
            if (stream.state === StreamState.OPEN) {
              self.transport.send(createHalfCloseFrame(stream.streamId));
              stream.setState(StreamState.HALF_CLOSED_LOCAL);
            }
          } catch (err) {
            // If sending fails, don't propagate here - the receive side will see it
            if (!(err instanceof CancelledError)) {
              self.logger.error('Bidi send error:', err);
            }
          }
        })();

        // Yield incoming messages with flow control
        try {
          for await (const msg of stream.messages()) {
            yield msg as Uint8Array;
            const additionalCredits = stream.receiveFlow.onMessageReceived();
            if (additionalCredits > 0) {
              self.transport.send(createRequestNFrame(stream.streamId, additionalCredits));
            }
          }
        } finally {
          await sendDone.catch(() => {});
        }
      } catch (err) {
        self.cancelStream(stream);
        throw err;
      } finally {
        self.streams.removeStream(stream.streamId);
      }
    })();
  }

  // --- Frame handling ---

  private handleFrame(frame: RpcFrame): void {
    // Ignore handshake frames (handled by handshake module)
    if (frame.type === FrameType.HANDSHAKE) return;

    const stream = this.streams.getStream(frame.streamId);
    if (!stream) {
      this.logger.warn(`Received frame for unknown stream ${frame.streamId}, type=${frame.type}`);
      return;
    }

    switch (frame.type) {
      case FrameType.MESSAGE:
        if (frame.metadata) {
          stream.setResponseMetadata(frame.metadata);
        }
        stream.pushMessage(frame.payload ?? new Uint8Array(0));
        break;

      case FrameType.CLOSE:
        stream.setState(StreamState.CLOSED);
        stream.pushEnd(frame.trailers);
        break;

      case FrameType.ERROR:
        stream.setState(StreamState.ERROR);
        stream.pushError(
          RpcError.fromFrame(
            frame.errorCode ?? RpcStatusCode.UNKNOWN,
            frame.errorMessage ?? 'Unknown error',
            frame.errorDetails,
          ),
        );
        break;

      case FrameType.HALF_CLOSE:
        // Server half-closed (no more messages from server)
        if (stream.state === StreamState.HALF_CLOSED_LOCAL) {
          stream.setState(StreamState.HALF_CLOSED_BOTH);
        } else {
          stream.setState(StreamState.HALF_CLOSED_REMOTE);
        }
        break;

      case FrameType.REQUEST_N:
        // Server granting us more send credits
        stream.sendFlow.addCredits(frame.requestN ?? 0);
        break;

      case FrameType.CANCEL:
        stream.cancel('Cancelled by server');
        break;

      default:
        // Unknown frame type: ignore for forward compatibility
        this.logger.debug(`Ignoring unknown frame type ${frame.type} on stream ${frame.streamId}`);
        break;
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

  // --- Helpers ---

  private ensureOpen(): void {
    if (this.closed) {
      throw new RpcError(RpcStatusCode.UNAVAILABLE, 'Client is closed');
    }
    if (!this.transport.isOpen) {
      throw new RpcError(RpcStatusCode.UNAVAILABLE, 'Transport is not open');
    }
  }

  private setupCancellation(
    stream: Stream,
    signal?: AbortSignal,
    deadlineMs?: number,
  ): void {
    // External abort signal
    if (signal) {
      if (signal.aborted) {
        stream.cancel('Aborted');
        return;
      }
      signal.addEventListener('abort', () => {
        stream.cancel('Aborted');
        this.cancelStream(stream);
      }, { once: true });
    }

    // Deadline
    if (deadlineMs && deadlineMs > 0) {
      setTimeout(() => {
        if (stream.state === StreamState.OPEN ||
            stream.state === StreamState.HALF_CLOSED_LOCAL ||
            stream.state === StreamState.HALF_CLOSED_REMOTE) {
          stream.pushError(new DeadlineExceededError());
          stream.setState(StreamState.ERROR);
          this.cancelStream(stream);
        }
      }, deadlineMs);
    }
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
