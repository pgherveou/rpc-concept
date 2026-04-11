/**
 * Frame types, encoding, and decoding for the RPC bridge protocol.
 *
 * The wire format is a custom binary encoding designed to be:
 * - Compact and efficient
 * - Forward-compatible (unknown fields are preserved)
 * - Decodable without a full protobuf runtime (for lightweight clients)
 *
 * Frame binary layout (field-tag based, protobuf-compatible):
 * We use protobuf wire format for the RpcFrame message defined in frame.proto.
 * This module provides a hand-rolled encoder/decoder to avoid requiring
 * a protobuf runtime dependency, while remaining wire-compatible with
 * protobuf-generated parsers on native platforms (Swift, Kotlin).
 */

import { MethodType, type Metadata } from './types.js';

// --- Frame type enum ---

export enum FrameType {
  UNSPECIFIED = 0,
  HANDSHAKE = 1,
  OPEN = 2,
  MESSAGE = 3,
  HALF_CLOSE = 4,
  CLOSE = 5,
  CANCEL = 6,
  ERROR = 7,
  REQUEST_N = 8,
}

// --- Frame flags ---

export const FrameFlags = {
  NONE: 0,
  COMPRESSED_PAYLOAD: 1 << 0,
} as const;

// --- RpcFrame interface ---

export interface RpcFrame {
  type: FrameType;
  streamId: number;
  sequence: number;

  // MESSAGE
  payload?: Uint8Array;

  // Common
  metadata?: Metadata;
  flags?: number;

  // HANDSHAKE
  protocolVersion?: number;
  capabilities?: string[];
  implementationId?: string;

  // OPEN
  method?: string;
  deadlineMs?: number;
  methodType?: MethodType;

  // ERROR
  errorCode?: number;
  errorMessage?: string;
  errorDetails?: Uint8Array;

  // REQUEST_N
  requestN?: number;

  // CLOSE
  trailers?: Metadata;

  // Extensions
  extensions?: Map<string, Uint8Array>;
}

// --- Protobuf wire format constants ---
// Field numbers match frame.proto exactly.

const FIELD_TYPE = 1;          // varint
const FIELD_STREAM_ID = 2;    // varint
const FIELD_SEQUENCE = 3;     // varint
const FIELD_PAYLOAD = 4;      // bytes
const FIELD_METADATA = 5;     // map<string,string> -> repeated message
const FIELD_FLAGS = 6;        // varint
const FIELD_PROTOCOL_VERSION = 10; // varint
const FIELD_CAPABILITIES = 11;    // repeated string
const FIELD_IMPLEMENTATION_ID = 12; // string
const FIELD_METHOD = 15;      // string
const FIELD_DEADLINE_MS = 16; // varint
const FIELD_METHOD_TYPE = 17; // varint
const FIELD_ERROR_CODE = 20;  // varint
const FIELD_ERROR_MESSAGE = 21; // string
const FIELD_ERROR_DETAILS = 22; // bytes
const FIELD_REQUEST_N = 25;   // varint
const FIELD_TRAILERS = 30;    // map<string,string>
const FIELD_EXTENSIONS = 100; // map<string,bytes>

// Protobuf wire types
const WIRE_VARINT = 0;
const WIRE_LENGTH_DELIMITED = 2;

// --- Encoder ---

