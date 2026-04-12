/**
 * @rpc-bridge/core - Core runtime for the RPC bridge framework.
 *
 * This package provides:
 * - Frame types and JSON serialization
 * - Transport abstraction for platform bridges
 * - Client-side RPC runtime
 * - Server-side RPC runtime and dispatcher
 * - Stream lifecycle management
 * - Structured error handling
 */

// Frame types and serialization
export {
  FrameType,
  type RpcFrame,
  frameToJSON,
  frameFromJSON,
  createOpenFrame,
  createMessageFrame,
  createHalfCloseFrame,
  createCloseFrame,
  createCancelFrame,
  createErrorFrame,
} from './frame.js';

// Transport abstraction
export {
  type Transport,
  type FrameHandler,
  type TransportErrorHandler,
  type TransportCloseHandler,
  FrameEncoding,
  MessageTransportBase,
  createLoopbackTransportPair,
} from './transport.js';

// Stream management
export {
  StreamState,
  Stream,
  StreamManager,
} from './stream.js';

// Client
export {
  RpcClient,
  type RpcClientOptions,
} from './client.js';

// Server
export {
  RpcServer,
  type RpcServerOptions,
  type UnaryHandler,
  type ServerStreamHandler,
  type ClientStreamHandler,
  type BidiStreamHandler,
  type MethodHandler,
  type ServiceRegistration,
} from './server.js';

// Errors
export {
  RpcStatusCode,
  RpcError,
  DeadlineExceededError,
  CancelledError,
} from './errors.js';

// Types
export {
  MethodType,
  type CallOptions,
  type CallContext,
  type MethodDescriptor,
  type ServiceDescriptor,
  type Logger,
  silentLogger,
  createConsoleLogger,
} from './types.js';
