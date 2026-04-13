"use strict";
(() => {
  // ../../packages/rpc-core/dist/frame.js
  var FrameType;
  (function(FrameType2) {
    FrameType2[FrameType2["UNSPECIFIED"] = 0] = "UNSPECIFIED";
    FrameType2[FrameType2["HANDSHAKE"] = 1] = "HANDSHAKE";
    FrameType2[FrameType2["OPEN"] = 2] = "OPEN";
    FrameType2[FrameType2["MESSAGE"] = 3] = "MESSAGE";
    FrameType2[FrameType2["HALF_CLOSE"] = 4] = "HALF_CLOSE";
    FrameType2[FrameType2["CLOSE"] = 5] = "CLOSE";
    FrameType2[FrameType2["CANCEL"] = 6] = "CANCEL";
    FrameType2[FrameType2["ERROR"] = 7] = "ERROR";
    FrameType2[FrameType2["REQUEST_N"] = 8] = "REQUEST_N";
  })(FrameType || (FrameType = {}));
  var FrameFlags = {
    NONE: 0,
    COMPRESSED_PAYLOAD: 1 << 0
  };
  var FIELD_TYPE = 1;
  var FIELD_STREAM_ID = 2;
  var FIELD_SEQUENCE = 3;
  var FIELD_PAYLOAD = 4;
  var FIELD_METADATA = 5;
  var FIELD_FLAGS = 6;
  var FIELD_PROTOCOL_VERSION = 10;
  var FIELD_CAPABILITIES = 11;
  var FIELD_IMPLEMENTATION_ID = 12;
  var FIELD_METHOD = 15;
  var FIELD_DEADLINE_MS = 16;
  var FIELD_METHOD_TYPE = 17;
  var FIELD_ERROR_CODE = 20;
  var FIELD_ERROR_MESSAGE = 21;
  var FIELD_ERROR_DETAILS = 22;
  var FIELD_REQUEST_N = 25;
  var FIELD_TRAILERS = 30;
  var FIELD_EXTENSIONS = 100;
  var WIRE_VARINT = 0;
  var WIRE_LENGTH_DELIMITED = 2;
  function encodeFrame(frame) {
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
    if (frame.protocolVersion !== void 0 && frame.protocolVersion !== 0) {
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
    if (frame.deadlineMs !== void 0 && frame.deadlineMs !== 0) {
      writer.writeVarintField(FIELD_DEADLINE_MS, frame.deadlineMs);
    }
    if (frame.methodType !== void 0) {
      writer.writeVarintField(FIELD_METHOD_TYPE, frame.methodType);
    }
    if (frame.type === FrameType.ERROR && frame.errorCode !== void 0) {
      writer.writeVarintField(FIELD_ERROR_CODE, frame.errorCode);
    }
    if (frame.errorMessage) {
      writer.writeStringField(FIELD_ERROR_MESSAGE, frame.errorMessage);
    }
    if (frame.errorDetails && frame.errorDetails.length > 0) {
      writer.writeBytesField(FIELD_ERROR_DETAILS, frame.errorDetails);
    }
    if (frame.requestN !== void 0 && frame.requestN !== 0) {
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
  function decodeFrame(data) {
    const reader = new ProtoReader(data);
    const frame = {
      type: FrameType.UNSPECIFIED,
      streamId: 0,
      sequence: 0
    };
    while (reader.hasMore()) {
      const tag = reader.readTag();
      const fieldNumber = tag >>> 3;
      const wireType = tag & 7;
      switch (fieldNumber) {
        case FIELD_TYPE:
          frame.type = reader.readVarint();
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
          if (!frame.metadata)
            frame.metadata = /* @__PURE__ */ Object.create(null);
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
          if (!frame.capabilities)
            frame.capabilities = [];
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
          frame.methodType = reader.readVarint();
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
          if (!frame.trailers)
            frame.trailers = /* @__PURE__ */ Object.create(null);
          const [k, v] = readStringMapEntry(reader);
          frame.trailers[k] = v;
          break;
        }
        case FIELD_EXTENSIONS: {
          if (!frame.extensions)
            frame.extensions = /* @__PURE__ */ new Map();
          const [k, v] = readBytesMapEntry(reader);
          frame.extensions.set(k, v);
          break;
        }
        default:
          reader.skipField(wireType);
          break;
      }
    }
    return frame;
  }
  function createHandshakeFrame(protocolVersion, capabilities, implementationId) {
    return {
      type: FrameType.HANDSHAKE,
      streamId: 0,
      sequence: 0,
      protocolVersion,
      capabilities,
      implementationId
    };
  }
  function createOpenFrame(streamId, method, methodType, metadata, deadlineMs) {
    return {
      type: FrameType.OPEN,
      streamId,
      sequence: 0,
      method,
      methodType,
      metadata,
      deadlineMs
    };
  }
  function createMessageFrame(streamId, sequence, payload) {
    return {
      type: FrameType.MESSAGE,
      streamId,
      sequence,
      payload
    };
  }
  function createHalfCloseFrame(streamId) {
    return {
      type: FrameType.HALF_CLOSE,
      streamId,
      sequence: 0
    };
  }
  function createCancelFrame(streamId) {
    return {
      type: FrameType.CANCEL,
      streamId,
      sequence: 0
    };
  }
  function createRequestNFrame(streamId, n) {
    return {
      type: FrameType.REQUEST_N,
      streamId,
      sequence: 0,
      requestN: n
    };
  }
  var ProtoWriter = class {
    chunks = [];
    totalLength = 0;
    writeVarintField(fieldNumber, value) {
      this.writeTag(fieldNumber, WIRE_VARINT);
      this.writeVarint(value);
    }
    writeBytesField(fieldNumber, value) {
      this.writeTag(fieldNumber, WIRE_LENGTH_DELIMITED);
      this.writeVarint(value.length);
      this.writeRaw(value);
    }
    writeStringField(fieldNumber, value) {
      const encoded = textEncoder.encode(value);
      this.writeBytesField(fieldNumber, encoded);
    }
    writeFixed32Field(fieldNumber, value) {
      this.writeTag(fieldNumber, 5);
      const buf = new Uint8Array(4);
      const view = new DataView(buf.buffer);
      view.setUint32(0, value >>> 0, true);
      this.writeRaw(buf);
    }
    writeFixed64Field(fieldNumber, value) {
      this.writeTag(fieldNumber, 1);
      const buf = new Uint8Array(8);
      const view = new DataView(buf.buffer);
      view.setUint32(0, value >>> 0, true);
      view.setUint32(4, Math.floor(value / 4294967296) >>> 0, true);
      this.writeRaw(buf);
    }
    writeSint32Field(fieldNumber, value) {
      this.writeVarintField(fieldNumber, value << 1 ^ value >> 31);
    }
    writeSint64Field(fieldNumber, value) {
      const zigzag = value >= 0 ? value * 2 : -value * 2 - 1;
      this.writeVarintField(fieldNumber, zigzag);
    }
    writeLengthDelimitedField(fieldNumber, value) {
      this.writeBytesField(fieldNumber, value);
    }
    writeTag(fieldNumber, wireType) {
      this.writeVarint(fieldNumber << 3 | wireType);
    }
    writeVarint(value) {
      if (value < 0) {
        this.writeSignedVarint(value);
        return;
      }
      const buf = [];
      while (value > 127) {
        buf.push(value & 127 | 128);
        value = Math.floor(value / 128);
      }
      buf.push(value & 127);
      const bytes = new Uint8Array(buf);
      this.writeRaw(bytes);
    }
    /** Write a signed int32 as a varint (sign-extended to 10 bytes, protobuf convention). */
    writeSignedVarint(value) {
      const buf = new Uint8Array(10);
      let lo = value >>> 0;
      let hi = value < 0 ? 4294967295 : 0;
      for (let i = 0; i < 10; i++) {
        if (i < 4) {
          buf[i] = lo & 127 | 128;
          lo = lo >>> 7;
        } else if (i === 4) {
          buf[i] = lo & 15 | (hi & 7) << 4 | 128;
          hi = hi >>> 3;
        } else {
          buf[i] = hi & 127 | 128;
          hi = hi >>> 7;
        }
      }
      buf[9] = buf[9] & 127;
      this.writeRaw(buf);
    }
    writeRaw(data) {
      this.chunks.push(data);
      this.totalLength += data.length;
    }
    finish() {
      const result = new Uint8Array(this.totalLength);
      let offset = 0;
      for (const chunk of this.chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    }
  };
  var ProtoReader = class _ProtoReader {
    data;
    offset;
    constructor(data) {
      this.data = data;
      this.offset = 0;
    }
    hasMore() {
      return this.offset < this.data.length;
    }
    readTag() {
      return this.readVarint();
    }
    readVarint() {
      let result = 0;
      let shift = 0;
      while (this.offset < this.data.length) {
        const byte = this.data[this.offset++];
        result += (byte & 127) * Math.pow(2, shift);
        if ((byte & 128) === 0)
          return result;
        shift += 7;
        if (shift > 49)
          throw new Error("Varint too long");
      }
      throw new Error("Unexpected end of data reading varint");
    }
    readBytes() {
      const length = this.readVarint();
      if (this.offset + length > this.data.length) {
        throw new Error("Unexpected end of data reading bytes");
      }
      const copy = this.data.slice(this.offset, this.offset + length);
      this.offset += length;
      return copy;
    }
    readString() {
      return textDecoder.decode(this.readBytes());
    }
    readFixed32() {
      if (this.offset + 4 > this.data.length) {
        throw new Error("Unexpected end of data reading fixed32");
      }
      const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 4);
      this.offset += 4;
      return view.getUint32(0, true);
    }
    readSfixed32() {
      if (this.offset + 4 > this.data.length) {
        throw new Error("Unexpected end of data reading sfixed32");
      }
      const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 4);
      this.offset += 4;
      return view.getInt32(0, true);
    }
    readFixed64() {
      if (this.offset + 8 > this.data.length) {
        throw new Error("Unexpected end of data reading fixed64");
      }
      const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 8);
      this.offset += 8;
      const lo = view.getUint32(0, true);
      const hi = view.getUint32(4, true);
      return hi * 4294967296 + lo;
    }
    readSfixed64() {
      if (this.offset + 8 > this.data.length) {
        throw new Error("Unexpected end of data reading sfixed64");
      }
      const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 8);
      this.offset += 8;
      const lo = view.getUint32(0, true);
      const hi = view.getInt32(4, true);
      return hi * 4294967296 + lo;
    }
    readFloat() {
      if (this.offset + 4 > this.data.length) {
        throw new Error("Unexpected end of data reading float");
      }
      const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 4);
      this.offset += 4;
      return view.getFloat32(0, true);
    }
    readDouble() {
      if (this.offset + 8 > this.data.length) {
        throw new Error("Unexpected end of data reading double");
      }
      const view = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 8);
      this.offset += 8;
      return view.getFloat64(0, true);
    }
    readSint32() {
      const n = this.readVarint();
      return n >>> 1 ^ -(n & 1);
    }
    readSint64() {
      const n = this.readVarint();
      return Math.floor(n / 2) * (n % 2 === 0 ? 1 : -1) - (n % 2 === 0 ? 0 : 1);
    }
    skipField(wireType) {
      switch (wireType) {
        case WIRE_VARINT:
          this.readVarint();
          break;
        case 1:
          if (this.offset + 8 > this.data.length) {
            throw new Error("Unexpected end of data skipping 64-bit field");
          }
          this.offset += 8;
          break;
        case WIRE_LENGTH_DELIMITED:
          this.readBytes();
          break;
        case 5:
          if (this.offset + 4 > this.data.length) {
            throw new Error("Unexpected end of data skipping 32-bit field");
          }
          this.offset += 4;
          break;
        default:
          throw new Error(`Unknown wire type: ${wireType}`);
      }
    }
    /** Read a sub-message from the current position, returning a new reader */
    subReader() {
      const bytes = this.readBytes();
      return new _ProtoReader(bytes);
    }
  };
  function writeStringMap(writer, fieldNumber, map) {
    for (const [key, value] of Object.entries(map)) {
      const entryWriter = new ProtoWriter();
      entryWriter.writeStringField(1, key);
      entryWriter.writeStringField(2, value);
      writer.writeBytesField(fieldNumber, entryWriter.finish());
    }
  }
  function readStringMapEntry(reader) {
    const sub = reader.subReader();
    let key = "";
    let value = "";
    while (sub.hasMore()) {
      const tag = sub.readTag();
      const field = tag >>> 3;
      if (field === 1)
        key = sub.readString();
      else if (field === 2)
        value = sub.readString();
      else
        sub.skipField(tag & 7);
    }
    return [key, value];
  }
  function writeBytesMapEntry(writer, fieldNumber, key, value) {
    const entryWriter = new ProtoWriter();
    entryWriter.writeStringField(1, key);
    entryWriter.writeBytesField(2, value);
    writer.writeBytesField(fieldNumber, entryWriter.finish());
  }
  function readBytesMapEntry(reader) {
    const sub = reader.subReader();
    let key = "";
    let value = new Uint8Array(0);
    while (sub.hasMore()) {
      const tag = sub.readTag();
      const field = tag >>> 3;
      if (field === 1)
        key = sub.readString();
      else if (field === 2)
        value = sub.readBytes();
      else
        sub.skipField(tag & 7);
    }
    return [key, value];
  }
  var textEncoder = new TextEncoder();
  var textDecoder = new TextDecoder();

  // ../../packages/rpc-core/dist/types.js
  var MethodType;
  (function(MethodType2) {
    MethodType2[MethodType2["UNSPECIFIED"] = 0] = "UNSPECIFIED";
    MethodType2[MethodType2["UNARY"] = 1] = "UNARY";
    MethodType2[MethodType2["SERVER_STREAMING"] = 2] = "SERVER_STREAMING";
    MethodType2[MethodType2["CLIENT_STREAMING"] = 3] = "CLIENT_STREAMING";
    MethodType2[MethodType2["BIDI_STREAMING"] = 4] = "BIDI_STREAMING";
  })(MethodType || (MethodType = {}));
  var silentLogger = {
    debug() {
    },
    info() {
    },
    warn() {
    },
    error() {
    }
  };
  function createConsoleLogger(prefix) {
    return {
      debug: (msg, ...args) => console.debug(`[${prefix}] ${msg}`, ...args),
      info: (msg, ...args) => console.info(`[${prefix}] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[${prefix}] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[${prefix}] ${msg}`, ...args)
    };
  }

  // ../../packages/rpc-core/dist/transport.js
  var FrameEncoding;
  (function(FrameEncoding2) {
    FrameEncoding2["BINARY"] = "binary";
    FrameEncoding2["BASE64"] = "base64";
  })(FrameEncoding || (FrameEncoding = {}));
  var MessageTransportBase = class {
    encoding;
    frameHandlers = [];
    errorHandlers = [];
    closeHandlers = [];
    logger;
    _isOpen = true;
    constructor(encoding = FrameEncoding.BINARY, logger2) {
      this.encoding = encoding;
      this.logger = logger2 ?? silentLogger;
    }
    get isOpen() {
      return this._isOpen;
    }
    send(frame) {
      if (!this._isOpen) {
        throw new Error("Transport is closed");
      }
      const encoded = encodeFrame(frame);
      this.logger.debug(`TX frame type=${frame.type} stream=${frame.streamId} seq=${frame.sequence} (${encoded.length} bytes)`);
      if (this.encoding === FrameEncoding.BASE64) {
        this.sendRaw(uint8ArrayToBase64(encoded));
      } else {
        this.sendRaw(encoded);
      }
    }
    /** Call this from subclass when raw data arrives from the peer. */
    handleRawMessage(data) {
      try {
        let bytes;
        if (typeof data === "string") {
          bytes = base64ToUint8Array(data);
        } else if (data instanceof ArrayBuffer) {
          bytes = new Uint8Array(data);
        } else {
          bytes = data;
        }
        const frame = decodeFrame(bytes);
        this.logger.debug(`RX frame type=${frame.type} stream=${frame.streamId} seq=${frame.sequence} (${bytes.length} bytes)`);
        const handlers = [...this.frameHandlers];
        for (const handler of handlers) {
          try {
            handler(frame);
          } catch (err) {
            this.logger.error("Frame handler error:", err);
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error("Failed to decode frame:", error);
        this.emitError(error);
      }
    }
    onFrame(handler) {
      this.frameHandlers.push(handler);
      return () => {
        const idx = this.frameHandlers.indexOf(handler);
        if (idx >= 0)
          this.frameHandlers.splice(idx, 1);
      };
    }
    onError(handler) {
      this.errorHandlers.push(handler);
    }
    onClose(handler) {
      this.closeHandlers.push(handler);
    }
    close() {
      if (!this._isOpen)
        return;
      this._isOpen = false;
      this.logger.info("Transport closed");
      for (const handler of this.closeHandlers) {
        try {
          handler();
        } catch (err) {
          this.logger.error("Close handler error:", err);
        }
      }
      this.frameHandlers = [];
      this.errorHandlers = [];
      this.closeHandlers = [];
    }
    emitError(error) {
      for (const handler of this.errorHandlers) {
        try {
          handler(error);
        } catch (err) {
          this.logger.error("Error handler threw:", err);
        }
      }
    }
  };
  function uint8ArrayToBase64(bytes) {
    if (typeof btoa === "function") {
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
    return Buffer.from(bytes).toString("base64");
  }
  function base64ToUint8Array(base64) {
    if (typeof atob === "function") {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  // ../../packages/rpc-core/dist/errors.js
  var RpcStatusCode;
  (function(RpcStatusCode2) {
    RpcStatusCode2[RpcStatusCode2["OK"] = 0] = "OK";
    RpcStatusCode2[RpcStatusCode2["CANCELLED"] = 1] = "CANCELLED";
    RpcStatusCode2[RpcStatusCode2["UNKNOWN"] = 2] = "UNKNOWN";
    RpcStatusCode2[RpcStatusCode2["INVALID_ARGUMENT"] = 3] = "INVALID_ARGUMENT";
    RpcStatusCode2[RpcStatusCode2["DEADLINE_EXCEEDED"] = 4] = "DEADLINE_EXCEEDED";
    RpcStatusCode2[RpcStatusCode2["NOT_FOUND"] = 5] = "NOT_FOUND";
    RpcStatusCode2[RpcStatusCode2["ALREADY_EXISTS"] = 6] = "ALREADY_EXISTS";
    RpcStatusCode2[RpcStatusCode2["PERMISSION_DENIED"] = 7] = "PERMISSION_DENIED";
    RpcStatusCode2[RpcStatusCode2["RESOURCE_EXHAUSTED"] = 8] = "RESOURCE_EXHAUSTED";
    RpcStatusCode2[RpcStatusCode2["FAILED_PRECONDITION"] = 9] = "FAILED_PRECONDITION";
    RpcStatusCode2[RpcStatusCode2["ABORTED"] = 10] = "ABORTED";
    RpcStatusCode2[RpcStatusCode2["OUT_OF_RANGE"] = 11] = "OUT_OF_RANGE";
    RpcStatusCode2[RpcStatusCode2["UNIMPLEMENTED"] = 12] = "UNIMPLEMENTED";
    RpcStatusCode2[RpcStatusCode2["INTERNAL"] = 13] = "INTERNAL";
    RpcStatusCode2[RpcStatusCode2["UNAVAILABLE"] = 14] = "UNAVAILABLE";
    RpcStatusCode2[RpcStatusCode2["DATA_LOSS"] = 15] = "DATA_LOSS";
    RpcStatusCode2[RpcStatusCode2["UNAUTHENTICATED"] = 16] = "UNAUTHENTICATED";
  })(RpcStatusCode || (RpcStatusCode = {}));
  var RpcError = class _RpcError extends Error {
    code;
    details;
    metadata;
    constructor(code, message, details, metadata) {
      super(message);
      this.name = "RpcError";
      this.code = code;
      this.details = details;
      this.metadata = metadata ?? {};
      Object.setPrototypeOf(this, _RpcError.prototype);
    }
    /** Human-readable status code name */
    get codeName() {
      return RpcStatusCode[this.code] ?? `UNKNOWN(${this.code})`;
    }
    toString() {
      return `RpcError: [${this.codeName}] ${this.message}`;
    }
    /** Create from an error frame's fields */
    static fromFrame(errorCode, errorMessage, errorDetails) {
      const code = errorCode in RpcStatusCode ? errorCode : RpcStatusCode.UNKNOWN;
      return new _RpcError(code, errorMessage, errorDetails);
    }
  };
  var DeadlineExceededError = class _DeadlineExceededError extends RpcError {
    constructor(message = "Deadline exceeded") {
      super(RpcStatusCode.DEADLINE_EXCEEDED, message);
      this.name = "DeadlineExceededError";
      Object.setPrototypeOf(this, _DeadlineExceededError.prototype);
    }
  };
  var CancelledError = class _CancelledError extends RpcError {
    constructor(message = "Stream cancelled") {
      super(RpcStatusCode.CANCELLED, message);
      this.name = "CancelledError";
      Object.setPrototypeOf(this, _CancelledError.prototype);
    }
  };

  // ../../packages/rpc-core/dist/flow-control.js
  var DEFAULT_INITIAL_CREDITS = 16;
  var DEFAULT_REPLENISH_CREDITS = 16;
  var LOW_WATERMARK_RATIO = 0.25;
  var SendFlowController = class {
    credits = 0;
    waiters = [];
    /** Current available credits */
    get available() {
      return this.credits;
    }
    /** Add credits (called when REQUEST_N is received from peer) */
    addCredits(n) {
      this.credits += n;
      while (this.waiters.length > 0 && this.credits > 0) {
        const waiter = this.waiters.shift();
        this.credits--;
        waiter.resolve();
      }
    }
    /**
     * Acquire a credit before sending a message.
     * Returns immediately if credits are available.
     * Otherwise, returns a promise that resolves when credits are granted.
     */
    async acquire(signal) {
      if (this.credits > 0) {
        this.credits--;
        return;
      }
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject };
        const onAbort = () => {
          const idx = this.waiters.indexOf(waiter);
          if (idx >= 0)
            this.waiters.splice(idx, 1);
          reject(signal.reason ?? new Error("Aborted"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        const originalResolve = waiter.resolve;
        waiter.resolve = () => {
          signal?.removeEventListener("abort", onAbort);
          originalResolve();
        };
        const originalReject = waiter.reject;
        waiter.reject = (err) => {
          signal?.removeEventListener("abort", onAbort);
          originalReject(err);
        };
        this.waiters.push(waiter);
      });
    }
    /** Try to acquire a credit without waiting. Returns false if none available. */
    tryAcquire() {
      if (this.credits > 0) {
        this.credits--;
        return true;
      }
      return false;
    }
    /** Cancel all pending waiters, rejecting them with CancelledError. */
    cancel() {
      const waiters = this.waiters.splice(0);
      const err = new CancelledError("Flow controller cancelled");
      for (const waiter of waiters) {
        waiter.reject(err);
      }
    }
  };
  var ReceiveFlowController = class {
    granted;
    consumed = 0;
    initialCredits;
    lowWatermark;
    replenishAmount;
    constructor(initialCredits = DEFAULT_INITIAL_CREDITS, replenishAmount = DEFAULT_REPLENISH_CREDITS) {
      this.initialCredits = initialCredits;
      this.granted = initialCredits;
      this.replenishAmount = replenishAmount;
      this.lowWatermark = Math.max(1, Math.floor(initialCredits * LOW_WATERMARK_RATIO));
    }
    /** Initial credits to advertise to the sender. */
    get initialCreditCount() {
      return this.initialCredits;
    }
    /**
     * Called when a MESSAGE is received.
     * Returns the number of new credits to send (0 if no REQUEST_N needed).
     */
    onMessageReceived() {
      this.consumed++;
      const remaining = this.granted - this.consumed;
      if (remaining <= this.lowWatermark) {
        this.granted += this.replenishAmount;
        return this.replenishAmount;
      }
      return 0;
    }
    /** Reset the controller, restoring to initial credits. */
    reset() {
      this.consumed = 0;
      this.granted = this.initialCredits;
    }
  };

  // ../../packages/rpc-core/dist/stream.js
  var StreamState;
  (function(StreamState2) {
    StreamState2["IDLE"] = "idle";
    StreamState2["OPEN"] = "open";
    StreamState2["HALF_CLOSED_LOCAL"] = "half_closed_local";
    StreamState2["HALF_CLOSED_REMOTE"] = "half_closed_remote";
    StreamState2["HALF_CLOSED_BOTH"] = "half_closed_both";
    StreamState2["CLOSED"] = "closed";
    StreamState2["ERROR"] = "error";
    StreamState2["CANCELLED"] = "cancelled";
  })(StreamState || (StreamState = {}));
  var Stream = class {
    streamId;
    _state = StreamState.IDLE;
    abortController = new AbortController();
    // Incoming message queue
    queue = [];
    waiter = null;
    // Flow control
    sendFlow;
    receiveFlow;
    // Sequence tracking
    sendSequence = 0;
    receiveSequence = 0;
    // Metadata
    _responseMetadata;
    _trailers;
    constructor(streamId, initialCredits = DEFAULT_INITIAL_CREDITS) {
      this.streamId = streamId;
      this.sendFlow = new SendFlowController();
      this.receiveFlow = new ReceiveFlowController(initialCredits);
    }
    get state() {
      return this._state;
    }
    get signal() {
      return this.abortController.signal;
    }
    get responseMetadata() {
      return this._responseMetadata;
    }
    get trailers() {
      return this._trailers;
    }
    /** Transition to a new state with validation. */
    setState(newState) {
      this._state = newState;
    }
    /** Mark stream as open. */
    open() {
      this._state = StreamState.OPEN;
    }
    /** Get and increment send sequence number. */
    nextSendSequence() {
      return ++this.sendSequence;
    }
    /** Validate and track incoming sequence number. */
    validateReceiveSequence(seq) {
      if (seq <= 0)
        return true;
      if (seq !== this.receiveSequence + 1) {
        return false;
      }
      this.receiveSequence = seq;
      return true;
    }
    /** Push an incoming message to the queue. */
    pushMessage(message) {
      const item = { type: "message", value: message };
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(item);
      } else {
        this.queue.push(item);
      }
    }
    /** Signal that no more incoming messages will arrive. */
    pushEnd(trailers) {
      this._trailers = trailers;
      const item = { type: "end", trailers };
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(item);
      } else {
        this.queue.push(item);
      }
    }
    /** Signal an error on the incoming side. */
    pushError(error) {
      const item = { type: "error", error };
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(item);
      } else {
        this.queue.push(item);
      }
    }
    /** Cancel this stream. */
    cancel(reason) {
      if (this._state === StreamState.CLOSED || this._state === StreamState.ERROR || this._state === StreamState.CANCELLED) {
        return;
      }
      this._state = StreamState.CANCELLED;
      const err = new CancelledError(reason ?? "Stream cancelled");
      this.abortController.abort(err);
      this.sendFlow.cancel();
      this.pushError(err);
    }
    /** Set response metadata from OPEN response or first MESSAGE. */
    setResponseMetadata(metadata) {
      this._responseMetadata = metadata;
    }
    /**
     * Async iterator for consuming incoming messages.
     * Yields messages until the stream ends or errors.
     */
    async *messages() {
      while (true) {
        const item = await this.nextItem();
        if (item.type === "message") {
          yield item.value;
        } else if (item.type === "error") {
          throw item.error;
        } else {
          return;
        }
      }
    }
    /** Wait for the next item from the queue. */
    nextItem() {
      if (this.queue.length > 0) {
        return Promise.resolve(this.queue.shift());
      }
      return new Promise((resolve) => {
        this.waiter = resolve;
      });
    }
    /**
     * Collect a single response (for unary calls).
     * Expects exactly one message followed by end.
     */
    async collectUnary() {
      const item = await this.nextItem();
      if (item.type === "error")
        throw item.error;
      if (item.type === "end") {
        throw new RpcError(RpcStatusCode.INTERNAL, "Expected response message but stream ended");
      }
      const endItem = await this.nextItem();
      if (endItem.type === "error")
        throw endItem.error;
      if (endItem.type === "message") {
        throw new RpcError(RpcStatusCode.INTERNAL, "Expected end of stream but received another message");
      }
      return item.value;
    }
  };
  var StreamManager = class {
    streams = /* @__PURE__ */ new Map();
    nextStreamId;
    constructor(clientSide) {
      this.nextStreamId = clientSide ? 1 : 2;
    }
    /** Allocate a new stream ID and create a stream. */
    createStream(initialCredits) {
      const id = this.nextStreamId;
      this.nextStreamId += 2;
      const stream = new Stream(id, initialCredits);
      this.streams.set(id, stream);
      return stream;
    }
    /** Register an externally-created stream (e.g., server accepting a client stream). */
    registerStream(stream) {
      this.streams.set(stream.streamId, stream);
    }
    /** Get a stream by ID. */
    getStream(streamId) {
      return this.streams.get(streamId);
    }
    /** Remove a stream (after it's fully closed). */
    removeStream(streamId) {
      this.streams.delete(streamId);
    }
    /** Cancel all active streams. */
    cancelAll(reason) {
      for (const stream of this.streams.values()) {
        stream.cancel(reason);
      }
      this.streams.clear();
    }
    /** Number of active streams. */
    get size() {
      return this.streams.size;
    }
  };

  // ../../packages/rpc-core/dist/handshake.js
  var CURRENT_PROTOCOL_VERSION = 1;
  var TS_IMPLEMENTATION_ID = "@rpc-bridge/core-ts/0.1.0";
  var Capabilities = {
    /** Credit-based flow control (REQUEST_N frames) */
    FLOW_CONTROL: "flow_control",
    /** Deadline/timeout support */
    DEADLINE: "deadline",
    /** Binary metadata values (base64-encoded in string map) */
    METADATA_BINARY: "metadata_binary",
    /** Stream cancellation support */
    CANCELLATION: "cancellation",
    /** Compressed payloads */
    COMPRESSION: "compression"
  };
  var DEFAULT_CAPABILITIES = [
    Capabilities.FLOW_CONTROL,
    Capabilities.DEADLINE,
    Capabilities.CANCELLATION
  ];
  function doHandshake(transport, opts, mode) {
    const { version, caps, implId, timeoutMs, logger: logger2 } = opts;
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          unsubscribe();
          reject(new Error(`Handshake timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      const handler = (frame) => {
        if (frame.type === FrameType.HANDSHAKE && !settled) {
          settled = true;
          clearTimeout(timeout);
          unsubscribe();
          const peerVersion = frame.protocolVersion ?? 1;
          const peerCaps = new Set(frame.capabilities ?? []);
          const negotiatedVersion = Math.min(version, peerVersion);
          const negotiatedCaps = new Set(caps.filter((c) => peerCaps.has(c)));
          const result = {
            protocolVersion: negotiatedVersion,
            capabilities: negotiatedCaps,
            peerImplementationId: frame.implementationId ?? "unknown"
          };
          if (mode === "responder") {
            const responseFrame = createHandshakeFrame(version, caps, implId);
            logger2.debug(`Sending handshake response: v${version}, caps=[${caps.join(",")}]`);
            transport.send(responseFrame);
          }
          logger2.info(`Handshake ${mode === "initiator" ? "complete" : "accepted"}: v${negotiatedVersion}, caps=[${[...negotiatedCaps].join(",")}], peer=${result.peerImplementationId}`);
          resolve(result);
        }
      };
      const unsubscribe = transport.onFrame(handler);
      if (mode === "initiator") {
        const handshakeFrame = createHandshakeFrame(version, caps, implId);
        logger2.debug(`Sending handshake: v${version}, caps=[${caps.join(",")}]`);
        transport.send(handshakeFrame);
      }
    });
  }
  function performHandshake(transport, options) {
    return doHandshake(transport, {
      version: options?.protocolVersion ?? CURRENT_PROTOCOL_VERSION,
      caps: options?.capabilities ?? DEFAULT_CAPABILITIES,
      implId: options?.implementationId ?? TS_IMPLEMENTATION_ID,
      timeoutMs: options?.timeoutMs ?? 5e3,
      logger: options?.logger ?? silentLogger
    }, "initiator");
  }

  // ../../packages/rpc-core/dist/client.js
  var RpcClient = class {
    transport;
    streams;
    logger;
    defaultDeadlineMs;
    defaultInitialCredits;
    handshakeResult;
    ready;
    isReady = false;
    closed = false;
    constructor(options) {
      this.transport = options.transport;
      this.logger = options.logger ?? silentLogger;
      this.streams = new StreamManager(true);
      this.defaultDeadlineMs = options.defaultDeadlineMs ?? 0;
      this.defaultInitialCredits = options.defaultInitialCredits ?? DEFAULT_INITIAL_CREDITS;
      this.transport.onFrame((frame) => this.handleFrame(frame));
      this.transport.onError((err) => this.handleTransportError(err));
      this.transport.onClose(() => this.handleTransportClose());
      if (options.skipHandshake) {
        this.ready = Promise.resolve();
        this.isReady = true;
      } else {
        this.ready = performHandshake(this.transport, { logger: this.logger }).then((result) => {
          this.handshakeResult = result;
          this.isReady = true;
        }).catch((err) => {
          this.logger.error("Handshake failed:", err);
          this.closed = true;
          throw err;
        });
      }
    }
    /** Wait for the client to be ready (handshake complete). */
    async waitReady() {
      await this.ready;
    }
    /** Get the handshake result, if handshake was performed. */
    getHandshakeResult() {
      return this.handshakeResult;
    }
    /** Close the client and cancel all active streams. */
    close() {
      if (this.closed)
        return;
      this.closed = true;
      this.streams.cancelAll("Client closed");
      this.transport.close();
    }
    // --- RPC call methods ---
    /**
     * Unary RPC: send one request, get one response.
     */
    async unary(method, requestBytes, options) {
      await this.ready;
      this.ensureOpen();
      const credits = options?.initialCredits ?? this.defaultInitialCredits;
      const stream = this.streams.createStream(credits);
      const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
      const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);
      try {
        const openFrame = createOpenFrame(stream.streamId, method, MethodType.UNARY, options?.metadata, deadlineMs);
        this.transport.send(openFrame);
        stream.open();
        this.transport.send(createRequestNFrame(stream.streamId, credits));
        const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), requestBytes);
        this.transport.send(msgFrame);
        this.transport.send(createHalfCloseFrame(stream.streamId));
        stream.setState(StreamState.HALF_CLOSED_LOCAL);
        const responseBytes = await stream.collectUnary();
        return {
          data: responseBytes,
          metadata: stream.responseMetadata,
          trailers: stream.trailers
        };
      } catch (err) {
        this.cancelStream(stream);
        throw err;
      } finally {
        cleanup();
        this.streams.removeStream(stream.streamId);
      }
    }
    /**
     * Server-streaming RPC: send one request, get a stream of responses.
     */
    async *serverStream(method, requestBytes, options) {
      await this.ready;
      this.ensureOpen();
      const credits = options?.initialCredits ?? this.defaultInitialCredits;
      const stream = this.streams.createStream(credits);
      const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
      const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);
      try {
        const openFrame = createOpenFrame(stream.streamId, method, MethodType.SERVER_STREAMING, options?.metadata, deadlineMs);
        this.transport.send(openFrame);
        stream.open();
        this.transport.send(createRequestNFrame(stream.streamId, credits));
        const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), requestBytes);
        this.transport.send(msgFrame);
        this.transport.send(createHalfCloseFrame(stream.streamId));
        stream.setState(StreamState.HALF_CLOSED_LOCAL);
        for await (const msg of stream.messages()) {
          yield msg;
          const additionalCredits = stream.receiveFlow.onMessageReceived();
          if (additionalCredits > 0) {
            this.transport.send(createRequestNFrame(stream.streamId, additionalCredits));
          }
        }
      } catch (err) {
        this.cancelStream(stream);
        throw err;
      } finally {
        cleanup();
        this.streams.removeStream(stream.streamId);
      }
    }
    /**
     * Client-streaming RPC: send a stream of requests, get one response.
     */
    async clientStream(method, requests, options) {
      await this.ready;
      this.ensureOpen();
      const credits = options?.initialCredits ?? this.defaultInitialCredits;
      const stream = this.streams.createStream(credits);
      const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
      const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);
      try {
        const openFrame = createOpenFrame(stream.streamId, method, MethodType.CLIENT_STREAMING, options?.metadata, deadlineMs);
        this.transport.send(openFrame);
        stream.open();
        this.transport.send(createRequestNFrame(stream.streamId, credits));
        for await (const reqBytes of requests) {
          if (stream.state === StreamState.CANCELLED || stream.state === StreamState.ERROR) {
            break;
          }
          await stream.sendFlow.acquire(stream.signal);
          const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), reqBytes);
          this.transport.send(msgFrame);
        }
        this.transport.send(createHalfCloseFrame(stream.streamId));
        stream.setState(StreamState.HALF_CLOSED_LOCAL);
        const responseBytes = await stream.collectUnary();
        return {
          data: responseBytes,
          metadata: stream.responseMetadata,
          trailers: stream.trailers
        };
      } catch (err) {
        this.cancelStream(stream);
        throw err;
      } finally {
        cleanup();
        this.streams.removeStream(stream.streamId);
      }
    }
    /**
     * Bidirectional streaming RPC: send and receive message streams concurrently.
     */
    bidiStream(method, requests, options) {
      const credits = options?.initialCredits ?? this.defaultInitialCredits;
      const self = this;
      return (async function* () {
        await self.ready;
        self.ensureOpen();
        const stream = self.streams.createStream(credits);
        const deadlineMs = options?.deadlineMs ?? self.defaultDeadlineMs;
        const cleanup = self.setupCancellation(stream, options?.signal, deadlineMs);
        try {
          const openFrame = createOpenFrame(stream.streamId, method, MethodType.BIDI_STREAMING, options?.metadata, deadlineMs);
          self.transport.send(openFrame);
          stream.open();
          self.transport.send(createRequestNFrame(stream.streamId, credits));
          const sendDone = (async () => {
            try {
              for await (const reqBytes of requests) {
                if (stream.state === StreamState.CANCELLED || stream.state === StreamState.ERROR) {
                  break;
                }
                await stream.sendFlow.acquire(stream.signal);
                const msgFrame = createMessageFrame(stream.streamId, stream.nextSendSequence(), reqBytes);
                self.transport.send(msgFrame);
              }
              if (stream.state === StreamState.OPEN) {
                self.transport.send(createHalfCloseFrame(stream.streamId));
                stream.setState(StreamState.HALF_CLOSED_LOCAL);
              }
            } catch (err) {
              if (!(err instanceof CancelledError)) {
                self.logger.error("Bidi send error:", err);
              }
            }
          })();
          try {
            for await (const msg of stream.messages()) {
              yield msg;
              const additionalCredits = stream.receiveFlow.onMessageReceived();
              if (additionalCredits > 0) {
                self.transport.send(createRequestNFrame(stream.streamId, additionalCredits));
              }
            }
          } finally {
            await sendDone.catch(() => {
            });
          }
        } catch (err) {
          self.cancelStream(stream);
          throw err;
        } finally {
          cleanup();
          self.streams.removeStream(stream.streamId);
        }
      })();
    }
    // --- Frame handling ---
    handleFrame(frame) {
      if (frame.type === FrameType.HANDSHAKE)
        return;
      if (!this.isReady) {
        this.logger.warn(`Received frame type=${frame.type} before handshake complete, ignoring`);
        return;
      }
      const stream = this.streams.getStream(frame.streamId);
      if (!stream) {
        this.logger.warn(`Received frame for unknown stream ${frame.streamId}, type=${frame.type}`);
        return;
      }
      switch (frame.type) {
        case FrameType.MESSAGE:
          if (!stream.validateReceiveSequence(frame.sequence)) {
            this.logger.warn(`Out-of-order message on stream ${frame.streamId}: expected next sequence, got ${frame.sequence}`);
            stream.pushError(new RpcError(RpcStatusCode.INTERNAL, "Out-of-order message received"));
            this.cancelStream(stream);
            return;
          }
          if (frame.metadata) {
            stream.setResponseMetadata(frame.metadata);
          }
          stream.pushMessage(frame.payload ?? new Uint8Array(0));
          break;
        case FrameType.CLOSE:
          stream.setState(StreamState.CLOSED);
          stream.pushEnd(frame.trailers);
          break;
        case FrameType.ERROR:
          stream.setState(StreamState.ERROR);
          stream.pushError(RpcError.fromFrame(frame.errorCode ?? RpcStatusCode.UNKNOWN, frame.errorMessage ?? "Unknown error", frame.errorDetails));
          break;
        case FrameType.HALF_CLOSE:
          if (stream.state === StreamState.HALF_CLOSED_LOCAL) {
            stream.setState(StreamState.HALF_CLOSED_BOTH);
          } else {
            stream.setState(StreamState.HALF_CLOSED_REMOTE);
          }
          break;
        case FrameType.REQUEST_N:
          stream.sendFlow.addCredits(frame.requestN ?? 0);
          break;
        case FrameType.CANCEL:
          stream.cancel("Cancelled by server");
          break;
        default:
          this.logger.debug(`Ignoring unknown frame type ${frame.type} on stream ${frame.streamId}`);
          break;
      }
    }
    handleTransportError(err) {
      this.logger.error("Transport error:", err);
      this.streams.cancelAll("Transport error");
    }
    handleTransportClose() {
      this.logger.info("Transport closed");
      this.streams.cancelAll("Transport closed");
      this.closed = true;
    }
    // --- Helpers ---
    ensureOpen() {
      if (this.closed) {
        throw new RpcError(RpcStatusCode.UNAVAILABLE, "Client is closed");
      }
      if (!this.transport.isOpen) {
        throw new RpcError(RpcStatusCode.UNAVAILABLE, "Transport is not open");
      }
    }
    /**
     * Set up cancellation for a stream (abort signal + deadline).
     * Returns a cleanup function that must be called in the finally block.
     */
    setupCancellation(stream, signal, deadlineMs) {
      let deadlineTimer;
      let abortHandler;
      if (signal) {
        if (signal.aborted) {
          stream.cancel("Aborted");
        } else {
          abortHandler = () => {
            stream.cancel("Aborted");
            this.cancelStream(stream);
          };
          signal.addEventListener("abort", abortHandler, { once: true });
        }
      }
      if (deadlineMs && deadlineMs > 0) {
        deadlineTimer = setTimeout(() => {
          if (stream.state === StreamState.OPEN || stream.state === StreamState.HALF_CLOSED_LOCAL || stream.state === StreamState.HALF_CLOSED_REMOTE) {
            stream.pushError(new DeadlineExceededError());
            stream.setState(StreamState.ERROR);
            this.cancelStream(stream);
          }
        }, deadlineMs);
      }
      return () => {
        if (deadlineTimer !== void 0) {
          clearTimeout(deadlineTimer);
        }
        if (abortHandler && signal) {
          signal.removeEventListener("abort", abortHandler);
        }
      };
    }
    cancelStream(stream) {
      try {
        if (this.transport.isOpen && stream.state !== StreamState.CLOSED && stream.state !== StreamState.ERROR) {
          this.transport.send(createCancelFrame(stream.streamId));
        }
      } catch {
      }
    }
  };

  // ../../packages/transport-ios/dist/wkwebview-transport.js
  var DEFAULT_HANDLER_NAME = "rpcBridge";
  var DEFAULT_CALLBACK_NAME = "__rpcBridgeReceive";
  var WKWebViewTransport = class extends MessageTransportBase {
    handlerName;
    callbackName;
    constructor(options = {}) {
      super(FrameEncoding.BASE64, options.logger);
      this.handlerName = options.handlerName ?? DEFAULT_HANDLER_NAME;
      this.callbackName = options.callbackName ?? DEFAULT_CALLBACK_NAME;
      window[this.callbackName] = (base64Frame) => {
        this.handleRawMessage(base64Frame);
      };
      if (!window.webkit?.messageHandlers[this.handlerName]) {
        this.logger.warn(`WKWebView message handler '${this.handlerName}' not found. Messages will fail until the native side registers the handler.`);
      }
    }
    sendRaw(data) {
      if (typeof data !== "string") {
        throw new Error("Expected base64 string but received binary data");
      }
      const handler = window.webkit?.messageHandlers[this.handlerName];
      if (!handler) {
        throw new Error(`WKWebView message handler '${this.handlerName}' not available`);
      }
      handler.postMessage(data);
    }
    close() {
      delete window[this.callbackName];
      super.close();
    }
  };

  // src/ui.ts
  function createDemoUI(options) {
    const { root, client, platform } = options;
    root.innerHTML = buildHTML(platform ?? "RPC Bridge");
    const controller = new DemoUIController(root, client);
    controller.init();
    return controller;
  }
  var DemoUIController = class {
    constructor(root, client) {
      this.root = root;
      this.client = client;
    }
    root;
    client;
    logEl;
    chatLogEl;
    streamAbort;
    chatAbort;
    chatQueue = [];
    chatResolve;
    chatSeq = 0;
    chatDone = false;
    init() {
      this.logEl = this.root.querySelector("#log");
      this.chatLogEl = this.root.querySelector("#chat-log");
      this.root.querySelector("#btn-hello").addEventListener("click", () => {
        this.doUnaryHello();
      });
      this.root.querySelector("#btn-stream").addEventListener("click", () => {
        this.doStreamGreeting();
      });
      this.root.querySelector("#btn-stop-stream").addEventListener("click", () => {
        this.stopStream();
      });
      this.root.querySelector("#btn-chat-start").addEventListener("click", () => {
        this.startChat();
      });
      this.root.querySelector("#btn-chat-send").addEventListener("click", () => {
        this.sendChatMessage();
      });
      this.root.querySelector("#btn-chat-stop").addEventListener("click", () => {
        this.stopChat();
      });
      this.log("UI initialized. Ready to test RPC methods.");
    }
    async doUnaryHello() {
      const nameInput = this.root.querySelector("#input-name");
      const name = nameInput.value.trim() || "World";
      this.log(`Calling SayHello("${name}")...`);
      try {
        const response = await this.client.sayHello({ name });
        this.log(`Response: ${response.message}`);
      } catch (err) {
        this.log(`Error: ${err}`, true);
      }
    }
    async doStreamGreeting() {
      const nameInput = this.root.querySelector("#input-name");
      const name = nameInput.value.trim() || "World";
      this.log(`Starting WatchGreeting("${name}")...`);
      this.streamAbort = new AbortController();
      try {
        const stream = this.client.watchGreeting({
          name,
          maxCount: 20,
          intervalMs: 1e3
        });
        for await (const event of stream) {
          if (this.streamAbort.signal.aborted) break;
          this.log(`[#${event.seq}] ${event.message}`);
        }
        this.log("Stream completed.");
      } catch (err) {
        if (String(err).includes("cancel") || String(err).includes("abort")) {
          this.log("Stream cancelled.");
        } else {
          this.log(`Stream error: ${err}`, true);
        }
      } finally {
        this.streamAbort = void 0;
      }
    }
    stopStream() {
      if (this.streamAbort) {
        this.streamAbort.abort();
        this.log("Cancelling stream...");
      }
    }
    startChat() {
      this.chatSeq = 0;
      this.chatDone = false;
      this.chatQueue = [];
      this.chatLogEl.innerHTML = "";
      this.chatAbort = new AbortController();
      const self = this;
      const inputIterable = {
        [Symbol.asyncIterator]() {
          return {
            next() {
              if (self.chatQueue.length > 0) {
                return Promise.resolve({ done: false, value: self.chatQueue.shift() });
              }
              if (self.chatDone) {
                return Promise.resolve({ done: true, value: void 0 });
              }
              return new Promise((resolve) => {
                self.chatResolve = resolve;
              });
            },
            return() {
              self.chatDone = true;
              return Promise.resolve({ done: true, value: void 0 });
            }
          };
        }
      };
      this.chatLog("Chat started. Type messages below.");
      (async () => {
        try {
          const responses = this.client.chat(inputIterable);
          for await (const msg of responses) {
            if (this.chatAbort?.signal.aborted) break;
            this.chatLog(`[${msg.from}] ${msg.text}`);
          }
          this.chatLog("Chat ended.");
        } catch (err) {
          if (!String(err).includes("cancel") && !String(err).includes("abort")) {
            this.chatLog(`Chat error: ${err}`);
          } else {
            this.chatLog("Chat cancelled.");
          }
        }
      })();
    }
    sendChatMessage() {
      const input = this.root.querySelector("#input-chat");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      this.chatSeq++;
      const msg = { from: "user", text, seq: this.chatSeq };
      this.chatLog(`[you] ${text}`);
      if (this.chatResolve) {
        const resolve = this.chatResolve;
        this.chatResolve = void 0;
        resolve({ done: false, value: msg });
      } else {
        this.chatQueue.push(msg);
      }
    }
    stopChat() {
      this.chatDone = true;
      if (this.chatResolve) {
        const resolve = this.chatResolve;
        this.chatResolve = void 0;
        resolve({ done: true, value: void 0 });
      }
      if (this.chatAbort) {
        this.chatAbort.abort();
        this.chatAbort = void 0;
      }
    }
    log(message, isError = false) {
      const entry = document.createElement("div");
      entry.className = isError ? "log-error" : "log-entry";
      entry.textContent = `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] ${message}`;
      this.logEl.appendChild(entry);
      this.logEl.scrollTop = this.logEl.scrollHeight;
    }
    chatLog(message) {
      const entry = document.createElement("div");
      entry.className = "chat-entry";
      entry.textContent = message;
      this.chatLogEl.appendChild(entry);
      this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
    }
  };
  function escapeHtml(unsafe) {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function buildHTML(platform) {
    const safePlatform = escapeHtml(platform);
    return `
<div class="rpc-demo">
  <h1>RPC Bridge Demo - ${safePlatform}</h1>

  <section class="section">
    <h2>Unary RPC: SayHello</h2>
    <div class="row">
      <input id="input-name" type="text" placeholder="Enter name" value="World" />
      <button id="btn-hello">Say Hello</button>
    </div>
  </section>

  <section class="section">
    <h2>Server Streaming: WatchGreeting</h2>
    <div class="row">
      <button id="btn-stream">Start Stream</button>
      <button id="btn-stop-stream">Stop Stream</button>
    </div>
  </section>

  <section class="section">
    <h2>Bidi Streaming: Chat</h2>
    <div class="row">
      <button id="btn-chat-start">Start Chat</button>
      <button id="btn-chat-stop">End Chat</button>
    </div>
    <div class="row">
      <input id="input-chat" type="text" placeholder="Type a message..." />
      <button id="btn-chat-send">Send</button>
    </div>
    <div id="chat-log" class="log-panel chat-panel"></div>
  </section>

  <section class="section">
    <h2>Log</h2>
    <div id="log" class="log-panel"></div>
  </section>
</div>
`;
  }
  function getDemoStyles() {
    return `
.rpc-demo {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  color: #333;
}
h1 { font-size: 1.5rem; border-bottom: 2px solid #4a90d9; padding-bottom: 8px; }
h2 { font-size: 1.1rem; color: #4a90d9; margin-top: 24px; }
.section { margin-bottom: 16px; }
.row { display: flex; gap: 8px; margin: 8px 0; align-items: center; }
input[type="text"] {
  flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px;
  font-size: 14px;
}
button {
  padding: 8px 16px; background: #4a90d9; color: white; border: none;
  border-radius: 4px; cursor: pointer; font-size: 14px; white-space: nowrap;
}
button:hover { background: #357abd; }
button:active { background: #2a5f9e; }
.log-panel {
  background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 12px;
  max-height: 300px; overflow-y: auto; min-height: 100px;
}
.chat-panel { min-height: 150px; max-height: 200px; }
.log-entry { margin: 2px 0; }
.log-error { margin: 2px 0; color: #f44; }
.chat-entry { margin: 2px 0; color: #8cd; }
`;
  }

  // generated/messages.ts
  var HelloRequest = class _HelloRequest {
    name = "";
    language = "";
    constructor(init2) {
      if (init2) {
        Object.assign(this, init2);
      }
    }
    /** Encode this message to protobuf binary format. */
    static encode(msg) {
      const w = new ProtoWriter();
      if (msg.name !== "") {
        w.writeStringField(1, msg.name);
      }
      if (msg.language !== "") {
        w.writeStringField(2, msg.language);
      }
      return w.finish();
    }
    /** Decode a HelloRequest from protobuf binary format. */
    static decode(data) {
      const r = new ProtoReader(data);
      const msg = new _HelloRequest();
      while (r.hasMore()) {
        const tag = r.readTag();
        const fieldNumber = tag >>> 3;
        const wireType = tag & 7;
        switch (fieldNumber) {
          case 1: {
            msg.name = r.readString();
            break;
          }
          case 2: {
            msg.language = r.readString();
            break;
          }
          default:
            r.skipField(wireType);
            break;
        }
      }
      return msg;
    }
  };
  var HelloResponse = class _HelloResponse {
    message = "";
    timestamp = 0;
    serverVersion = "";
    constructor(init2) {
      if (init2) {
        Object.assign(this, init2);
      }
    }
    /** Encode this message to protobuf binary format. */
    static encode(msg) {
      const w = new ProtoWriter();
      if (msg.message !== "") {
        w.writeStringField(1, msg.message);
      }
      if (msg.timestamp !== 0) {
        w.writeVarintField(2, msg.timestamp);
      }
      if (msg.serverVersion !== "") {
        w.writeStringField(3, msg.serverVersion);
      }
      return w.finish();
    }
    /** Decode a HelloResponse from protobuf binary format. */
    static decode(data) {
      const r = new ProtoReader(data);
      const msg = new _HelloResponse();
      while (r.hasMore()) {
        const tag = r.readTag();
        const fieldNumber = tag >>> 3;
        const wireType = tag & 7;
        switch (fieldNumber) {
          case 1: {
            msg.message = r.readString();
            break;
          }
          case 2: {
            msg.timestamp = r.readVarint();
            break;
          }
          case 3: {
            msg.serverVersion = r.readString();
            break;
          }
          default:
            r.skipField(wireType);
            break;
        }
      }
      return msg;
    }
  };
  var GreetingStreamRequest = class _GreetingStreamRequest {
    name = "";
    maxCount = 0;
    intervalMs = 0;
    constructor(init2) {
      if (init2) {
        Object.assign(this, init2);
      }
    }
    /** Encode this message to protobuf binary format. */
    static encode(msg) {
      const w = new ProtoWriter();
      if (msg.name !== "") {
        w.writeStringField(1, msg.name);
      }
      if (msg.maxCount !== 0) {
        w.writeVarintField(2, msg.maxCount);
      }
      if (msg.intervalMs !== 0) {
        w.writeVarintField(3, msg.intervalMs);
      }
      return w.finish();
    }
    /** Decode a GreetingStreamRequest from protobuf binary format. */
    static decode(data) {
      const r = new ProtoReader(data);
      const msg = new _GreetingStreamRequest();
      while (r.hasMore()) {
        const tag = r.readTag();
        const fieldNumber = tag >>> 3;
        const wireType = tag & 7;
        switch (fieldNumber) {
          case 1: {
            msg.name = r.readString();
            break;
          }
          case 2: {
            msg.maxCount = r.readVarint();
            break;
          }
          case 3: {
            msg.intervalMs = r.readVarint();
            break;
          }
          default:
            r.skipField(wireType);
            break;
        }
      }
      return msg;
    }
  };
  var GreetingEvent = class _GreetingEvent {
    message = "";
    seq = 0;
    timestamp = 0;
    constructor(init2) {
      if (init2) {
        Object.assign(this, init2);
      }
    }
    /** Encode this message to protobuf binary format. */
    static encode(msg) {
      const w = new ProtoWriter();
      if (msg.message !== "") {
        w.writeStringField(1, msg.message);
      }
      if (msg.seq !== 0) {
        w.writeVarintField(2, msg.seq);
      }
      if (msg.timestamp !== 0) {
        w.writeVarintField(3, msg.timestamp);
      }
      return w.finish();
    }
    /** Decode a GreetingEvent from protobuf binary format. */
    static decode(data) {
      const r = new ProtoReader(data);
      const msg = new _GreetingEvent();
      while (r.hasMore()) {
        const tag = r.readTag();
        const fieldNumber = tag >>> 3;
        const wireType = tag & 7;
        switch (fieldNumber) {
          case 1: {
            msg.message = r.readString();
            break;
          }
          case 2: {
            msg.seq = r.readVarint();
            break;
          }
          case 3: {
            msg.timestamp = r.readVarint();
            break;
          }
          default:
            r.skipField(wireType);
            break;
        }
      }
      return msg;
    }
  };
  var ChatMessage = class _ChatMessage {
    from = "";
    text = "";
    seq = 0;
    timestamp = 0;
    constructor(init2) {
      if (init2) {
        Object.assign(this, init2);
      }
    }
    /** Encode this message to protobuf binary format. */
    static encode(msg) {
      const w = new ProtoWriter();
      if (msg.from !== "") {
        w.writeStringField(1, msg.from);
      }
      if (msg.text !== "") {
        w.writeStringField(2, msg.text);
      }
      if (msg.seq !== 0) {
        w.writeVarintField(3, msg.seq);
      }
      if (msg.timestamp !== 0) {
        w.writeVarintField(4, msg.timestamp);
      }
      return w.finish();
    }
    /** Decode a ChatMessage from protobuf binary format. */
    static decode(data) {
      const r = new ProtoReader(data);
      const msg = new _ChatMessage();
      while (r.hasMore()) {
        const tag = r.readTag();
        const fieldNumber = tag >>> 3;
        const wireType = tag & 7;
        switch (fieldNumber) {
          case 1: {
            msg.from = r.readString();
            break;
          }
          case 2: {
            msg.text = r.readString();
            break;
          }
          case 3: {
            msg.seq = r.readVarint();
            break;
          }
          case 4: {
            msg.timestamp = r.readVarint();
            break;
          }
          default:
            r.skipField(wireType);
            break;
        }
      }
      return msg;
    }
  };

  // src/ios.ts
  var logger = createConsoleLogger("iOS-Client");
  async function init() {
    logger.info("Initializing WKWebView RPC client...");
    const transport = new WKWebViewTransport({
      logger: createConsoleLogger("iOS-Transport")
    });
    const rpcClient = new RpcClient({
      transport,
      logger: createConsoleLogger("iOS-RpcClient"),
      skipHandshake: false
    });
    await rpcClient.waitReady();
    logger.info("Client handshake complete, ready for RPCs");
    const client = {
      async sayHello(request) {
        const result = await rpcClient.unary(
          "demo.hello.v1.HelloBridgeService/SayHello",
          HelloRequest.encode({ name: request.name, language: request.language ?? "" })
        );
        const resp = HelloResponse.decode(result.data);
        return { message: resp.message, timestamp: resp.timestamp };
      },
      async *watchGreeting(request) {
        const stream = rpcClient.serverStream(
          "demo.hello.v1.HelloBridgeService/WatchGreeting",
          GreetingStreamRequest.encode({
            name: request.name,
            maxCount: request.maxCount ?? 0,
            intervalMs: request.intervalMs ?? 0
          })
        );
        for await (const bytes of stream) {
          const event = GreetingEvent.decode(bytes);
          yield { message: event.message, seq: event.seq };
        }
      },
      chat(requests) {
        const byteRequests = {
          [Symbol.asyncIterator]() {
            const iter = requests[Symbol.asyncIterator]();
            return {
              async next() {
                const result = await iter.next();
                if (result.done) return { done: true, value: void 0 };
                const msg = result.value;
                return {
                  done: false,
                  value: ChatMessage.encode({ from: msg.from, text: msg.text, seq: msg.seq ?? 0, timestamp: 0 })
                };
              },
              async return() {
                await iter.return?.();
                return { done: true, value: void 0 };
              }
            };
          }
        };
        const rawStream = rpcClient.bidiStream(
          "demo.hello.v1.HelloBridgeService/Chat",
          byteRequests
        );
        return {
          [Symbol.asyncIterator]() {
            const iter = rawStream[Symbol.asyncIterator]();
            return {
              async next() {
                const result = await iter.next();
                if (result.done) return { done: true, value: void 0 };
                const msg = ChatMessage.decode(result.value);
                return { done: false, value: { from: msg.from, text: msg.text, seq: msg.seq } };
              },
              async return() {
                await iter.return?.();
                return { done: true, value: void 0 };
              }
            };
          }
        };
      }
    };
    const style = document.createElement("style");
    style.textContent = getDemoStyles();
    document.head.appendChild(style);
    createDemoUI({
      root: document.getElementById("app"),
      client,
      platform: "iOS (WKWebView)"
    });
  }
  init().catch((err) => {
    logger.error("Failed to initialize:", err);
    const app = document.getElementById("app");
    if (app) app.innerHTML = `<p style="color:red">Error: ${err.message}</p>`;
  });
})();
//# sourceMappingURL=ios.js.map