export function encodeFrame(frame: RpcFrame): Uint8Array {
  const writer = new ProtoWriter();

  if (frame.type !== FrameType.UNSPECIFIED) {
    writer.writeVarintField(FIELD_TYPE, frame.type);
  }
  if (frame.streamId !== 0) {
    writer.writeVarintField(FIELD_STREAM_ID, frame.streamId);
  }
  if (frame.sequence !== 0) {
    writer.writeVarintField(FIELD_SEQUENCE, frame.sequence);
  }
  if (frame.payload && frame.payload.length > 0) {
    writer.writeBytesField(FIELD_PAYLOAD, frame.payload);
  }
  if (frame.metadata) {
    writeStringMap(writer, FIELD_METADATA, frame.metadata);
  }
  if (frame.flags && frame.flags !== 0) {
    writer.writeVarintField(FIELD_FLAGS, frame.flags);
  }
  if (frame.protocolVersion !== undefined && frame.protocolVersion !== 0) {
    writer.writeVarintField(FIELD_PROTOCOL_VERSION, frame.protocolVersion);
  }
  if (frame.capabilities) {
    for (const cap of frame.capabilities) {
      writer.writeStringField(FIELD_CAPABILITIES, cap);
    }
  }
  if (frame.implementationId) {
    writer.writeStringField(FIELD_IMPLEMENTATION_ID, frame.implementationId);
  }
  if (frame.method) {
    writer.writeStringField(FIELD_METHOD, frame.method);
  }
  if (frame.deadlineMs !== undefined && frame.deadlineMs !== 0) {
    writer.writeVarintField(FIELD_DEADLINE_MS, frame.deadlineMs);
  }
  if (frame.methodType !== undefined) {
    writer.writeVarintField(FIELD_METHOD_TYPE, frame.methodType);
  }
  if (frame.type === FrameType.ERROR && frame.errorCode !== undefined) {
    writer.writeVarintField(FIELD_ERROR_CODE, frame.errorCode);
  }
  if (frame.errorMessage) {
    writer.writeStringField(FIELD_ERROR_MESSAGE, frame.errorMessage);
  }
  if (frame.errorDetails && frame.errorDetails.length > 0) {
    writer.writeBytesField(FIELD_ERROR_DETAILS, frame.errorDetails);
  }
  if (frame.requestN !== undefined && frame.requestN !== 0) {
    writer.writeVarintField(FIELD_REQUEST_N, frame.requestN);
  }
  if (frame.trailers) {
    writeStringMap(writer, FIELD_TRAILERS, frame.trailers);
  }
  if (frame.extensions) {
    for (const [key, value] of frame.extensions) {
      writeBytesMapEntry(writer, FIELD_EXTENSIONS, key, value);
    }
  }

  return writer.finish();
}

// --- Decoder ---

export function decodeFrame(data: Uint8Array): RpcFrame {
  const reader = new ProtoReader(data);
  const frame: RpcFrame = {
    type: FrameType.UNSPECIFIED,
    streamId: 0,
    sequence: 0,
  };

  while (reader.hasMore()) {
    const tag = reader.readTag();
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;

    switch (fieldNumber) {
      case FIELD_TYPE:
        frame.type = reader.readVarint() as FrameType;
        break;
      case FIELD_STREAM_ID:
        frame.streamId = reader.readVarint();
        break;
      case FIELD_SEQUENCE:
        frame.sequence = reader.readVarint();
        break;
      case FIELD_PAYLOAD:
        frame.payload = reader.readBytes();
        break;
      case FIELD_METADATA: {
        if (!frame.metadata) frame.metadata = Object.create(null) as Record<string, string>;
        const [k, v] = readStringMapEntry(reader);
        frame.metadata[k] = v;
        break;
      }
      case FIELD_FLAGS:
        frame.flags = reader.readVarint();
        break;
      case FIELD_PROTOCOL_VERSION:
        frame.protocolVersion = reader.readVarint();
        break;
      case FIELD_CAPABILITIES: {
        if (!frame.capabilities) frame.capabilities = [];
        frame.capabilities.push(reader.readString());
        break;
      }
      case FIELD_IMPLEMENTATION_ID:
        frame.implementationId = reader.readString();
        break;
      case FIELD_METHOD:
        frame.method = reader.readString();
        break;
      case FIELD_DEADLINE_MS:
        frame.deadlineMs = reader.readVarint();
        break;
      case FIELD_METHOD_TYPE:
        frame.methodType = reader.readVarint() as MethodType;
        break;
      case FIELD_ERROR_CODE:
        frame.errorCode = reader.readVarint();
        break;
      case FIELD_ERROR_MESSAGE:
        frame.errorMessage = reader.readString();
        break;
      case FIELD_ERROR_DETAILS:
        frame.errorDetails = reader.readBytes();
        break;
      case FIELD_REQUEST_N:
        frame.requestN = reader.readVarint();
        break;
      case FIELD_TRAILERS: {
        if (!frame.trailers) frame.trailers = Object.create(null) as Record<string, string>;
        const [k, v] = readStringMapEntry(reader);
        frame.trailers[k] = v;
        break;
      }
      case FIELD_EXTENSIONS: {
        if (!frame.extensions) frame.extensions = new Map();
        const [k, v] = readBytesMapEntry(reader);
        frame.extensions.set(k, v);
        break;
      }
      default:
        // Unknown field: skip for forward compatibility
        reader.skipField(wireType);
        break;
    }
  }

  return frame;
}

