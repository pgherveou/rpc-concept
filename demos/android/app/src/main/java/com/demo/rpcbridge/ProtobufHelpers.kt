/**
 * Protobuf wire-format encoding/decoding helpers for RPC bridge frames.
 *
 * This is a hand-rolled encoder/decoder that is wire-compatible with the
 * TypeScript ProtoWriter/ProtoReader in @rpc-bridge/core. It avoids requiring
 * a full protobuf runtime dependency while remaining compatible with
 * protobuf-generated parsers.
 *
 * Field numbers match proto/rpc/bridge/v1/frame.proto exactly.
 */
package com.demo.rpcbridge

import android.util.Base64

// ---------------------------------------------------------------------------
// Frame type enum (mirrors FrameType in frame.proto)
// ---------------------------------------------------------------------------

object FrameType {
    const val UNSPECIFIED = 0
    const val HANDSHAKE = 1
    const val OPEN = 2
    const val MESSAGE = 3
    const val HALF_CLOSE = 4
    const val CLOSE = 5
    const val CANCEL = 6
    const val ERROR = 7
    const val REQUEST_N = 8
}

// ---------------------------------------------------------------------------
// Method type enum (mirrors MethodType in frame.proto)
// ---------------------------------------------------------------------------

object MethodType {
    const val UNSPECIFIED = 0
    const val UNARY = 1
    const val SERVER_STREAMING = 2
    const val CLIENT_STREAMING = 3
    const val BIDI_STREAMING = 4
}

// ---------------------------------------------------------------------------
// RpcFrame data class (mirrors the proto RpcFrame message)
// ---------------------------------------------------------------------------

data class RpcFrame(
    val type: Int = FrameType.UNSPECIFIED,
    val streamId: Int = 0,
    val sequence: Int = 0,

    // MESSAGE payload
    val payload: ByteArray? = null,

    // Key-value metadata
    val metadata: MutableMap<String, String>? = null,

    // Bitfield flags
    val flags: Int = 0,

    // HANDSHAKE fields
    val protocolVersion: Int = 0,
    val capabilities: List<String>? = null,
    val implementationId: String? = null,

    // OPEN fields
    val method: String? = null,
    val deadlineMs: Long = 0,
    val methodType: Int = MethodType.UNSPECIFIED,

    // ERROR fields
    val errorCode: Int = 0,
    val errorMessage: String? = null,
    val errorDetails: ByteArray? = null,

    // REQUEST_N fields
    val requestN: Int = 0,

    // CLOSE trailers
    val trailers: MutableMap<String, String>? = null,

    // Extensions
    val extensions: MutableMap<String, ByteArray>? = null,
) {
    // Override equals/hashCode because of ByteArray fields.
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is RpcFrame) return false
        return type == other.type &&
            streamId == other.streamId &&
            sequence == other.sequence &&
            payload.contentEqualsNullable(other.payload) &&
            metadata == other.metadata &&
            flags == other.flags &&
            protocolVersion == other.protocolVersion &&
            capabilities == other.capabilities &&
            implementationId == other.implementationId &&
            method == other.method &&
            deadlineMs == other.deadlineMs &&
            methodType == other.methodType &&
            errorCode == other.errorCode &&
            errorMessage == other.errorMessage &&
            errorDetails.contentEqualsNullable(other.errorDetails) &&
            requestN == other.requestN &&
            trailers == other.trailers
    }

    override fun hashCode(): Int {
        var result = type
        result = 31 * result + streamId
        result = 31 * result + sequence
        result = 31 * result + (payload?.contentHashCode() ?: 0)
        result = 31 * result + (metadata?.hashCode() ?: 0)
        result = 31 * result + flags
        result = 31 * result + protocolVersion
        return result
    }
}

private fun ByteArray?.contentEqualsNullable(other: ByteArray?): Boolean {
    if (this == null && other == null) return true
    if (this == null || other == null) return false
    return this.contentEquals(other)
}

// ---------------------------------------------------------------------------
// Proto field numbers (match frame.proto)
// ---------------------------------------------------------------------------

