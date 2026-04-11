/**
 * Core types used throughout the RPC bridge framework.
 */

/** Method streaming pattern */
export enum MethodType {
  UNSPECIFIED = 0,
  UNARY = 1,
  SERVER_STREAMING = 2,
  CLIENT_STREAMING = 3,
  BIDI_STREAMING = 4,
}

/** Metadata is a simple string key-value map carried in frames. */
export type Metadata = Record<string, string>;

/** Call options for an individual RPC invocation. */
export interface CallOptions {
  /** Deadline in milliseconds from now. 0 or undefined = no deadline. */
  deadlineMs?: number;
  /** Initial metadata/headers to send with the call. */
  metadata?: Metadata;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Initial flow control credits to grant the server (default: 16). */
  initialCredits?: number;
}

/** Context available to server-side RPC handlers. */
export interface CallContext {
  /** Metadata from the client's OPEN frame. */
  metadata: Metadata;
  /** Deadline timestamp (Date.now()-based), or undefined if none. */
  deadline?: number;
  /** Signal that fires when the stream is cancelled. */
  signal: AbortSignal;
  /** Stream ID for logging/debugging. */
  streamId: number;
  /** Method being called. */
  method: string;
}

/** Describes a single RPC method for dispatch purposes. */
export interface MethodDescriptor {
  /** Fully qualified method name: "package.Service/Method" */
  name: string;
  /** Streaming pattern */
  type: MethodType;
  /** Encode request message to bytes */
  requestEncode: (msg: unknown) => Uint8Array;
  /** Decode request message from bytes */
  requestDecode: (data: Uint8Array) => unknown;
  /** Encode response message to bytes */
  responseEncode: (msg: unknown) => Uint8Array;
  /** Decode response message from bytes */
  responseDecode: (data: Uint8Array) => unknown;
}

/** Service descriptor containing all methods. */
export interface ServiceDescriptor {
  /** Fully qualified service name: "package.ServiceName" */
  name: string;
  /** Methods in this service, keyed by short method name. */
  methods: Record<string, MethodDescriptor>;
}

/** Logger interface for debug output. */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** No-op logger that silences all output. */
export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/** Console-based logger with a prefix. */
export function createConsoleLogger(prefix: string): Logger {
  return {
    debug: (msg, ...args) => console.debug(`[${prefix}] ${msg}`, ...args),
    info: (msg, ...args) => console.info(`[${prefix}] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[${prefix}] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[${prefix}] ${msg}`, ...args),
  };
}
