(() => {
  // ../../../node_modules/@bufbuild/protobuf/dist/esm/wire/varint.js
  function varint64read() {
    let lowBits = 0;
    let highBits = 0;
    for (let shift = 0; shift < 28; shift += 7) {
      let b = this.buf[this.pos++];
      lowBits |= (b & 127) << shift;
      if ((b & 128) == 0) {
        this.assertBounds();
        return [lowBits, highBits];
      }
    }
    let middleByte = this.buf[this.pos++];
    lowBits |= (middleByte & 15) << 28;
    highBits = (middleByte & 112) >> 4;
    if ((middleByte & 128) == 0) {
      this.assertBounds();
      return [lowBits, highBits];
    }
    for (let shift = 3; shift <= 31; shift += 7) {
      let b = this.buf[this.pos++];
      highBits |= (b & 127) << shift;
      if ((b & 128) == 0) {
        this.assertBounds();
        return [lowBits, highBits];
      }
    }
    throw new Error("invalid varint");
  }
  function varint64write(lo, hi, bytes) {
    for (let i = 0; i < 28; i = i + 7) {
      const shift = lo >>> i;
      const hasNext = !(shift >>> 7 == 0 && hi == 0);
      const byte = (hasNext ? shift | 128 : shift) & 255;
      bytes.push(byte);
      if (!hasNext) {
        return;
      }
    }
    const splitBits = lo >>> 28 & 15 | (hi & 7) << 4;
    const hasMoreBits = !(hi >> 3 == 0);
    bytes.push((hasMoreBits ? splitBits | 128 : splitBits) & 255);
    if (!hasMoreBits) {
      return;
    }
    for (let i = 3; i < 31; i = i + 7) {
      const shift = hi >>> i;
      const hasNext = !(shift >>> 7 == 0);
      const byte = (hasNext ? shift | 128 : shift) & 255;
      bytes.push(byte);
      if (!hasNext) {
        return;
      }
    }
    bytes.push(hi >>> 31 & 1);
  }
  var TWO_PWR_32_DBL = 4294967296;
  function int64FromString(dec) {
    const minus = dec[0] === "-";
    if (minus) {
      dec = dec.slice(1);
    }
    const base = 1e6;
    let lowBits = 0;
    let highBits = 0;
    function add1e6digit(begin, end) {
      const digit1e6 = Number(dec.slice(begin, end));
      highBits *= base;
      lowBits = lowBits * base + digit1e6;
      if (lowBits >= TWO_PWR_32_DBL) {
        highBits = highBits + (lowBits / TWO_PWR_32_DBL | 0);
        lowBits = lowBits % TWO_PWR_32_DBL;
      }
    }
    add1e6digit(-24, -18);
    add1e6digit(-18, -12);
    add1e6digit(-12, -6);
    add1e6digit(-6);
    return minus ? negate(lowBits, highBits) : newBits(lowBits, highBits);
  }
  function int64ToString(lo, hi) {
    let bits = newBits(lo, hi);
    const negative = bits.hi & 2147483648;
    if (negative) {
      bits = negate(bits.lo, bits.hi);
    }
    const result = uInt64ToString(bits.lo, bits.hi);
    return negative ? "-" + result : result;
  }
  function uInt64ToString(lo, hi) {
    ({ lo, hi } = toUnsigned(lo, hi));
    if (hi <= 2097151) {
      return String(TWO_PWR_32_DBL * hi + lo);
    }
    const low = lo & 16777215;
    const mid = (lo >>> 24 | hi << 8) & 16777215;
    const high = hi >> 16 & 65535;
    let digitA = low + mid * 6777216 + high * 6710656;
    let digitB = mid + high * 8147497;
    let digitC = high * 2;
    const base = 1e7;
    if (digitA >= base) {
      digitB += Math.floor(digitA / base);
      digitA %= base;
    }
    if (digitB >= base) {
      digitC += Math.floor(digitB / base);
      digitB %= base;
    }
    return digitC.toString() + decimalFrom1e7WithLeadingZeros(digitB) + decimalFrom1e7WithLeadingZeros(digitA);
  }
  function toUnsigned(lo, hi) {
    return { lo: lo >>> 0, hi: hi >>> 0 };
  }
  function newBits(lo, hi) {
    return { lo: lo | 0, hi: hi | 0 };
  }
  function negate(lowBits, highBits) {
    highBits = ~highBits;
    if (lowBits) {
      lowBits = ~lowBits + 1;
    } else {
      highBits += 1;
    }
    return newBits(lowBits, highBits);
  }
  var decimalFrom1e7WithLeadingZeros = (digit1e7) => {
    const partial = String(digit1e7);
    return "0000000".slice(partial.length) + partial;
  };
  function varint32write(value, bytes) {
    if (value >= 0) {
      while (value > 127) {
        bytes.push(value & 127 | 128);
        value = value >>> 7;
      }
      bytes.push(value);
    } else {
      for (let i = 0; i < 9; i++) {
        bytes.push(value & 127 | 128);
        value = value >> 7;
      }
      bytes.push(1);
    }
  }
  function varint32read() {
    let b = this.buf[this.pos++];
    let result = b & 127;
    if ((b & 128) == 0) {
      this.assertBounds();
      return result;
    }
    b = this.buf[this.pos++];
    result |= (b & 127) << 7;
    if ((b & 128) == 0) {
      this.assertBounds();
      return result;
    }
    b = this.buf[this.pos++];
    result |= (b & 127) << 14;
    if ((b & 128) == 0) {
      this.assertBounds();
      return result;
    }
    b = this.buf[this.pos++];
    result |= (b & 127) << 21;
    if ((b & 128) == 0) {
      this.assertBounds();
      return result;
    }
    b = this.buf[this.pos++];
    result |= (b & 15) << 28;
    for (let readBytes = 5; (b & 128) !== 0 && readBytes < 10; readBytes++)
      b = this.buf[this.pos++];
    if ((b & 128) != 0)
      throw new Error("invalid varint");
    this.assertBounds();
    return result >>> 0;
  }

  // ../../../node_modules/@bufbuild/protobuf/dist/esm/proto-int64.js
  var protoInt64 = /* @__PURE__ */ makeInt64Support();
  function makeInt64Support() {
    const dv = new DataView(new ArrayBuffer(8));
    const ok = typeof BigInt === "function" && typeof dv.getBigInt64 === "function" && typeof dv.getBigUint64 === "function" && typeof dv.setBigInt64 === "function" && typeof dv.setBigUint64 === "function" && (!!globalThis.Deno || typeof process != "object" || typeof process.env != "object" || process.env.BUF_BIGINT_DISABLE !== "1");
    if (ok) {
      const MIN = BigInt("-9223372036854775808");
      const MAX = BigInt("9223372036854775807");
      const UMIN = BigInt("0");
      const UMAX = BigInt("18446744073709551615");
      return {
        zero: BigInt(0),
        supported: true,
        parse(value) {
          const bi = typeof value == "bigint" ? value : BigInt(value);
          if (bi > MAX || bi < MIN) {
            throw new Error(`invalid int64: ${value}`);
          }
          return bi;
        },
        uParse(value) {
          const bi = typeof value == "bigint" ? value : BigInt(value);
          if (bi > UMAX || bi < UMIN) {
            throw new Error(`invalid uint64: ${value}`);
          }
          return bi;
        },
        enc(value) {
          dv.setBigInt64(0, this.parse(value), true);
          return {
            lo: dv.getInt32(0, true),
            hi: dv.getInt32(4, true)
          };
        },
        uEnc(value) {
          dv.setBigInt64(0, this.uParse(value), true);
          return {
            lo: dv.getInt32(0, true),
            hi: dv.getInt32(4, true)
          };
        },
        dec(lo, hi) {
          dv.setInt32(0, lo, true);
          dv.setInt32(4, hi, true);
          return dv.getBigInt64(0, true);
        },
        uDec(lo, hi) {
          dv.setInt32(0, lo, true);
          dv.setInt32(4, hi, true);
          return dv.getBigUint64(0, true);
        }
      };
    }
    return {
      zero: "0",
      supported: false,
      parse(value) {
        if (typeof value != "string") {
          value = value.toString();
        }
        assertInt64String(value);
        return value;
      },
      uParse(value) {
        if (typeof value != "string") {
          value = value.toString();
        }
        assertUInt64String(value);
        return value;
      },
      enc(value) {
        if (typeof value != "string") {
          value = value.toString();
        }
        assertInt64String(value);
        return int64FromString(value);
      },
      uEnc(value) {
        if (typeof value != "string") {
          value = value.toString();
        }
        assertUInt64String(value);
        return int64FromString(value);
      },
      dec(lo, hi) {
        return int64ToString(lo, hi);
      },
      uDec(lo, hi) {
        return uInt64ToString(lo, hi);
      }
    };
  }
  function assertInt64String(value) {
    if (!/^-?[0-9]+$/.test(value)) {
      throw new Error("invalid int64: " + value);
    }
  }
  function assertUInt64String(value) {
    if (!/^[0-9]+$/.test(value)) {
      throw new Error("invalid uint64: " + value);
    }
  }

  // ../../../node_modules/@bufbuild/protobuf/dist/esm/wire/text-encoding.js
  var symbol = /* @__PURE__ */ Symbol.for("@bufbuild/protobuf/text-encoding");
  function getTextEncoding() {
    if (globalThis[symbol] == void 0) {
      const te = new globalThis.TextEncoder();
      const td = new globalThis.TextDecoder();
      globalThis[symbol] = {
        encodeUtf8(text) {
          return te.encode(text);
        },
        decodeUtf8(bytes) {
          return td.decode(bytes);
        },
        checkUtf8(text) {
          try {
            encodeURIComponent(text);
            return true;
          } catch (_) {
            return false;
          }
        }
      };
    }
    return globalThis[symbol];
  }

  // ../../../node_modules/@bufbuild/protobuf/dist/esm/wire/binary-encoding.js
  var WireType;
  (function(WireType2) {
    WireType2[WireType2["Varint"] = 0] = "Varint";
    WireType2[WireType2["Bit64"] = 1] = "Bit64";
    WireType2[WireType2["LengthDelimited"] = 2] = "LengthDelimited";
    WireType2[WireType2["StartGroup"] = 3] = "StartGroup";
    WireType2[WireType2["EndGroup"] = 4] = "EndGroup";
    WireType2[WireType2["Bit32"] = 5] = "Bit32";
  })(WireType || (WireType = {}));
  var FLOAT32_MAX = 34028234663852886e22;
  var FLOAT32_MIN = -34028234663852886e22;
  var UINT32_MAX = 4294967295;
  var INT32_MAX = 2147483647;
  var INT32_MIN = -2147483648;
  var BinaryWriter = class {
    constructor(encodeUtf8 = getTextEncoding().encodeUtf8) {
      this.encodeUtf8 = encodeUtf8;
      this.stack = [];
      this.chunks = [];
      this.buf = [];
    }
    /**
     * Return all bytes written and reset this writer.
     */
    finish() {
      if (this.buf.length) {
        this.chunks.push(new Uint8Array(this.buf));
        this.buf = [];
      }
      let len = 0;
      for (let i = 0; i < this.chunks.length; i++)
        len += this.chunks[i].length;
      let bytes = new Uint8Array(len);
      let offset = 0;
      for (let i = 0; i < this.chunks.length; i++) {
        bytes.set(this.chunks[i], offset);
        offset += this.chunks[i].length;
      }
      this.chunks = [];
      return bytes;
    }
    /**
     * Start a new fork for length-delimited data like a message
     * or a packed repeated field.
     *
     * Must be joined later with `join()`.
     */
    fork() {
      this.stack.push({ chunks: this.chunks, buf: this.buf });
      this.chunks = [];
      this.buf = [];
      return this;
    }
    /**
     * Join the last fork. Write its length and bytes, then
     * return to the previous state.
     */
    join() {
      let chunk = this.finish();
      let prev = this.stack.pop();
      if (!prev)
        throw new Error("invalid state, fork stack empty");
      this.chunks = prev.chunks;
      this.buf = prev.buf;
      this.uint32(chunk.byteLength);
      return this.raw(chunk);
    }
    /**
     * Writes a tag (field number and wire type).
     *
     * Equivalent to `uint32( (fieldNo << 3 | type) >>> 0 )`.
     *
     * Generated code should compute the tag ahead of time and call `uint32()`.
     */
    tag(fieldNo, type) {
      return this.uint32((fieldNo << 3 | type) >>> 0);
    }
    /**
     * Write a chunk of raw bytes.
     */
    raw(chunk) {
      if (this.buf.length) {
        this.chunks.push(new Uint8Array(this.buf));
        this.buf = [];
      }
      this.chunks.push(chunk);
      return this;
    }
    /**
     * Write a `uint32` value, an unsigned 32 bit varint.
     */
    uint32(value) {
      assertUInt32(value);
      while (value > 127) {
        this.buf.push(value & 127 | 128);
        value = value >>> 7;
      }
      this.buf.push(value);
      return this;
    }
    /**
     * Write a `int32` value, a signed 32 bit varint.
     */
    int32(value) {
      assertInt32(value);
      varint32write(value, this.buf);
      return this;
    }
    /**
     * Write a `bool` value, a variant.
     */
    bool(value) {
      this.buf.push(value ? 1 : 0);
      return this;
    }
    /**
     * Write a `bytes` value, length-delimited arbitrary data.
     */
    bytes(value) {
      this.uint32(value.byteLength);
      return this.raw(value);
    }
    /**
     * Write a `string` value, length-delimited data converted to UTF-8 text.
     */
    string(value) {
      let chunk = this.encodeUtf8(value);
      this.uint32(chunk.byteLength);
      return this.raw(chunk);
    }
    /**
     * Write a `float` value, 32-bit floating point number.
     */
    float(value) {
      assertFloat32(value);
      let chunk = new Uint8Array(4);
      new DataView(chunk.buffer).setFloat32(0, value, true);
      return this.raw(chunk);
    }
    /**
     * Write a `double` value, a 64-bit floating point number.
     */
    double(value) {
      let chunk = new Uint8Array(8);
      new DataView(chunk.buffer).setFloat64(0, value, true);
      return this.raw(chunk);
    }
    /**
     * Write a `fixed32` value, an unsigned, fixed-length 32-bit integer.
     */
    fixed32(value) {
      assertUInt32(value);
      let chunk = new Uint8Array(4);
      new DataView(chunk.buffer).setUint32(0, value, true);
      return this.raw(chunk);
    }
    /**
     * Write a `sfixed32` value, a signed, fixed-length 32-bit integer.
     */
    sfixed32(value) {
      assertInt32(value);
      let chunk = new Uint8Array(4);
      new DataView(chunk.buffer).setInt32(0, value, true);
      return this.raw(chunk);
    }
    /**
     * Write a `sint32` value, a signed, zigzag-encoded 32-bit varint.
     */
    sint32(value) {
      assertInt32(value);
      value = (value << 1 ^ value >> 31) >>> 0;
      varint32write(value, this.buf);
      return this;
    }
    /**
     * Write a `fixed64` value, a signed, fixed-length 64-bit integer.
     */
    sfixed64(value) {
      let chunk = new Uint8Array(8), view = new DataView(chunk.buffer), tc = protoInt64.enc(value);
      view.setInt32(0, tc.lo, true);
      view.setInt32(4, tc.hi, true);
      return this.raw(chunk);
    }
    /**
     * Write a `fixed64` value, an unsigned, fixed-length 64 bit integer.
     */
    fixed64(value) {
      let chunk = new Uint8Array(8), view = new DataView(chunk.buffer), tc = protoInt64.uEnc(value);
      view.setInt32(0, tc.lo, true);
      view.setInt32(4, tc.hi, true);
      return this.raw(chunk);
    }
    /**
     * Write a `int64` value, a signed 64-bit varint.
     */
    int64(value) {
      let tc = protoInt64.enc(value);
      varint64write(tc.lo, tc.hi, this.buf);
      return this;
    }
    /**
     * Write a `sint64` value, a signed, zig-zag-encoded 64-bit varint.
     */
    sint64(value) {
      const tc = protoInt64.enc(value), sign = tc.hi >> 31, lo = tc.lo << 1 ^ sign, hi = (tc.hi << 1 | tc.lo >>> 31) ^ sign;
      varint64write(lo, hi, this.buf);
      return this;
    }
    /**
     * Write a `uint64` value, an unsigned 64-bit varint.
     */
    uint64(value) {
      const tc = protoInt64.uEnc(value);
      varint64write(tc.lo, tc.hi, this.buf);
      return this;
    }
  };
  var BinaryReader = class {
    constructor(buf, decodeUtf8 = getTextEncoding().decodeUtf8) {
      this.decodeUtf8 = decodeUtf8;
      this.varint64 = varint64read;
      this.uint32 = varint32read;
      this.buf = buf;
      this.len = buf.length;
      this.pos = 0;
      this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    /**
     * Reads a tag - field number and wire type.
     */
    tag() {
      let tag = this.uint32(), fieldNo = tag >>> 3, wireType = tag & 7;
      if (fieldNo <= 0 || wireType < 0 || wireType > 5)
        throw new Error("illegal tag: field no " + fieldNo + " wire type " + wireType);
      return [fieldNo, wireType];
    }
    /**
     * Skip one element and return the skipped data.
     *
     * When skipping StartGroup, provide the tags field number to check for
     * matching field number in the EndGroup tag.
     */
    skip(wireType, fieldNo) {
      let start = this.pos;
      switch (wireType) {
        case WireType.Varint:
          while (this.buf[this.pos++] & 128) {
          }
          break;
        // @ts-ignore TS7029: Fallthrough case in switch -- ignore instead of expect-error for compiler settings without noFallthroughCasesInSwitch: true
        case WireType.Bit64:
          this.pos += 4;
        case WireType.Bit32:
          this.pos += 4;
          break;
        case WireType.LengthDelimited:
          let len = this.uint32();
          this.pos += len;
          break;
        case WireType.StartGroup:
          for (; ; ) {
            const [fn, wt] = this.tag();
            if (wt === WireType.EndGroup) {
              if (fieldNo !== void 0 && fn !== fieldNo) {
                throw new Error("invalid end group tag");
              }
              break;
            }
            this.skip(wt, fn);
          }
          break;
        default:
          throw new Error("cant skip wire type " + wireType);
      }
      this.assertBounds();
      return this.buf.subarray(start, this.pos);
    }
    /**
     * Throws error if position in byte array is out of range.
     */
    assertBounds() {
      if (this.pos > this.len)
        throw new RangeError("premature EOF");
    }
    /**
     * Read a `int32` field, a signed 32 bit varint.
     */
    int32() {
      return this.uint32() | 0;
    }
    /**
     * Read a `sint32` field, a signed, zigzag-encoded 32-bit varint.
     */
    sint32() {
      let zze = this.uint32();
      return zze >>> 1 ^ -(zze & 1);
    }
    /**
     * Read a `int64` field, a signed 64-bit varint.
     */
    int64() {
      return protoInt64.dec(...this.varint64());
    }
    /**
     * Read a `uint64` field, an unsigned 64-bit varint.
     */
    uint64() {
      return protoInt64.uDec(...this.varint64());
    }
    /**
     * Read a `sint64` field, a signed, zig-zag-encoded 64-bit varint.
     */
    sint64() {
      let [lo, hi] = this.varint64();
      let s = -(lo & 1);
      lo = (lo >>> 1 | (hi & 1) << 31) ^ s;
      hi = hi >>> 1 ^ s;
      return protoInt64.dec(lo, hi);
    }
    /**
     * Read a `bool` field, a variant.
     */
    bool() {
      let [lo, hi] = this.varint64();
      return lo !== 0 || hi !== 0;
    }
    /**
     * Read a `fixed32` field, an unsigned, fixed-length 32-bit integer.
     */
    fixed32() {
      return this.view.getUint32((this.pos += 4) - 4, true);
    }
    /**
     * Read a `sfixed32` field, a signed, fixed-length 32-bit integer.
     */
    sfixed32() {
      return this.view.getInt32((this.pos += 4) - 4, true);
    }
    /**
     * Read a `fixed64` field, an unsigned, fixed-length 64 bit integer.
     */
    fixed64() {
      return protoInt64.uDec(this.sfixed32(), this.sfixed32());
    }
    /**
     * Read a `fixed64` field, a signed, fixed-length 64-bit integer.
     */
    sfixed64() {
      return protoInt64.dec(this.sfixed32(), this.sfixed32());
    }
    /**
     * Read a `float` field, 32-bit floating point number.
     */
    float() {
      return this.view.getFloat32((this.pos += 4) - 4, true);
    }
    /**
     * Read a `double` field, a 64-bit floating point number.
     */
    double() {
      return this.view.getFloat64((this.pos += 8) - 8, true);
    }
    /**
     * Read a `bytes` field, length-delimited arbitrary data.
     */
    bytes() {
      let len = this.uint32(), start = this.pos;
      this.pos += len;
      this.assertBounds();
      return this.buf.subarray(start, start + len);
    }
    /**
     * Read a `string` field, length-delimited data converted to UTF-8 text.
     */
    string() {
      return this.decodeUtf8(this.bytes());
    }
  };
  function assertInt32(arg) {
    if (typeof arg == "string") {
      arg = Number(arg);
    } else if (typeof arg != "number") {
      throw new Error("invalid int32: " + typeof arg);
    }
    if (!Number.isInteger(arg) || arg > INT32_MAX || arg < INT32_MIN)
      throw new Error("invalid int32: " + arg);
  }
  function assertUInt32(arg) {
    if (typeof arg == "string") {
      arg = Number(arg);
    } else if (typeof arg != "number") {
      throw new Error("invalid uint32: " + typeof arg);
    }
    if (!Number.isInteger(arg) || arg > UINT32_MAX || arg < 0)
      throw new Error("invalid uint32: " + arg);
  }
  function assertFloat32(arg) {
    if (typeof arg == "string") {
      const o = arg;
      arg = Number(arg);
      if (Number.isNaN(arg) && o !== "NaN") {
        throw new Error("invalid float32: " + o);
      }
    } else if (typeof arg != "number") {
      throw new Error("invalid float32: " + typeof arg);
    }
    if (Number.isFinite(arg) && (arg > FLOAT32_MAX || arg < FLOAT32_MIN))
      throw new Error("invalid float32: " + arg);
  }

  // ../../../packages/rpc-core/dist/frame.js
  var FrameType;
  (function(FrameType2) {
    FrameType2[FrameType2["UNSPECIFIED"] = 0] = "UNSPECIFIED";
    FrameType2[FrameType2["OPEN"] = 2] = "OPEN";
    FrameType2[FrameType2["MESSAGE"] = 3] = "MESSAGE";
    FrameType2[FrameType2["HALF_CLOSE"] = 4] = "HALF_CLOSE";
    FrameType2[FrameType2["CLOSE"] = 5] = "CLOSE";
    FrameType2[FrameType2["CANCEL"] = 6] = "CANCEL";
    FrameType2[FrameType2["ERROR"] = 7] = "ERROR";
  })(FrameType || (FrameType = {}));
  var FIELD_TYPE = 1;
  var FIELD_STREAM_ID = 2;
  var FIELD_PAYLOAD = 4;
  var FIELD_METHOD = 15;
  var FIELD_ERROR_CODE = 20;
  var FIELD_ERROR_MESSAGE = 21;
  function encodeFrame(frame) {
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
    if (frame.type === FrameType.ERROR && frame.errorCode !== void 0) {
      w.tag(FIELD_ERROR_CODE, WireType.Varint).uint32(frame.errorCode);
    }
    if (frame.errorMessage) {
      w.tag(FIELD_ERROR_MESSAGE, WireType.LengthDelimited).string(frame.errorMessage);
    }
    return w.finish();
  }
  function decodeFrame(data) {
    const r = new BinaryReader(data);
    const frame = {
      type: FrameType.UNSPECIFIED,
      streamId: 0
    };
    while (r.pos < r.len) {
      const [fieldNumber, wireType] = r.tag();
      switch (fieldNumber) {
        case FIELD_TYPE:
          frame.type = r.uint32();
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
  function createOpenFrame(streamId, method) {
    return {
      type: FrameType.OPEN,
      streamId,
      method
    };
  }
  function createMessageFrame(streamId, payload) {
    return {
      type: FrameType.MESSAGE,
      streamId,
      payload
    };
  }
  function createHalfCloseFrame(streamId) {
    return {
      type: FrameType.HALF_CLOSE,
      streamId
    };
  }
  function createCancelFrame(streamId) {
    return {
      type: FrameType.CANCEL,
      streamId
    };
  }

  // ../../../packages/rpc-core/dist/types.js
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

  // ../../../packages/rpc-core/dist/transport.js
  var FrameEncoding;
  (function(FrameEncoding2) {
    FrameEncoding2["BINARY"] = "binary";
    FrameEncoding2["BASE64"] = "base64";
    FrameEncoding2["STRUCTURED_CLONE"] = "structured_clone";
  })(FrameEncoding || (FrameEncoding = {}));
  var MessageTransportBase = class {
    encoding;
    frameHandlers = [];
    errorHandlers = [];
    closeHandlers = [];
    logger;
    _isOpen = true;
    constructor(encoding = FrameEncoding.BINARY, logger) {
      this.encoding = encoding;
      this.logger = logger ?? silentLogger;
    }
    get isOpen() {
      return this._isOpen;
    }
    send(frame) {
      if (!this._isOpen) {
        throw new Error("Transport is closed");
      }
      if (this.encoding === FrameEncoding.STRUCTURED_CLONE) {
        this.logger.debug(`TX frame type=${frame.type} stream=${frame.streamId} method=${frame.method ?? "-"} (structured clone)`);
        this.sendRaw(frame);
        return;
      }
      const encoded = encodeFrame(frame);
      this.logger.debug(`TX frame type=${frame.type} stream=${frame.streamId} method=${frame.method ?? "-"} (${encoded.length} bytes)`);
      if (this.encoding === FrameEncoding.BASE64) {
        this.sendRaw(uint8ArrayToBase64(encoded));
      } else {
        this.sendRaw(encoded);
      }
    }
    /** Call this from subclass when raw data arrives from the peer. */
    handleRawMessage(data) {
      try {
        if (this.encoding === FrameEncoding.STRUCTURED_CLONE && typeof data === "object" && !(data instanceof Uint8Array) && !(data instanceof ArrayBuffer)) {
          const frame2 = data;
          this.logger.debug(`RX frame type=${frame2.type} stream=${frame2.streamId} method=${frame2.method ?? "-"} (structured clone)`);
          this.dispatchFrame(frame2);
          return;
        }
        let bytes;
        if (typeof data === "string") {
          bytes = base64ToUint8Array(data);
        } else if (data instanceof ArrayBuffer) {
          bytes = new Uint8Array(data);
        } else {
          bytes = data;
        }
        const frame = decodeFrame(bytes);
        this.logger.debug(`RX frame type=${frame.type} stream=${frame.streamId} method=${frame.method ?? "-"} (${bytes.length} bytes)`);
        this.dispatchFrame(frame);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error("Failed to decode frame:", error);
        this.emitError(error);
      }
    }
    dispatchFrame(frame) {
      const handlers = [...this.frameHandlers];
      for (const handler of handlers) {
        try {
          handler(frame);
        } catch (err) {
          this.logger.error("Frame handler error:", err);
        }
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

  // ../../../packages/rpc-core/dist/errors.js
  var RpcStatusCode;
  (function(RpcStatusCode2) {
    RpcStatusCode2[RpcStatusCode2["OK"] = 0] = "OK";
    RpcStatusCode2[RpcStatusCode2["CANCELLED"] = 1] = "CANCELLED";
    RpcStatusCode2[RpcStatusCode2["INVALID_ARGUMENT"] = 3] = "INVALID_ARGUMENT";
    RpcStatusCode2[RpcStatusCode2["DEADLINE_EXCEEDED"] = 4] = "DEADLINE_EXCEEDED";
    RpcStatusCode2[RpcStatusCode2["UNIMPLEMENTED"] = 12] = "UNIMPLEMENTED";
    RpcStatusCode2[RpcStatusCode2["INTERNAL"] = 13] = "INTERNAL";
  })(RpcStatusCode || (RpcStatusCode = {}));
  var RpcError = class _RpcError extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.name = "RpcError";
      this.code = code;
      Object.setPrototypeOf(this, _RpcError.prototype);
    }
    get codeName() {
      return RpcStatusCode[this.code] ?? `UNKNOWN(${this.code})`;
    }
    toString() {
      return `RpcError: [${this.codeName}] ${this.message}`;
    }
    static fromFrame(errorCode, errorMessage) {
      const code = errorCode in RpcStatusCode ? errorCode : RpcStatusCode.INTERNAL;
      return new _RpcError(code, errorMessage);
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

  // ../../../packages/rpc-core/dist/stream.js
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
    constructor(streamId) {
      this.streamId = streamId;
    }
    get state() {
      return this._state;
    }
    get signal() {
      return this.abortController.signal;
    }
    setState(newState) {
      this._state = newState;
    }
    open() {
      this._state = StreamState.OPEN;
    }
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
    pushEnd() {
      const item = { type: "end" };
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(item);
      } else {
        this.queue.push(item);
      }
    }
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
    cancel(reason) {
      if (this._state === StreamState.CLOSED || this._state === StreamState.ERROR || this._state === StreamState.CANCELLED) {
        return;
      }
      this._state = StreamState.CANCELLED;
      const err = new CancelledError(reason ?? "Stream cancelled");
      this.abortController.abort(err);
      this.pushError(err);
    }
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
    nextItem() {
      if (this.queue.length > 0) {
        return Promise.resolve(this.queue.shift());
      }
      return new Promise((resolve) => {
        this.waiter = resolve;
      });
    }
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
    createStream() {
      const id = this.nextStreamId;
      this.nextStreamId += 2;
      const stream = new Stream(id);
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

  // ../../../packages/rpc-core/dist/client.js
  var RpcClient = class {
    transport;
    streams;
    logger;
    defaultDeadlineMs;
    closed = false;
    constructor(options) {
      this.transport = options.transport;
      this.logger = options.logger ?? silentLogger;
      this.streams = new StreamManager(true);
      this.defaultDeadlineMs = options.defaultDeadlineMs ?? 0;
      this.transport.onFrame((frame) => this.handleFrame(frame));
      this.transport.onError((err) => this.handleTransportError(err));
      this.transport.onClose(() => this.handleTransportClose());
    }
    close() {
      if (this.closed)
        return;
      this.closed = true;
      this.streams.cancelAll("Client closed");
      this.transport.close();
    }
    async unary(method, requestBytes, options) {
      this.ensureOpen();
      const stream = this.streams.createStream();
      const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
      const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);
      try {
        this.transport.send(createOpenFrame(stream.streamId, method));
        stream.open();
        this.transport.send(createMessageFrame(stream.streamId, requestBytes));
        this.transport.send(createHalfCloseFrame(stream.streamId));
        stream.setState(StreamState.HALF_CLOSED_LOCAL);
        return await stream.collectUnary();
      } catch (err) {
        this.cancelStream(stream);
        throw err;
      } finally {
        cleanup();
        this.streams.removeStream(stream.streamId);
      }
    }
    async *serverStream(method, requestBytes, options) {
      this.ensureOpen();
      const stream = this.streams.createStream();
      const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
      const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);
      try {
        this.transport.send(createOpenFrame(stream.streamId, method));
        stream.open();
        this.transport.send(createMessageFrame(stream.streamId, requestBytes));
        this.transport.send(createHalfCloseFrame(stream.streamId));
        stream.setState(StreamState.HALF_CLOSED_LOCAL);
        for await (const msg of stream.messages()) {
          yield msg;
        }
      } catch (err) {
        this.cancelStream(stream);
        throw err;
      } finally {
        cleanup();
        this.streams.removeStream(stream.streamId);
      }
    }
    async clientStream(method, requests, options) {
      this.ensureOpen();
      const stream = this.streams.createStream();
      const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
      const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);
      try {
        this.transport.send(createOpenFrame(stream.streamId, method));
        stream.open();
        for await (const reqBytes of requests) {
          if (stream.state === StreamState.CANCELLED || stream.state === StreamState.ERROR) {
            break;
          }
          this.transport.send(createMessageFrame(stream.streamId, reqBytes));
        }
        this.transport.send(createHalfCloseFrame(stream.streamId));
        stream.setState(StreamState.HALF_CLOSED_LOCAL);
        return await stream.collectUnary();
      } catch (err) {
        this.cancelStream(stream);
        throw err;
      } finally {
        cleanup();
        this.streams.removeStream(stream.streamId);
      }
    }
    bidiStream(method, requests, options) {
      const self = this;
      return (async function* () {
        self.ensureOpen();
        const stream = self.streams.createStream();
        const deadlineMs = options?.deadlineMs ?? self.defaultDeadlineMs;
        const cleanup = self.setupCancellation(stream, options?.signal, deadlineMs);
        try {
          self.transport.send(createOpenFrame(stream.streamId, method));
          stream.open();
          const sendDone = (async () => {
            try {
              for await (const reqBytes of requests) {
                if (stream.state === StreamState.CANCELLED || stream.state === StreamState.ERROR) {
                  break;
                }
                self.transport.send(createMessageFrame(stream.streamId, reqBytes));
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
    handleFrame(frame) {
      const stream = this.streams.getStream(frame.streamId);
      if (!stream) {
        this.logger.warn(`Received frame for unknown stream ${frame.streamId}, type=${frame.type}`);
        return;
      }
      switch (frame.type) {
        case FrameType.MESSAGE:
          stream.pushMessage(frame.payload ?? new Uint8Array(0));
          break;
        case FrameType.CLOSE:
          stream.setState(StreamState.CLOSED);
          stream.pushEnd();
          break;
        case FrameType.ERROR:
          stream.setState(StreamState.ERROR);
          stream.pushError(RpcError.fromFrame(frame.errorCode ?? RpcStatusCode.INTERNAL, frame.errorMessage ?? "Unknown error"));
          break;
        case FrameType.HALF_CLOSE:
          if (stream.state === StreamState.HALF_CLOSED_LOCAL) {
            stream.setState(StreamState.HALF_CLOSED_BOTH);
          } else {
            stream.setState(StreamState.HALF_CLOSED_REMOTE);
          }
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
    ensureOpen() {
      if (this.closed) {
        throw new RpcError(RpcStatusCode.INTERNAL, "Client is closed");
      }
      if (!this.transport.isOpen) {
        throw new RpcError(RpcStatusCode.INTERNAL, "Transport is not open");
      }
    }
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

  // ../../../packages/transport-ios/dist/wkwebview-transport.js
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

  // src/bootstrap.ts
  var transport = new WKWebViewTransport({
    logger: createConsoleLogger("iOS-Transport")
  });
  var client = new RpcClient({
    transport,
    logger: createConsoleLogger("Guest-Client")
  });
  window.__rpcBridgeBoot(client);
})();
//# sourceMappingURL=bootstrap.js.map
