package com.rpcbridge

import android.util.Base64
import org.json.JSONObject

// ---------------------------------------------------------------------------
// Frame body (sealed class mirroring the oneof body in frame.proto)
// ---------------------------------------------------------------------------

sealed class FrameBody {
    data class Open(val method: String) : FrameBody()
    data class Message(val payload: ByteArray?) : FrameBody() {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is Message) return false
            return payload.contentEqualsNullable(other.payload)
        }
        override fun hashCode(): Int = payload?.contentHashCode() ?: 0
    }
    data object HalfClose : FrameBody()
    data object Close : FrameBody()
    data object Cancel : FrameBody()
    data class Error(val errorCode: Int, val errorMessage: String) : FrameBody()
}

// ---------------------------------------------------------------------------
// RpcFrame
// ---------------------------------------------------------------------------

data class RpcFrame(
    val streamId: Int,
    val body: FrameBody,
)

private fun ByteArray?.contentEqualsNullable(other: ByteArray?): Boolean {
    if (this == null && other == null) return true
    if (this == null || other == null) return false
    return this.contentEquals(other)
}

// ---------------------------------------------------------------------------
// JSON encoding / decoding
// ---------------------------------------------------------------------------

fun encodeFrameToJSON(frame: RpcFrame): String = frameToJSONObject(frame).toString()

fun decodeFrameFromJSON(json: String): RpcFrame = frameFromJSONObject(JSONObject(json))

private fun frameToJSONObject(frame: RpcFrame): JSONObject {
    val o = JSONObject()
    o.put("streamId", frame.streamId)
    when (val b = frame.body) {
        is FrameBody.Open -> o.put("open", JSONObject().apply { put("method", b.method) })
        is FrameBody.Message -> {
            val msgObj = JSONObject()
            if (b.payload != null) {
                // Payload is inline JSON, decode and nest
                val payloadStr = String(b.payload, Charsets.UTF_8)
                msgObj.put("payload", JSONObject(payloadStr))
            }
            o.put("message", msgObj)
        }
        is FrameBody.HalfClose -> o.put("halfClose", JSONObject())
        is FrameBody.Close -> o.put("close", JSONObject())
        is FrameBody.Cancel -> o.put("cancel", JSONObject())
        is FrameBody.Error -> o.put("error", JSONObject().apply {
            put("errorCode", b.errorCode)
            put("errorMessage", b.errorMessage)
        })
    }
    return o
}

private fun frameFromJSONObject(o: JSONObject): RpcFrame {
    val streamId = o.optInt("streamId", 0)
    val body = when {
        o.has("open") -> {
            val b = o.getJSONObject("open")
            FrameBody.Open(method = b.optString("method", ""))
        }
        o.has("message") -> {
            val b = o.getJSONObject("message")
            val payload = if (b.has("payload")) {
                b.getJSONObject("payload").toString().toByteArray(Charsets.UTF_8)
            } else {
                null
            }
            FrameBody.Message(payload = payload)
        }
        o.has("halfClose") -> FrameBody.HalfClose
        o.has("close") -> FrameBody.Close
        o.has("cancel") -> FrameBody.Cancel
        o.has("error") -> {
            val b = o.getJSONObject("error")
            FrameBody.Error(
                errorCode = b.optInt("errorCode", 0),
                errorMessage = b.optString("errorMessage", ""),
            )
        }
        else -> FrameBody.Cancel // unknown body type, treat as no-op
    }
    return RpcFrame(streamId, body)
}

// ---------------------------------------------------------------------------
// Base64 helpers (JSON string encoded as base64 for WebView bridge)
// ---------------------------------------------------------------------------

fun encodeFrameToBase64(frame: RpcFrame): String {
    val json = encodeFrameToJSON(frame)
    return Base64.encodeToString(json.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
}

fun decodeFrameFromBase64(base64: String): RpcFrame {
    val json = String(Base64.decode(base64, Base64.NO_WRAP), Charsets.UTF_8)
    return decodeFrameFromJSON(json)
}

// ---------------------------------------------------------------------------
// Frame factory helpers
// ---------------------------------------------------------------------------

fun createMessageFrame(streamId: Int, payload: ByteArray): RpcFrame =
    RpcFrame(streamId = streamId, body = FrameBody.Message(payload = payload))

fun createCloseFrame(streamId: Int): RpcFrame =
    RpcFrame(streamId = streamId, body = FrameBody.Close)

fun createHalfCloseFrame(streamId: Int): RpcFrame =
    RpcFrame(streamId = streamId, body = FrameBody.HalfClose)

fun createErrorFrame(streamId: Int, errorCode: Int, errorMessage: String): RpcFrame =
    RpcFrame(streamId = streamId, body = FrameBody.Error(errorCode = errorCode, errorMessage = errorMessage))

/** Return a human-readable name for the frame's body type, for logging. */
fun frameTypeName(frame: RpcFrame): String = when (frame.body) {
    is FrameBody.Open -> "open"
    is FrameBody.Message -> "message"
    is FrameBody.HalfClose -> "halfClose"
    is FrameBody.Close -> "close"
    is FrameBody.Cancel -> "cancel"
    is FrameBody.Error -> "error"
}

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