// --- Helper: create specific frame types ---

export function createHandshakeFrame(
  protocolVersion: number,
  capabilities: string[],
  implementationId: string,
): RpcFrame {
  return {
    type: FrameType.HANDSHAKE,
    streamId: 0,
    sequence: 0,
    protocolVersion,
    capabilities,
    implementationId,
  };
}

export function createOpenFrame(
  streamId: number,
  method: string,
  methodType: MethodType,
  metadata?: Metadata,
  deadlineMs?: number,
): RpcFrame {
  return {
    type: FrameType.OPEN,
    streamId,
    sequence: 0,
    method,
    methodType,
    metadata,
    deadlineMs,
  };
}

export function createMessageFrame(
  streamId: number,
  sequence: number,
  payload: Uint8Array,
): RpcFrame {
  return {
    type: FrameType.MESSAGE,
    streamId,
    sequence,
    payload,
  };
}

export function createHalfCloseFrame(streamId: number): RpcFrame {
  return {
    type: FrameType.HALF_CLOSE,
    streamId,
    sequence: 0,
  };
}

export function createCloseFrame(
  streamId: number,
  trailers?: Metadata,
): RpcFrame {
  return {
    type: FrameType.CLOSE,
    streamId,
    sequence: 0,
    trailers,
  };
}

export function createCancelFrame(streamId: number): RpcFrame {
  return {
    type: FrameType.CANCEL,
    streamId,
    sequence: 0,
  };
}

export function createErrorFrame(
  streamId: number,
  errorCode: number,
  errorMessage: string,
  errorDetails?: Uint8Array,
): RpcFrame {
  return {
    type: FrameType.ERROR,
    streamId,
    sequence: 0,
    errorCode,
    errorMessage,
    errorDetails,
  };
}

export function createRequestNFrame(streamId: number, n: number): RpcFrame {
  return {
    type: FrameType.REQUEST_N,
    streamId,
    sequence: 0,
    requestN: n,
  };
}

// --- Protobuf wire format encoder ---

class ProtoWriter {
  private chunks: Uint8Array[] = [];
  private totalLength = 0;

  writeVarintField(fieldNumber: number, value: number): void {
    this.writeTag(fieldNumber, WIRE_VARINT);
    this.writeVarint(value);
  }

  writeBytesField(fieldNumber: number, value: Uint8Array): void {
    this.writeTag(fieldNumber, WIRE_LENGTH_DELIMITED);
    this.writeVarint(value.length);
    this.writeRaw(value);
  }

  writeStringField(fieldNumber: number, value: string): void {
    const encoded = textEncoder.encode(value);
    this.writeBytesField(fieldNumber, encoded);
  }