private const val FIELD_TYPE = 1
private const val FIELD_STREAM_ID = 2
private const val FIELD_SEQUENCE = 3
private const val FIELD_PAYLOAD = 4
private const val FIELD_METADATA = 5
private const val FIELD_FLAGS = 6
private const val FIELD_PROTOCOL_VERSION = 10
private const val FIELD_CAPABILITIES = 11
private const val FIELD_IMPLEMENTATION_ID = 12
private const val FIELD_METHOD = 15
private const val FIELD_DEADLINE_MS = 16
private const val FIELD_METHOD_TYPE = 17
private const val FIELD_ERROR_CODE = 20
private const val FIELD_ERROR_MESSAGE = 21
private const val FIELD_ERROR_DETAILS = 22
private const val FIELD_REQUEST_N = 25
private const val FIELD_TRAILERS = 30
private const val FIELD_EXTENSIONS = 100

// Protobuf wire types
private const val WIRE_VARINT = 0
private const val WIRE_64BIT = 1
private const val WIRE_LENGTH_DELIMITED = 2
private const val WIRE_32BIT = 5

// ---------------------------------------------------------------------------
// ProtoWriter: encodes protobuf wire format
// ---------------------------------------------------------------------------

class ProtoWriter {
    private val buffer = mutableListOf<Byte>()

    /** Write a tag (field number + wire type). */
    private fun writeTag(fieldNumber: Int, wireType: Int) {
        writeVarint((fieldNumber shl 3) or wireType)
    }

    /** Write a varint (unsigned LEB128). */
    fun writeVarint(value: Long) {
        var v = value
        while (v > 0x7F) {
            buffer.add(((v and 0x7F) or 0x80).toByte())
            v = v ushr 7
        }
        buffer.add((v and 0x7F).toByte())
    }

    /** Write a varint from an Int. */
    fun writeVarint(value: Int) = writeVarint(value.toLong())

    /** Write a varint field (tag + varint). */
    fun writeVarintField(fieldNumber: Int, value: Int) {
        writeTag(fieldNumber, WIRE_VARINT)
        writeVarint(value)
    }

    /** Write a varint field (tag + varint) for Long values. */
    fun writeVarintField(fieldNumber: Int, value: Long) {
        writeTag(fieldNumber, WIRE_VARINT)
        writeVarint(value)
    }

    /** Write raw bytes into the buffer. */
    fun writeRawBytes(data: ByteArray) {
        for (b in data) buffer.add(b)
    }

    /** Write a bytes field (tag + length + raw bytes). */
    fun writeBytesField(fieldNumber: Int, value: ByteArray) {
        writeTag(fieldNumber, WIRE_LENGTH_DELIMITED)
        writeVarint(value.size)
        writeRawBytes(value)
    }

    /** Write a string field (tag + length + UTF-8 bytes). */
    fun writeStringField(fieldNumber: Int, value: String) {
        writeBytesField(fieldNumber, value.toByteArray(Charsets.UTF_8))
    }

    /** Write a length-delimited field from a sub-writer's output. */
    fun writeLengthDelimitedField(fieldNumber: Int, data: ByteArray) {
        writeTag(fieldNumber, WIRE_LENGTH_DELIMITED)
        writeVarint(data.size)
        writeRawBytes(data)
    }

    /** Return the accumulated bytes. */
    fun finish(): ByteArray = buffer.toByteArray()
}

// ---------------------------------------------------------------------------
// ProtoReader: decodes protobuf wire format
// ---------------------------------------------------------------------------

class ProtoReader(private val data: ByteArray) {
    private var offset = 0

    /** Whether there are more bytes to read. */
    fun hasMore(): Boolean = offset < data.size

    /** Read a varint (unsigned LEB128) and return as Int. */
    fun readVarintInt(): Int = readVarintLong().toInt()

