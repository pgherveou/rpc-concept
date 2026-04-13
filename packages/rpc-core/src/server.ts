/**
 * Server-side RPC runtime.
 *
 * RpcServer dispatches incoming RPC calls to registered service handlers.
 * It manages server-side stream lifecycle and error handling.
 *
 * Generated dispatcher code registers with RpcServer to handle specific services.
 */

import {
  type RpcFrame,
  isOpenFrame,
  isMessageFrame,
  isHalfCloseFrame,
  isCancelFrame,
  isErrorFrame,
  createMessageFrame,
  createHalfCloseFrame,
  createCloseFrame,
  createErrorFrame,
} from './frame.js';
import type { Transport } from './transport.js';
import { Stream, StreamManager, StreamState } from './stream.js';
import { RpcError, RpcStatusCode } from './errors.js';
import { MethodType, type CallContext, type Logger, silentLogger } from './types.js';

/** Handler function types for different RPC patterns. */
export type UnaryHandler = (
  request: unknown,
  context: CallContext,
) => Promise<unknown>;

export type ServerStreamHandler = (
  request: unknown,
  context: CallContext,
) => AsyncIterable<unknown>;

export type ClientStreamHandler = (
  requests: AsyncIterable<unknown>,
  context: CallContext,
) => Promise<unknown>;

export type BidiStreamHandler = (
  requests: AsyncIterable<unknown>,
  context: CallContext,
) => AsyncIterable<unknown>;

export type MethodHandler =
  | { type: MethodType.UNARY; handler: UnaryHandler }
  | { type: MethodType.SERVER_STREAMING; handler: ServerStreamHandler }
  | { type: MethodType.CLIENT_STREAMING; handler: ClientStreamHandler }
  | { type: MethodType.BIDI_STREAMING; handler: BidiStreamHandler };

/** Service registration with all its method handlers. */
export interface ServiceRegistration {
  name: string;
  methods: Record<string, MethodHandler>;
}

export interface RpcServerOptions {
  transport: Transport;
  logger?: Logger;
}

export class RpcServer {
  private readonly transport: Transport;
  private readonly streams: StreamManager;
  private readonly logger: Logger;
  private readonly services = new Map<string, ServiceRegistration>();
  private closed = false;

  constructor(options: RpcServerOptions) {
    this.transport = options.transport;
    this.logger = options.logger ?? silentLogger;
    this.streams = new StreamManager(false);

    this.transport.onFrame((frame) => this.handleFrame(frame));
    this.transport.onError((err) => this.handleTransportError(err));
    this.transport.onClose(() => this.handleTransportClose());
  }

