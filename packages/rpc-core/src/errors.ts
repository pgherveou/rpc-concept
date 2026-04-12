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

  constructor(code: RpcStatusCode, message: string) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    Object.setPrototypeOf(this, RpcError.prototype);
  }

  get codeName(): string {
    return RpcStatusCode[this.code] ?? `UNKNOWN(${this.code})`;
  }

  toString(): string {
    return `RpcError: [${this.codeName}] ${this.message}`;
  }

  static fromFrame(errorCode: number, errorMessage: string): RpcError {
    const code = errorCode in RpcStatusCode ? errorCode as RpcStatusCode : RpcStatusCode.INTERNAL;
    return new RpcError(code, errorMessage);
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
