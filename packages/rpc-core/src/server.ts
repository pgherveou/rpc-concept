/**
 * Server-side RPC runtime.
 *
 * RpcServer dispatches incoming RPC calls to registered service handlers.
 * It manages server-side stream lifecycle, flow control, and error handling.
 *
 * Generated dispatcher code registers with RpcServer to handle specific services.
 */

import {
  FrameType,
  type RpcFrame,
  createMessageFrame,
  createHalfCloseFrame,
  createCloseFrame,
  createErrorFrame,
  createRequestNFrame,
} from './frame.js';
import type { Transport } from './transport.js';
import { Stream, StreamManager, StreamState } from './stream.js';
import { RpcError, RpcStatusCode } from './errors.js';
import { MethodType, type CallContext, type Logger, silentLogger } from './types.js';
import { acceptHandshake, type HandshakeResult } from './handshake.js';
import { DEFAULT_INITIAL_CREDITS } from './flow-control.js';

/** Handler function types for different RPC patterns. */
export type UnaryHandler = (
  request: Uint8Array,
  context: CallContext,
) => Promise<Uint8Array>;

export type ServerStreamHandler = (
  request: Uint8Array,
  context: CallContext,
) => AsyncIterable<Uint8Array>;

export type ClientStreamHandler = (
  requests: AsyncIterable<Uint8Array>,
  context: CallContext,
) => Promise<Uint8Array>;

export type BidiStreamHandler = (
  requests: AsyncIterable<Uint8Array>,
  context: CallContext,
) => AsyncIterable<Uint8Array>;

export type MethodHandler =
  | { type: MethodType.UNARY; handler: UnaryHandler }
  | { type: MethodType.SERVER_STREAMING; handler: ServerStreamHandler }
  | { type: MethodType.CLIENT_STREAMING; handler: ClientStreamHandler }
  | { type: MethodType.BIDI_STREAMING; handler: BidiStreamHandler };

/** Service registration with all its method handlers. */
export interface ServiceRegistration {
  /** Fully qualified service name: "package.ServiceName" */
  name: string;
  /** Method handlers keyed by method name. */
  methods: Record<string, MethodHandler>;
}

export interface RpcServerOptions {
  transport: Transport;
  logger?: Logger;
  skipHandshake?: boolean;
  defaultInitialCredits?: number;
}

export class RpcServer {
  private readonly transport: Transport;
  private readonly streams: StreamManager;
  private readonly logger: Logger;
  private readonly defaultInitialCredits: number;
  private readonly services = new Map<string, ServiceRegistration>();
  private handshakeResult?: HandshakeResult;
  private ready: Promise<void>;
  private isReady = false;
  private closed = false;

  constructor(options: RpcServerOptions) {
    this.transport = options.transport;
    this.logger = options.logger ?? silentLogger;
    this.streams = new StreamManager(false); // server side
    this.defaultInitialCredits = options.defaultInitialCredits ?? DEFAULT_INITIAL_CREDITS;

    // Set up frame dispatch
    this.transport.onFrame((frame) => this.handleFrame(frame));
    this.transport.onError((err) => this.handleTransportError(err));
    this.transport.onClose(() => this.handleTransportClose());

    // Accept handshake
    if (options.skipHandshake) {
      this.ready = Promise.resolve();
      this.isReady = true;
    } else {
      this.ready = acceptHandshake(this.transport, { logger: this.logger })
        .then((result) => {
          this.handshakeResult = result;
          this.isReady = true;
        })
        .catch((err) => {
          this.logger.error('Handshake failed:', err);
          this.closed = true;
          throw err;
        });
    }
  }

  /** Wait for the server to be ready (handshake complete). */
  async waitReady(): Promise<void> {
    await this.ready;
  }

  /** Get handshake result. */
  getHandshakeResult(): HandshakeResult | undefined {
    return this.handshakeResult;
  }

  /** Register a service with its method handlers. */
  registerService(service: ServiceRegistration): void {
    this.services.set(service.name, service);
    this.logger.info(`Registered service: ${service.name} (${Object.keys(service.methods).length} methods)`);
  }

