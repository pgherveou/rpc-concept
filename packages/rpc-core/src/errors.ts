/**
 * RPC error codes, modeled after gRPC status codes for familiarity.
 * Only a subset is used; the numeric values match gRPC where applicable.
 */
export enum RpcStatusCode {
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16,
}

/**
 * Structured RPC error with code, message, and optional details.
 */
export class RpcError extends Error {
  public readonly code: RpcStatusCode;
  public readonly details?: Uint8Array;
  public readonly metadata: Record<string, string>;

  constructor(
    code: RpcStatusCode,
    message: string,
    details?: Uint8Array,
    metadata?: Record<string, string>,
  ) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.details = details;
    this.metadata = metadata ?? {};
    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, RpcError.prototype);
  }

  /** Human-readable status code name */
  get codeName(): string {
    return RpcStatusCode[this.code] ?? `UNKNOWN(${this.code})`;
  }

  toString(): string {
    return `RpcError: [${this.codeName}] ${this.message}`;
  }

  /** Create from an error frame's fields */
  static fromFrame(errorCode: number, errorMessage: string, errorDetails?: Uint8Array): RpcError {
    const code = errorCode in RpcStatusCode ? errorCode as RpcStatusCode : RpcStatusCode.UNKNOWN;
    return new RpcError(code, errorMessage, errorDetails);
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