  registerService(service: ServiceRegistration): void {
    this.services.set(service.name, service);
    this.logger.info(`Registered service: ${service.name} (${Object.keys(service.methods).length} methods)`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.streams.cancelAll('Server closed');
    this.transport.close();
  }

  private handleFrame(frame: RpcFrame): void {
    if (isOpenFrame(frame)) {
      this.handleOpen(frame.streamId, frame.open.method);
      return;
    }

    const stream = this.streams.getStream(frame.streamId);
    if (!stream) {
      this.logger.warn(`Received frame for unknown stream ${frame.streamId}`);
      return;
    }

    if (isMessageFrame(frame)) {
      stream.pushMessage(frame.message.payload);
    } else if (isHalfCloseFrame(frame)) {
      if (stream.state === StreamState.HALF_CLOSED_LOCAL) {
        stream.setState(StreamState.HALF_CLOSED_BOTH);
      } else {
        stream.setState(StreamState.HALF_CLOSED_REMOTE);
      }
      stream.pushEnd();
    } else if (isCancelFrame(frame)) {
      this.logger.debug(`Stream ${frame.streamId} cancelled by client`);
      stream.cancel('Cancelled by client');
      this.streams.removeStream(frame.streamId);
    } else if (isErrorFrame(frame)) {
      stream.pushError(
        RpcError.fromFrame(frame.error.errorCode, frame.error.errorMessage),
      );
      this.streams.removeStream(frame.streamId);
    } else {
      this.logger.debug(`Ignoring unknown frame on stream ${frame.streamId}`);
    }
  }

  private handleOpen(streamId: number, method: string): void {

    const slashIdx = method.lastIndexOf('/');
    if (slashIdx < 0) {
      this.sendError(streamId, RpcStatusCode.INVALID_ARGUMENT, `Invalid method format: ${method}`);
      return;
    }

    const serviceName = method.substring(0, slashIdx);
    const methodName = method.substring(slashIdx + 1);

    const service = this.services.get(serviceName);
    if (!service) {
      this.sendError(streamId, RpcStatusCode.UNIMPLEMENTED, `Unknown service: ${serviceName}`);
      return;
    }

    const methodHandler = service.methods[methodName];
    if (!methodHandler) {
      this.sendError(streamId, RpcStatusCode.UNIMPLEMENTED, `Unknown method: ${method}`);
      return;
    }

    if (this.streams.getStream(streamId)) {
      this.sendError(streamId, RpcStatusCode.INTERNAL, `Duplicate stream ID: ${streamId}`);
      return;
    }

    const stream = new Stream(streamId);
    stream.open();
    this.streams.registerStream(stream);

    const context: CallContext = {
      signal: stream.signal,
      streamId,
      method,
    };

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
        this.sendError(streamId, err.code, err.message);
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
    const request = await stream.collectUnary();
    const response = await handler(request, context);

    this.transport.send(createMessageFrame(stream.streamId, response));
    this.transport.send(createCloseFrame(stream.streamId));
    stream.setState(StreamState.CLOSED);
  }

  private async handleServerStream(
    stream: Stream,
    handler: ServerStreamHandler,
    context: CallContext,
  ): Promise<void> {
    const request = await stream.collectUnary();
    const responses = handler(request, context);

    for await (const response of responses) {
      if (stream.state === StreamState.CANCELLED) return;
      this.transport.send(createMessageFrame(stream.streamId, response));
    }

    if (stream.state !== StreamState.CANCELLED && stream.state !== StreamState.ERROR) {
      this.transport.send(createCloseFrame(stream.streamId));
      stream.setState(StreamState.CLOSED);
    }
  }

  private async handleClientStream(
    stream: Stream,
    handler: ClientStreamHandler,
    context: CallContext,
  ): Promise<void> {
    const requests = this.createReceiveIterable(stream);
    const response = await handler(requests, context);

    if (stream.state !== StreamState.CANCELLED && stream.state !== StreamState.ERROR) {
      this.transport.send(createMessageFrame(stream.streamId, response));
      this.transport.send(createCloseFrame(stream.streamId));
      stream.setState(StreamState.CLOSED);
    }
  }

  private async handleBidiStream(
    stream: Stream,
    handler: BidiStreamHandler,
    context: CallContext,
  ): Promise<void> {
    const requests = this.createReceiveIterable(stream);
    const responses = handler(requests, context);

    for await (const response of responses) {
      if (stream.state === StreamState.CANCELLED) return;
      this.transport.send(createMessageFrame(stream.streamId, response));
    }

    if (stream.state !== StreamState.CANCELLED && stream.state !== StreamState.ERROR) {
      this.transport.send(createHalfCloseFrame(stream.streamId));
      this.transport.send(createCloseFrame(stream.streamId));
      stream.setState(StreamState.CLOSED);
    }
  }

  private createReceiveIterable(stream: Stream): AsyncIterable<unknown> {
    return {
      [Symbol.asyncIterator]() {
        const gen = stream.messages();
        return {
          async next() {
            return gen.next();
          },
          async return(value?: unknown) {
            await gen.return(undefined);
            return { done: true as const, value };
          },
          async throw(err?: unknown) {
            return gen.throw(err);
          },
        };
      },
    };
  }

  private sendError(streamId: number, code: RpcStatusCode, message: string): void {
    try {
      if (this.transport.isOpen) {
        this.transport.send(createErrorFrame(streamId, code, message));
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
