/**
 * RPC error codes. Numeric values match gRPC where applicable.
 * Trimmed to the codes relevant for local IPC.
 */
export enum RpcStatusCode {
  OK = 0,
  CANCELLED = 1,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
}

/**
 * Structured RPC error with code and message.
 */
export class RpcError extends Error {
  public readonly code: RpcStatusCode;
  public readonly details?: unknown;

  constructor(code: RpcStatusCode, message: string, details?: unknown) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    if (details !== undefined) this.details = details;
    Object.setPrototypeOf(this, RpcError.prototype);
  }

  get codeName(): string {
    return RpcStatusCode[this.code] ?? `UNKNOWN(${this.code})`;
  }

  toString(): string {
    return `RpcError: [${this.codeName}] ${this.message}`;
  }

  static fromFrame(errorCode: number, errorMessage: string, details?: unknown): RpcError {
    const code = errorCode in RpcStatusCode ? errorCode as RpcStatusCode : RpcStatusCode.INTERNAL;
    return new RpcError(code, errorMessage, details);
  }
}

/**
 * Typed startup error for streaming RPCs.
 *
 * Throw this from a streaming handler before the first yield to send a typed
 * error to the client via the ERROR frame's `details` field.
 */
export class StartupError<T = unknown> extends RpcError {
  public override readonly details: T;

  constructor(details: T, message = 'Startup error') {
    super(RpcStatusCode.INVALID_ARGUMENT, message);
    this.name = 'StartupError';
    this.details = details;
    Object.setPrototypeOf(this, StartupError.prototype);
  }
}

/**
 * Error thrown when a stream operation times out.
 */
export class DeadlineExceededError extends RpcError {
  constructor(message = 'Deadline exceeded') {
    super(RpcStatusCode.DEADLINE_EXCEEDED, message);
    this.name = 'DeadlineExceededError';
    Object.setPrototypeOf(this, DeadlineExceededError.prototype);
  }
}

/**
 * Error thrown when a stream is cancelled.
 */
export class CancelledError extends RpcError {
  constructor(message = 'Stream cancelled') {
    super(RpcStatusCode.CANCELLED, message);
    this.name = 'CancelledError';
    Object.setPrototypeOf(this, CancelledError.prototype);
  }
}