  /** Close the server and cancel all active streams. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.streams.cancelAll('Server closed');
    this.transport.close();
  }

  // --- Frame handling ---

  private handleFrame(frame: RpcFrame): void {
    if (frame.type === FrameType.HANDSHAKE) return;

    // Guard: skip non-handshake frames if not yet ready
    if (!this.isReady) {
      this.logger.warn(`Received frame type=${frame.type} before handshake complete, ignoring`);
      return;
    }

    if (frame.type === FrameType.OPEN) {
      this.handleOpen(frame);
      return;
    }

    const stream = this.streams.getStream(frame.streamId);
    if (!stream) {
      this.logger.warn(`Received frame for unknown stream ${frame.streamId}, type=${frame.type}`);
      return;
    }

    switch (frame.type) {
      case FrameType.MESSAGE:
        stream.pushMessage(frame.payload ?? new Uint8Array(0));
        break;

      case FrameType.HALF_CLOSE:
        if (stream.state === StreamState.HALF_CLOSED_LOCAL) {
          stream.setState(StreamState.HALF_CLOSED_BOTH);
        } else {
          stream.setState(StreamState.HALF_CLOSED_REMOTE);
        }
        stream.pushEnd();
        break;

      case FrameType.REQUEST_N:
        stream.sendFlow.addCredits(frame.requestN ?? 0);
        break;

      case FrameType.CANCEL:
        this.logger.debug(`Stream ${frame.streamId} cancelled by client`);
        stream.cancel('Cancelled by client');
        this.streams.removeStream(frame.streamId);
        break;

      case FrameType.ERROR:
        stream.pushError(
          RpcError.fromFrame(
            frame.errorCode ?? RpcStatusCode.UNKNOWN,
            frame.errorMessage ?? 'Client error',
            frame.errorDetails,
          ),
        );
        this.streams.removeStream(frame.streamId);
        break;

      default:
        this.logger.debug(`Ignoring unknown frame type ${frame.type} on stream ${frame.streamId}`);
        break;
    }
  }

  private handleOpen(frame: RpcFrame): void {
    const method = frame.method;
    if (!method) {
      this.sendError(frame.streamId, RpcStatusCode.INVALID_ARGUMENT, 'Missing method name');
      return;
    }

    // Parse method: "package.ServiceName/MethodName"
    const slashIdx = method.lastIndexOf('/');
    if (slashIdx < 0) {
      this.sendError(frame.streamId, RpcStatusCode.INVALID_ARGUMENT, `Invalid method format: ${method}`);
      return;
    }

    const serviceName = method.substring(0, slashIdx);
    const methodName = method.substring(slashIdx + 1);

    const service = this.services.get(serviceName);
    if (!service) {
      this.sendError(frame.streamId, RpcStatusCode.UNIMPLEMENTED, `Unknown service: ${serviceName}`);
      return;
    }

    const methodHandler = service.methods[methodName];
    if (!methodHandler) {
      this.sendError(frame.streamId, RpcStatusCode.UNIMPLEMENTED, `Unknown method: ${method}`);
      return;
    }

    // Create the server-side stream
    const stream = new Stream(frame.streamId, this.defaultInitialCredits);
    stream.open();
    this.streams.registerStream(stream);

    // Do NOT self-grant send credits here.
    // The client's REQUEST_N frame will provide the send credits.

    // Build call context
    const context: CallContext = {
      metadata: frame.metadata ?? {},
      deadline: frame.deadlineMs ? Date.now() + frame.deadlineMs : undefined,
      signal: stream.signal,
      streamId: frame.streamId,
      method,
    };

    // Dispatch to the appropriate handler
    this.dispatchMethod(stream, methodHandler, context).catch((err) => {
      this.logger.error(`Handler error for ${method}:`, err);
    });
  }

  private async dispatchMethod(
    stream: Stream,
    methodHandler: MethodHandler,
    context: CallContext,
  ): Promise<void> {
    const streamId = stream.streamId;

    try {
      switch (methodHandler.type) {
        case MethodType.UNARY:
          await this.handleUnary(stream, methodHandler.handler, context);
          break;
        case MethodType.SERVER_STREAMING:
          await this.handleServerStream(stream, methodHandler.handler, context);
          break;
        case MethodType.CLIENT_STREAMING:
          await this.handleClientStream(stream, methodHandler.handler, context);
          break;
        case MethodType.BIDI_STREAMING:
          await this.handleBidiStream(stream, methodHandler.handler, context);
          break;
      }
    } catch (err) {
      if (stream.state === StreamState.CANCELLED) return;

      if (err instanceof RpcError) {
        this.sendError(streamId, err.code, err.message, err.details);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        this.sendError(streamId, RpcStatusCode.INTERNAL, message);
      }
    } finally {
      this.streams.removeStream(streamId);
    }
  }

  private async handleUnary(
    stream: Stream,
    handler: UnaryHandler,
    context: CallContext,
  ): Promise<void> {
    // Wait for the single request message
    const requestBytes = await stream.collectUnary();

    // Call handler
    const responseBytes = await handler(requestBytes, context);

    // Send response
    await stream.sendFlow.acquire(stream.signal);
    const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), responseBytes);
    this.transport.send(msgFrame);

    // Close stream
    this.transport.send(createCloseFrame(stream.streamId));
    stream.setState(StreamState.CLOSED);
  }

  private async handleServerStream(
    stream: Stream,
    handler: ServerStreamHandler,
    context: CallContext,
  ): Promise<void> {
    // Wait for the single request message
    const requestBytes = await stream.collectUnary();

    // Call handler to get response stream
    const responses = handler(requestBytes, context);

    // Send response messages with flow control
    for await (const responseBytes of responses) {
      if (stream.state === StreamState.CANCELLED) return;
      await stream.sendFlow.acquire(stream.signal);
      const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), responseBytes);
      this.transport.send(msgFrame);
    }

    // Close stream
    this.transport.send(createCloseFrame(stream.streamId));
    stream.setState(StreamState.CLOSED);
  }

  private async handleClientStream(
    stream: Stream,
    handler: ClientStreamHandler,
    context: CallContext,
  ): Promise<void> {
    // Send initial REQUEST_N to allow client to send
    this.transport.send(createRequestNFrame(stream.streamId, this.defaultInitialCredits));

    // Create async iterable for incoming messages with flow control
    const requests = this.createReceiveIterable(stream);

    // Call handler
    const responseBytes = await handler(requests, context);

    // Send response
    await stream.sendFlow.acquire(stream.signal);
    const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), responseBytes);
    this.transport.send(msgFrame);

    // Close stream
    this.transport.send(createCloseFrame(stream.streamId));
    stream.setState(StreamState.CLOSED);
  }

  private async handleBidiStream(
    stream: Stream,
    handler: BidiStreamHandler,
    context: CallContext,
  ): Promise<void> {
    // Send initial REQUEST_N to allow client to send
    this.transport.send(createRequestNFrame(stream.streamId, this.defaultInitialCredits));

    // Create async iterable for incoming messages
    const requests = this.createReceiveIterable(stream);

    // Call handler to get response stream
    const responses = handler(requests, context);

    // Send response messages with flow control
    for await (const responseBytes of responses) {
      if (stream.state === StreamState.CANCELLED) return;
      await stream.sendFlow.acquire(stream.signal);
      const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), responseBytes);
      this.transport.send(msgFrame);
    }

    // Send HALF_CLOSE from server side
    this.transport.send(createHalfCloseFrame(stream.streamId));

    // Close stream
    this.transport.send(createCloseFrame(stream.streamId));
    stream.setState(StreamState.CLOSED);
  }

  /** Create an async iterable that yields messages with flow control replenishment. */
  private createReceiveIterable(stream: Stream): AsyncIterable<Uint8Array> {
    const transport = this.transport;

    return {
      [Symbol.asyncIterator]() {
        const gen = stream.messages();
        return {
          async next() {
            const result = await gen.next();
            if (!result.done) {
              // Replenish credits
              const additionalCredits = stream.receiveFlow.onMessageReceived();
              if (additionalCredits > 0) {
                transport.send(createRequestNFrame(stream.streamId, additionalCredits));
              }
            }
            return result;
          },
          async return(value?: unknown) {
            await gen.return(undefined);
            return { done: true as const, value: value as Uint8Array };
          },
          async throw(err?: unknown) {
            return gen.throw(err);
          },
        };
      },
    };
  }

  // --- Helpers ---

  private sendError(
    streamId: number,
    code: RpcStatusCode,
    message: string,
    details?: Uint8Array,
  ): void {
    try {
      if (this.transport.isOpen) {
        this.transport.send(createErrorFrame(streamId, code, message, details));
      }
    } catch {
      // Best effort
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
}
