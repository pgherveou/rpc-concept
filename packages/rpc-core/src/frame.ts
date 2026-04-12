/**
 * Frame types and serialization for the RPC bridge protocol.
 *
 * Simplified for local IPC: no handshake, no sequence numbers, no metadata,
 * no trailers, no extensions. The wire format uses structured clone (web/Electron)
 * or JSON (iOS/Android). Proto files remain the API contract but no protobuf
 * binary runtime is used.
 */

// --- Frame type enum ---

export enum FrameType {
  UNSPECIFIED = 0,
  OPEN = 2,
  MESSAGE = 3,
  HALF_CLOSE = 4,
  CLOSE = 5,
  CANCEL = 6,
  ERROR = 7,
}

// --- RpcFrame interface ---

export interface RpcFrame {
  type: FrameType;
  streamId: number;

  // OPEN
  method?: string;

  // MESSAGE
  payload?: unknown;

  // ERROR
  errorCode?: number;
  errorMessage?: string;
}

// --- JSON serialization ---

/**
 * Serialize an RpcFrame to a JSON string for iOS/Android bridges.
 * Handles bigint values by converting them to strings.
 */
export function frameToJSON(frame: RpcFrame): string {
  return JSON.stringify(frame, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

/**
 * Parse a JSON string back to an RpcFrame.
 */
export function frameFromJSON(json: string): RpcFrame {
  return JSON.parse(json) as RpcFrame;
}

// --- Helper: create specific frame types ---

export function createOpenFrame(
  streamId: number,
  method: string,
): RpcFrame {
  return {
    type: FrameType.OPEN,
    streamId,
    method,
  };
}

export function createMessageFrame(
  streamId: number,
  payload: unknown,
): RpcFrame {
  return {
    type: FrameType.MESSAGE,
    streamId,
    payload,
  };
}

export function createHalfCloseFrame(streamId: number): RpcFrame {
  return {
    type: FrameType.HALF_CLOSE,
    streamId,
  };
}

export function createCloseFrame(streamId: number): RpcFrame {
  return {
    type: FrameType.CLOSE,
    streamId,
  };
}

export function createCancelFrame(streamId: number): RpcFrame {
  return {
    type: FrameType.CANCEL,
    streamId,
  };
}

export function createErrorFrame(
  streamId: number,
  errorCode: number,
  errorMessage: string,
): RpcFrame {
  return {
    type: FrameType.ERROR,
    streamId,
    errorCode,
    errorMessage,
  };
}