    /** Read a varint (unsigned LEB128) and return as Long. */
    fun readVarintLong(): Long {
        var result = 0L
        var shift = 0
        while (offset < data.size) {
            val b = data[offset++].toInt() and 0xFF
            result = result or ((b.toLong() and 0x7F) shl shift)
            if (b and 0x80 == 0) return result
            shift += 7
            if (shift > 63) throw IllegalStateException("Varint too long")
        }
        throw IllegalStateException("Unexpected end of data reading varint")
    }

    /** Read a tag and return it as a raw Int. */
    fun readTag(): Int = readVarintInt()

    /** Read a length-delimited byte array. */
    fun readBytes(): ByteArray {
        val length = readVarintInt()
        if (offset + length > data.size) {
            throw IllegalStateException("Unexpected end of data reading bytes")
        }
        val result = data.copyOfRange(offset, offset + length)
        offset += length
        return result
    }

    /** Read a length-delimited UTF-8 string. */
    fun readString(): String = readBytes().toString(Charsets.UTF_8)

    /** Skip an unknown field based on its wire type. */
    fun skipField(wireType: Int) {
        when (wireType) {
            WIRE_VARINT -> readVarintLong()
            WIRE_64BIT -> offset += 8
            WIRE_LENGTH_DELIMITED -> readBytes() // reads and discards
            WIRE_32BIT -> offset += 4
            else -> throw IllegalStateException("Unknown wire type: $wireType")
        }
    }

    /** Create a sub-reader from the next length-delimited field. */
    fun subReader(): ProtoReader = ProtoReader(readBytes())
}

// ---------------------------------------------------------------------------
// Frame encoding
// ---------------------------------------------------------------------------

fun encodeFrame(frame: RpcFrame): ByteArray {
    val writer = ProtoWriter()

    if (frame.type != FrameType.UNSPECIFIED) {
        writer.writeVarintField(FIELD_TYPE, frame.type)
    }
    if (frame.streamId != 0) {
        writer.writeVarintField(FIELD_STREAM_ID, frame.streamId)
    }
    if (frame.sequence != 0) {
        writer.writeVarintField(FIELD_SEQUENCE, frame.sequence)
    }
    frame.payload?.let { payload ->
        if (payload.isNotEmpty()) {
            writer.writeBytesField(FIELD_PAYLOAD, payload)
        }
    }
    frame.metadata?.let { map ->
        writeStringMap(writer, FIELD_METADATA, map)
    }
    if (frame.flags != 0) {
        writer.writeVarintField(FIELD_FLAGS, frame.flags)
    }
    if (frame.protocolVersion != 0) {
        writer.writeVarintField(FIELD_PROTOCOL_VERSION, frame.protocolVersion)
    }
    frame.capabilities?.forEach { cap ->
        writer.writeStringField(FIELD_CAPABILITIES, cap)
    }
    frame.implementationId?.let { id ->
        writer.writeStringField(FIELD_IMPLEMENTATION_ID, id)
    }
    frame.method?.let { m ->
        writer.writeStringField(FIELD_METHOD, m)
    }
    if (frame.deadlineMs != 0L) {
        writer.writeVarintField(FIELD_DEADLINE_MS, frame.deadlineMs)
    }
    if (frame.methodType != MethodType.UNSPECIFIED) {
        writer.writeVarintField(FIELD_METHOD_TYPE, frame.methodType)
    }
    if (frame.errorCode != 0) {
        writer.writeVarintField(FIELD_ERROR_CODE, frame.errorCode)
    }
    frame.errorMessage?.let { msg ->
        writer.writeStringField(FIELD_ERROR_MESSAGE, msg)
    }
    frame.errorDetails?.let { details ->
        if (details.isNotEmpty()) {
            writer.writeBytesField(FIELD_ERROR_DETAILS, details)
        }
    }
    if (frame.requestN != 0) {
        writer.writeVarintField(FIELD_REQUEST_N, frame.requestN)
    }
    frame.trailers?.let { map ->
        writeStringMap(writer, FIELD_TRAILERS, map)
    }
    frame.extensions?.forEach { (key, value) ->
        writeBytesMapEntry(writer, FIELD_EXTENSIONS, key, value)
    }

    return writer.finish()
}

