/**
 * Frame types and serialization for the RPC bridge protocol.
 *
 * RpcFrame is a discriminated union keyed by the body field name,
 * matching the proto3 JSON mapping of the `oneof body` in frame.proto.
 */

// --- Body types ---

export interface OpenBody {
  method: string;
}

export interface MessageBody {
  payload: unknown;
}

export type HalfCloseBody = Record<string, never>;
export type CloseBody = Record<string, never>;
export type CancelBody = Record<string, never>;

export interface ErrorBody {
  errorCode: number;
  errorMessage: string;
}

// --- Discriminated union ---

export type RpcFrame =
  | { streamId: number; open: OpenBody }
  | { streamId: number; message: MessageBody }
  | { streamId: number; halfClose: HalfCloseBody }
  | { streamId: number; close: CloseBody }
  | { streamId: number; cancel: CancelBody }
  | { streamId: number; error: ErrorBody };

// --- Type guards ---

export function isOpenFrame(f: RpcFrame): f is { streamId: number; open: OpenBody } {
  return 'open' in f;
}

export function isMessageFrame(f: RpcFrame): f is { streamId: number; message: MessageBody } {
  return 'message' in f;
}

export function isHalfCloseFrame(f: RpcFrame): f is { streamId: number; halfClose: HalfCloseBody } {
  return 'halfClose' in f;
}

export function isCloseFrame(f: RpcFrame): f is { streamId: number; close: CloseBody } {
  return 'close' in f;
}

export function isCancelFrame(f: RpcFrame): f is { streamId: number; cancel: CancelBody } {
  return 'cancel' in f;
}

export function isErrorFrame(f: RpcFrame): f is { streamId: number; error: ErrorBody } {
  return 'error' in f;
}

/** Return the body type name for logging. */
export function frameType(frame: RpcFrame): string {
  if ('open' in frame) return 'open';
  if ('message' in frame) return 'message';
  if ('halfClose' in frame) return 'halfClose';
  if ('close' in frame) return 'close';
  if ('cancel' in frame) return 'cancel';
  if ('error' in frame) return 'error';
  return 'unknown';
}

// --- Factory functions ---

export function createOpenFrame(streamId: number, method: string): RpcFrame {
  return { streamId, open: { method } };
}

export function createMessageFrame(streamId: number, payload: unknown): RpcFrame {
  return { streamId, message: { payload } };
}

export function createHalfCloseFrame(streamId: number): RpcFrame {
  return { streamId, halfClose: {} };
}

export function createCloseFrame(streamId: number): RpcFrame {
  return { streamId, close: {} };
}

export function createCancelFrame(streamId: number): RpcFrame {
  return { streamId, cancel: {} };
}

export function createErrorFrame(
  streamId: number,
  errorCode: number,
  errorMessage: string,
): RpcFrame {
  return { streamId, error: { errorCode, errorMessage } };
}

// --- JSON serialization ---

export function frameToJSON(frame: RpcFrame): string {
  return JSON.stringify(frame, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

// Body-type validation is intentionally omitted: the protocol's forward-compatibility
// guarantee requires unknown frame types to pass through (see PROTOCOL.md).
// Callers use the type guards above; unknown types hit the default/ignore path.
export function frameFromJSON(json: string): RpcFrame {
  return JSON.parse(json);
}
