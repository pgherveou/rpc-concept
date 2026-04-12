/**
 * Frame types, encoding, and decoding for the RPC bridge protocol.
 *
 * Simplified for local IPC: no handshake, no sequence numbers, no metadata,
 * no trailers, no extensions. The wire format uses protobuf field-tag encoding
 * for compatibility with native platform parsers (Swift, Kotlin).
 */

import { BinaryWriter, BinaryReader, WireType } from '@bufbuild/protobuf/wire';

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
  payload?: Uint8Array;

  // ERROR
  errorCode?: number;
  errorMessage?: string;
}

// --- Protobuf field numbers (match frame.proto) ---

const FIELD_TYPE = 1;
const FIELD_STREAM_ID = 2;
const FIELD_PAYLOAD = 4;
const FIELD_METHOD = 15;
const FIELD_ERROR_CODE = 20;
const FIELD_ERROR_MESSAGE = 21;

// --- Encoder ---

export function encodeFrame(frame: RpcFrame): Uint8Array {
  const w = new BinaryWriter();

  if (frame.type !== FrameType.UNSPECIFIED) {
    w.tag(FIELD_TYPE, WireType.Varint).uint32(frame.type);
  }
  if (frame.streamId !== 0) {
    w.tag(FIELD_STREAM_ID, WireType.Varint).uint32(frame.streamId);
  }
  if (frame.payload && frame.payload.length > 0) {
    w.tag(FIELD_PAYLOAD, WireType.LengthDelimited).bytes(frame.payload);
  }
  if (frame.method) {
    w.tag(FIELD_METHOD, WireType.LengthDelimited).string(frame.method);
  }
  if (frame.type === FrameType.ERROR && frame.errorCode !== undefined) {
    w.tag(FIELD_ERROR_CODE, WireType.Varint).uint32(frame.errorCode);
  }
  if (frame.errorMessage) {
    w.tag(FIELD_ERROR_MESSAGE, WireType.LengthDelimited).string(frame.errorMessage);
  }

  return w.finish();
}

// --- Decoder ---

export function decodeFrame(data: Uint8Array): RpcFrame {
  const r = new BinaryReader(data);
  const frame: RpcFrame = {
    type: FrameType.UNSPECIFIED,
    streamId: 0,
  };

  while (r.pos < r.len) {
    const [fieldNumber, wireType] = r.tag();

    switch (fieldNumber) {
      case FIELD_TYPE:
        frame.type = r.uint32() as FrameType;
        break;
      case FIELD_STREAM_ID:
        frame.streamId = r.uint32();
        break;
      case FIELD_PAYLOAD:
        frame.payload = r.bytes();
        break;
      case FIELD_METHOD:
        frame.method = r.string();
        break;
      case FIELD_ERROR_CODE:
        frame.errorCode = r.uint32();
        break;
      case FIELD_ERROR_MESSAGE:
        frame.errorMessage = r.string();
        break;
      default:
        r.skip(wireType);
        break;
    }
  }

  return frame;
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
  payload: Uint8Array,
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