// ---------------------------------------------------------------------------
// Frame decoding
// ---------------------------------------------------------------------------

fun decodeFrame(data: ByteArray): RpcFrame {
    val reader = ProtoReader(data)

    var type = FrameType.UNSPECIFIED
    var streamId = 0
    var sequence = 0
    var payload: ByteArray? = null
    var metadata: MutableMap<String, String>? = null
    var flags = 0
    var protocolVersion = 0
    var capabilities: MutableList<String>? = null
    var implementationId: String? = null
    var method: String? = null
    var deadlineMs = 0L
    var methodType = MethodType.UNSPECIFIED
    var errorCode = 0
    var errorMessage: String? = null
    var errorDetails: ByteArray? = null
    var requestN = 0
    var trailers: MutableMap<String, String>? = null
    var extensions: MutableMap<String, ByteArray>? = null

    while (reader.hasMore()) {
        val tag = reader.readTag()
        val fieldNumber = tag ushr 3
        val wireType = tag and 0x7

        when (fieldNumber) {
            FIELD_TYPE -> type = reader.readVarintInt()
            FIELD_STREAM_ID -> streamId = reader.readVarintInt()
            FIELD_SEQUENCE -> sequence = reader.readVarintInt()
            FIELD_PAYLOAD -> payload = reader.readBytes()
            FIELD_METADATA -> {
                if (metadata == null) metadata = mutableMapOf()
                val (k, v) = readStringMapEntry(reader)
                metadata[k] = v
            }
            FIELD_FLAGS -> flags = reader.readVarintInt()
            FIELD_PROTOCOL_VERSION -> protocolVersion = reader.readVarintInt()
            FIELD_CAPABILITIES -> {
                if (capabilities == null) capabilities = mutableListOf()
                capabilities.add(reader.readString())
            }
            FIELD_IMPLEMENTATION_ID -> implementationId = reader.readString()
            FIELD_METHOD -> method = reader.readString()
            FIELD_DEADLINE_MS -> deadlineMs = reader.readVarintLong()
            FIELD_METHOD_TYPE -> methodType = reader.readVarintInt()
            FIELD_ERROR_CODE -> errorCode = reader.readVarintInt()
            FIELD_ERROR_MESSAGE -> errorMessage = reader.readString()
            FIELD_ERROR_DETAILS -> errorDetails = reader.readBytes()
            FIELD_REQUEST_N -> requestN = reader.readVarintInt()
            FIELD_TRAILERS -> {
                if (trailers == null) trailers = mutableMapOf()
                val (k, v) = readStringMapEntry(reader)
                trailers[k] = v
            }
            FIELD_EXTENSIONS -> {
                if (extensions == null) extensions = mutableMapOf()
                val (k, v) = readBytesMapEntry(reader)
                extensions[k] = v
            }
            else -> reader.skipField(wireType) // Forward compatibility
        }
    }

    return RpcFrame(
        type = type,
        streamId = streamId,
        sequence = sequence,
        payload = payload,
        metadata = metadata,
        flags = flags,
        protocolVersion = protocolVersion,
        capabilities = capabilities,
        implementationId = implementationId,
        method = method,
        deadlineMs = deadlineMs,
        methodType = methodType,
        errorCode = errorCode,
        errorMessage = errorMessage,
        errorDetails = errorDetails,
        requestN = requestN,
        trailers = trailers,
        extensions = extensions,
    )
}

// ---------------------------------------------------------------------------
// Map encoding/decoding helpers (protobuf map<string,string> wire format)
// ---------------------------------------------------------------------------

/** Encode a string-to-string map as repeated length-delimited entries. */
private fun writeStringMap(writer: ProtoWriter, fieldNumber: Int, map: Map<String, String>) {
    for ((key, value) in map) {
        val entryWriter = ProtoWriter()
        entryWriter.writeStringField(1, key)   // map key field = 1
        entryWriter.writeStringField(2, value)  // map value field = 2
        writer.writeLengthDelimitedField(fieldNumber, entryWriter.finish())
    }
}