  writeFixed32Field(fieldNumber: number, value: number): void {
    this.writeTag(fieldNumber, 5);
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value >>> 0, true); // little-endian
    this.writeRaw(buf);
  }

  writeFixed64Field(fieldNumber: number, value: number): void {
    this.writeTag(fieldNumber, 1);
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value >>> 0, true);
    view.setUint32(4, Math.floor(value / 0x100000000) >>> 0, true);
    this.writeRaw(buf);
  }

  writeSint32Field(fieldNumber: number, value: number): void {
    // ZigZag encode
    this.writeVarintField(fieldNumber, (value << 1) ^ (value >> 31));
  }

  writeSint64Field(fieldNumber: number, value: number): void {
    // ZigZag encode (using JS safe integer range)
    const zigzag = value >= 0 ? value * 2 : (-value) * 2 - 1;
    this.writeVarintField(fieldNumber, zigzag);
  }

  writeLengthDelimitedField(fieldNumber: number, value: Uint8Array): void {
    this.writeBytesField(fieldNumber, value);
  }

  writeTag(fieldNumber: number, wireType: number): void {
    this.writeVarint((fieldNumber << 3) | wireType);
  }

  writeVarint(value: number): void {
    // Handle values up to 2^53 safely using JavaScript numbers
    if (value < 0) {
      // Sign-extend int32 to unsigned 64-bit representation (10 bytes)
      this.writeSignedVarint(value);
      return;
    }
    const buf: number[] = [];
    while (value > 0x7f) {
      buf.push((value & 0x7f) | 0x80);
      value = Math.floor(value / 128);
    }
    buf.push(value & 0x7f);
    const bytes = new Uint8Array(buf);
    this.writeRaw(bytes);
  }

  /** Write a signed int32 as a varint (sign-extended to 10 bytes, protobuf convention). */
  writeSignedVarint(value: number): void {
    // Protobuf encodes negative int32 as 10-byte sign-extended varint
    const buf = new Uint8Array(10);
    // Convert to two's complement unsigned representation
    let lo = value >>> 0; // lower 32 bits as unsigned
    let hi = value < 0 ? 0xFFFFFFFF : 0; // upper 32 bits (all 1s for negative)
    for (let i = 0; i < 10; i++) {
      if (i < 4) {
        buf[i] = (lo & 0x7F) | 0x80;
        lo = lo >>> 7;
      } else if (i === 4) {
        // Merge remaining lo bits (4 bits) with start of hi (3 bits)
        buf[i] = ((lo & 0x0F) | ((hi & 0x07) << 4)) | 0x80;
        hi = hi >>> 3;
      } else {
        buf[i] = (hi & 0x7F) | 0x80;
        hi = hi >>> 7;
      }
    }
    // Clear continuation bit on last byte
    buf[9] = buf[9] & 0x7F;
    this.writeRaw(buf);
  }

  writeRaw(data: Uint8Array): void {
    this.chunks.push(data);
    this.totalLength += data.length;
  }

  finish(): Uint8Array {
    const result = new Uint8Array(this.totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

// --- Protobuf wire format decoder ---

class ProtoReader {
  private offset: number;

  constructor(private data: Uint8Array) {
    this.offset = 0;
  }

  hasMore(): boolean {
    return this.offset < this.data.length;
  }

  readTag(): number {
    return this.readVarint();
  }

  readVarint(): number {
    let result = 0;
    let shift = 0;
    while (this.offset < this.data.length) {
      const byte = this.data[this.offset++];
      result += (byte & 0x7f) * Math.pow(2, shift);
      if ((byte & 0x80) === 0) return result;
      shift += 7;
      if (shift > 49) throw new Error('Varint too long');
    }
    throw new Error('Unexpected end of data reading varint');
  }

  readBytes(): Uint8Array {
    const length = this.readVarint();
    if (this.offset + length > this.data.length) {
      throw new Error('Unexpected end of data reading bytes');
    }
    const copy = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return copy;
  }

  readString(): string {
    return textDecoder.decode(this.readBytes());
  }

  readFixed32(): number {
    if (this.offset + 4 > this.data.length) {
      throw new Error('Unexpected end of data reading fixed32');
    }
    const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 4);
    this.offset += 4;
    return view.getUint32(0, true); // little-endian
  }

  readSfixed32(): number {
    if (this.offset + 4 > this.data.length) {
      throw new Error('Unexpected end of data reading sfixed32');
    }
    const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 4);
    this.offset += 4;
    return view.getInt32(0, true); // little-endian, signed
  }

  readFixed64(): number {
    if (this.offset + 8 > this.data.length) {
      throw new Error('Unexpected end of data reading fixed64');
    }
    const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 8);
    this.offset += 8;
    const lo = view.getUint32(0, true);
    const hi = view.getUint32(4, true);
    return hi * 0x100000000 + lo;
  }

  readSfixed64(): number {
    if (this.offset + 8 > this.data.length) {
      throw new Error('Unexpected end of data reading sfixed64');
    }
    const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 8);
    this.offset += 8;
    const lo = view.getUint32(0, true);
    const hi = view.getInt32(4, true);
    return hi * 0x100000000 + lo;
  }

  readFloat(): number {
    if (this.offset + 4 > this.data.length) {
      throw new Error('Unexpected end of data reading float');
    }
    const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 4);
    this.offset += 4;
    return view.getFloat32(0, true); // little-endian
  }

  readDouble(): number {
    if (this.offset + 8 > this.data.length) {
      throw new Error('Unexpected end of data reading double');
    }
    const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 8);
    this.offset += 8;
    return view.getFloat64(0, true); // little-endian
  }

  readSint32(): number {
    const n = this.readVarint();
    return (n >>> 1) ^ -(n & 1);
  }

  readSint64(): number {
    const n = this.readVarint();
    // ZigZag decode for JS safe integers
    return Math.floor(n / 2) * (n % 2 === 0 ? 1 : -1) - (n % 2 === 0 ? 0 : 1);
  }

  skipField(wireType: number): void {
    switch (wireType) {
      case WIRE_VARINT:
        this.readVarint();
        break;
      case 1: // 64-bit
        if (this.offset + 8 > this.data.length) {
          throw new Error('Unexpected end of data skipping 64-bit field');
        }
        this.offset += 8;
        break;
      case WIRE_LENGTH_DELIMITED:
        this.readBytes(); // reads and discards
        break;
      case 5: // 32-bit
        if (this.offset + 4 > this.data.length) {
          throw new Error('Unexpected end of data skipping 32-bit field');
        }
        this.offset += 4;
        break;
      default:
        throw new Error(`Unknown wire type: ${wireType}`);
    }
  }

  /** Read a sub-message from the current position, returning a new reader */
  subReader(): ProtoReader {
    const bytes = this.readBytes();
    return new ProtoReader(bytes);
  }
}

