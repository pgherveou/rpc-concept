/**
 * Core types used throughout the RPC bridge framework.
 */

/** Method streaming pattern, used for server-side dispatch. */
export enum MethodType {
  UNSPECIFIED = 0,
  UNARY = 1,
  SERVER_STREAMING = 2,
  CLIENT_STREAMING = 3,
  BIDI_STREAMING = 4,
}

/** Call options for an individual RPC invocation. */
export interface CallOptions {
  /** Deadline in milliseconds from now. 0 or undefined = no deadline. */
  deadlineMs?: number;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/** Context available to server-side RPC handlers. */
export interface CallContext {
  /** Signal that fires when the stream is cancelled. */
  signal: AbortSignal;
  /** Stream ID for logging/debugging. */
  streamId: number;
  /** Method being called. */
  method: string;
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
