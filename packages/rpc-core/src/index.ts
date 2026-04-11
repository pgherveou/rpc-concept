/**
 * @rpc-bridge/core - Core runtime for the RPC bridge framework.
 *
 * This package provides:
 * - Frame encoding/decoding (protobuf-compatible wire format)
 * - Transport abstraction for platform bridges
 * - Client-side RPC runtime
 * - Server-side RPC runtime and dispatcher
 * - Stream lifecycle management
 * - Credit-based flow control (backpressure)
 * - Protocol version negotiation
 * - Structured error handling
 */

// Frame types and encoding
export {
  FrameType,
  FrameFlags,
  type RpcFrame,
  encodeFrame,
  decodeFrame,
  createHandshakeFrame,
  createOpenFrame,
  createMessageFrame,
  createHalfCloseFrame,
  createCloseFrame,
  createCancelFrame,
  createErrorFrame,
  createRequestNFrame,
  ProtoWriter,
  ProtoReader,
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
  uint8ArrayToBase64,
  base64ToUint8Array,
} from './transport.js';

// Stream management
export {
  StreamState,
  Stream,
  StreamManager,
} from './stream.js';

// Flow control
export {
  DEFAULT_INITIAL_CREDITS,
  DEFAULT_REPLENISH_CREDITS,
  LOW_WATERMARK_RATIO,
  SendFlowController,
  ReceiveFlowController,
} from './flow-control.js';

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

// Handshake
export {
  CURRENT_PROTOCOL_VERSION,
  TS_IMPLEMENTATION_ID,
  Capabilities,
  DEFAULT_CAPABILITIES,
  performHandshake,
  acceptHandshake,
  type HandshakeResult,
} from './handshake.js';

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
  type Metadata,
  type CallOptions,
  type CallContext,
  type MethodDescriptor,
  type ServiceDescriptor,
  type Logger,
  silentLogger,
  createConsoleLogger,
} from './types.js';