// --- Map encoding/decoding helpers ---

function writeStringMap(writer: ProtoWriter, fieldNumber: number, map: Metadata): void {
  for (const [key, value] of Object.entries(map)) {
    const entryWriter = new ProtoWriter();
    entryWriter.writeStringField(1, key);    // key field = 1
    entryWriter.writeStringField(2, value);  // value field = 2
    writer.writeBytesField(fieldNumber, entryWriter.finish());
  }
}

function readStringMapEntry(reader: ProtoReader): [string, string] {
  const sub = reader.subReader();
  let key = '';
  let value = '';
  while (sub.hasMore()) {
    const tag = sub.readTag();
    const field = tag >>> 3;
    if (field === 1) key = sub.readString();
    else if (field === 2) value = sub.readString();
    else sub.skipField(tag & 0x7);
  }
  return [key, value];
}

function writeBytesMapEntry(
  writer: ProtoWriter,
  fieldNumber: number,
  key: string,
  value: Uint8Array,
): void {
  const entryWriter = new ProtoWriter();
  entryWriter.writeStringField(1, key);
  entryWriter.writeBytesField(2, value);
  writer.writeBytesField(fieldNumber, entryWriter.finish());
}

function readBytesMapEntry(reader: ProtoReader): [string, Uint8Array] {
  const sub = reader.subReader();
  let key = '';
  let value: Uint8Array = new Uint8Array(0);
  while (sub.hasMore()) {
    const tag = sub.readTag();
    const field = tag >>> 3;
    if (field === 1) key = sub.readString();
    else if (field === 2) value = sub.readBytes();
    else sub.skipField(tag & 0x7);
  }
  return [key, value];
}

// --- Shared TextEncoder/TextDecoder ---

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// --- Export ProtoWriter/ProtoReader for use by generated message code ---

export { ProtoWriter, ProtoReader };