/** Decode one map<string,string> entry. */
private fun readStringMapEntry(reader: ProtoReader): Pair<String, String> {
    val sub = reader.subReader()
    var key = ""
    var value = ""
    while (sub.hasMore()) {
        val tag = sub.readTag()
        val field = tag ushr 3
        when (field) {
            1 -> key = sub.readString()
            2 -> value = sub.readString()
            else -> sub.skipField(tag and 0x7)
        }
    }
    return key to value
}

/** Encode one map<string,bytes> entry. */
private fun writeBytesMapEntry(
    writer: ProtoWriter,
    fieldNumber: Int,
    key: String,
    value: ByteArray,
) {
    val entryWriter = ProtoWriter()
    entryWriter.writeStringField(1, key)
    entryWriter.writeBytesField(2, value)
    writer.writeLengthDelimitedField(fieldNumber, entryWriter.finish())
}

/** Decode one map<string,bytes> entry. */
private fun readBytesMapEntry(reader: ProtoReader): Pair<String, ByteArray> {
    val sub = reader.subReader()
    var key = ""
    var value = ByteArray(0)
    while (sub.hasMore()) {
        val tag = sub.readTag()
        val field = tag ushr 3
        when (field) {
            1 -> key = sub.readString()
            2 -> value = sub.readBytes()
            else -> sub.skipField(tag and 0x7)
        }
    }
    return key to value
}

// ---------------------------------------------------------------------------
// Base64 helpers (using android.util.Base64)
// ---------------------------------------------------------------------------

/** Encode a byte array to a base64 string (no wrapping, no padding). */
fun encodeBase64(data: ByteArray): String =
    Base64.encodeToString(data, Base64.NO_WRAP)

/** Decode a base64 string to a byte array. */
fun decodeBase64(base64: String): ByteArray =
    Base64.decode(base64, Base64.NO_WRAP)

// ---------------------------------------------------------------------------
// Convenience: encode frame to base64 and decode frame from base64
// ---------------------------------------------------------------------------

/** Encode an RpcFrame to a base64 string ready for WebView transport. */
fun encodeFrameToBase64(frame: RpcFrame): String =
    encodeBase64(encodeFrame(frame))

/** Decode a base64 string received from WebView into an RpcFrame. */
fun decodeFrameFromBase64(base64: String): RpcFrame =
    decodeFrame(decodeBase64(base64))

// ---------------------------------------------------------------------------
// Frame factory helpers
// ---------------------------------------------------------------------------

fun createHandshakeFrame(
    protocolVersion: Int,
    capabilities: List<String>,
    implementationId: String,
): RpcFrame = RpcFrame(
    type = FrameType.HANDSHAKE,
    streamId = 0,
    sequence = 0,
    protocolVersion = protocolVersion,
    capabilities = capabilities,
    implementationId = implementationId,
)

fun createMessageFrame(
    streamId: Int,
    sequence: Int,
    payload: ByteArray,
): RpcFrame = RpcFrame(
    type = FrameType.MESSAGE,
    streamId = streamId,
    sequence = sequence,
    payload = payload,
)

fun createCloseFrame(
    streamId: Int,
    trailers: MutableMap<String, String>? = null,
): RpcFrame = RpcFrame(
    type = FrameType.CLOSE,
    streamId = streamId,
    trailers = trailers,
)

fun createHalfCloseFrame(streamId: Int): RpcFrame = RpcFrame(
    type = FrameType.HALF_CLOSE,
    streamId = streamId,
)

fun createErrorFrame(
    streamId: Int,
    errorCode: Int,
    errorMessage: String,
    errorDetails: ByteArray? = null,
): RpcFrame = RpcFrame(
    type = FrameType.ERROR,
    streamId = streamId,
    errorCode = errorCode,
    errorMessage = errorMessage,
    errorDetails = errorDetails,
)

fun createRequestNFrame(streamId: Int, n: Int): RpcFrame = RpcFrame(
    type = FrameType.REQUEST_N,
    streamId = streamId,
    requestN = n,
)
