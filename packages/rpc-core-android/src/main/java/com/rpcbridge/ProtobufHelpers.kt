@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package com.rpcbridge

import android.util.Base64
import kotlinx.serialization.Serializable
import kotlinx.serialization.protobuf.ProtoBuf
import kotlinx.serialization.protobuf.ProtoNumber

// ---------------------------------------------------------------------------
// Frame type constants (mirrors FrameType in frame.proto)
// ---------------------------------------------------------------------------

object FrameType {
    const val UNSPECIFIED = 0
    const val OPEN = 2
    const val MESSAGE = 3
    const val HALF_CLOSE = 4
    const val CLOSE = 5
    const val CANCEL = 6
    const val ERROR = 7
}

// ---------------------------------------------------------------------------
// RpcFrame data class (mirrors the proto RpcFrame message)
// ---------------------------------------------------------------------------

@Serializable
data class RpcFrame(
    @ProtoNumber(1) val type: Int = FrameType.UNSPECIFIED,
    @ProtoNumber(2) val streamId: Int = 0,
    @ProtoNumber(4) val payload: ByteArray? = null,
    @ProtoNumber(15) val method: String? = null,
    @ProtoNumber(20) val errorCode: Int = 0,
    @ProtoNumber(21) val errorMessage: String? = null,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is RpcFrame) return false
        return type == other.type &&
            streamId == other.streamId &&
            payload.contentEqualsNullable(other.payload) &&
            method == other.method &&
            errorCode == other.errorCode &&
            errorMessage == other.errorMessage
    }

    override fun hashCode(): Int {
        var result = type
        result = 31 * result + streamId
        result = 31 * result + (payload?.contentHashCode() ?: 0)
        result = 31 * result + (method?.hashCode() ?: 0)
        result = 31 * result + errorCode
        result = 31 * result + (errorMessage?.hashCode() ?: 0)
        return result
    }
}

private fun ByteArray?.contentEqualsNullable(other: ByteArray?): Boolean {
    if (this == null && other == null) return true
    if (this == null || other == null) return false
    return this.contentEquals(other)
}

// ---------------------------------------------------------------------------
// Frame encoding / decoding
// ---------------------------------------------------------------------------

fun encodeFrame(frame: RpcFrame): ByteArray =
    ProtoBuf.encodeToByteArray(RpcFrame.serializer(), frame)

fun decodeFrame(data: ByteArray): RpcFrame =
    ProtoBuf.decodeFromByteArray(RpcFrame.serializer(), data)

// ---------------------------------------------------------------------------
// Base64 helpers (using android.util.Base64)
// ---------------------------------------------------------------------------

fun encodeBase64(data: ByteArray): String =
    Base64.encodeToString(data, Base64.NO_WRAP)

fun decodeBase64(base64: String): ByteArray =
    Base64.decode(base64, Base64.NO_WRAP)

fun encodeFrameToBase64(frame: RpcFrame): String =
    encodeBase64(encodeFrame(frame))

fun decodeFrameFromBase64(base64: String): RpcFrame =
    decodeFrame(decodeBase64(base64))

// ---------------------------------------------------------------------------
// Frame factory helpers
// ---------------------------------------------------------------------------

fun createMessageFrame(
    streamId: Int,
    payload: ByteArray,
): RpcFrame = RpcFrame(
    type = FrameType.MESSAGE,
    streamId = streamId,
    payload = payload,
)

fun createCloseFrame(streamId: Int): RpcFrame = RpcFrame(
    type = FrameType.CLOSE,
    streamId = streamId,
)

fun createHalfCloseFrame(streamId: Int): RpcFrame = RpcFrame(
    type = FrameType.HALF_CLOSE,
    streamId = streamId,
)

fun createErrorFrame(
    streamId: Int,
    errorCode: Int,
    errorMessage: String,
): RpcFrame = RpcFrame(
    type = FrameType.ERROR,
    streamId = streamId,
    errorCode = errorCode,
    errorMessage = errorMessage,
)

// ---------------------------------------------------------------------------
// Error codes (subset of gRPC status codes)
// ---------------------------------------------------------------------------

object RpcStatusCode {
    const val OK = 0
    const val CANCELLED = 1
    const val UNKNOWN = 2
    const val INVALID_ARGUMENT = 3
    const val UNIMPLEMENTED = 12
    const val INTERNAL = 13
}
