/**
 * Native Kotlin implementation of the HelloBridgeService.
 *
 * Demonstrates all four RPC patterns:
 * - sayHello:      Unary request/response
 * - watchGreeting: Server-streaming (emits periodic greetings)
 * - chat:          Bidirectional streaming (echoes with bot responses)
 *
 * Message payloads use a simple JSON encoding for the demo (matching the
 * TypeScript web demo). In production, use generated protobuf serializers.
 */
package com.demo.rpcbridge

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import org.json.JSONObject

// ---------------------------------------------------------------------------
// Unary RPC: SayHello
// ---------------------------------------------------------------------------

/**
 * Respond with a greeting for the given name.
 * Supports optional "language" field for localized greetings.
 */
suspend fun sayHello(requestBytes: ByteArray): ByteArray {
    val json = JSONObject(String(requestBytes, Charsets.UTF_8))
    val name = json.optString("name", "World")
    val language = json.optString("language", "en")

    val greeting = when (language) {
        "es" -> "\u00a1Hola, $name!"
        "fr" -> "Bonjour, $name!"
        "de" -> "Hallo, $name!"
        "ja" -> "\u3053\u3093\u306b\u3061\u306f, $name!"
        else -> "Hello, $name!"
    }

    val response = JSONObject().apply {
        put("message", greeting)
        put("timestamp", System.currentTimeMillis())
        put("serverVersion", "android-demo/0.1.0")
    }
    return response.toString().toByteArray(Charsets.UTF_8)
}

// ---------------------------------------------------------------------------
// Server-streaming RPC: WatchGreeting
// ---------------------------------------------------------------------------

/** Greeting phrases cycled through for variety. */
private val GREETINGS = listOf(
    "Hello", "Hi", "Hey", "Greetings",
    "Howdy", "Salutations", "Welcome", "Good day",
)

/**
 * Emit a stream of greeting events at a configurable interval.
 *
 * @param requestBytes  JSON-encoded GreetingStreamRequest
 * @return Flow of JSON-encoded GreetingEvent payloads
 */
fun watchGreeting(requestBytes: ByteArray): Flow<ByteArray> = flow {
    val json = JSONObject(String(requestBytes, Charsets.UTF_8))
    val name = json.optString("name", "World")
    val maxCount = json.optInt("maxCount", 10).coerceAtLeast(1)
    val intervalMs = json.optLong("intervalMs", 1000L).coerceAtLeast(100L)

    for (seq in 1..maxCount) {
        val greeting = GREETINGS[(seq - 1) % GREETINGS.size]
        val event = JSONObject().apply {
            put("message", "$greeting, $name! (update #$seq)")
            put("seq", seq)
            put("timestamp", System.currentTimeMillis())
        }
        emit(event.toString().toByteArray(Charsets.UTF_8))

        // Delay between events (except after the last one).
        if (seq < maxCount) {
            delay(intervalMs)
        }
    }
}

// ---------------------------------------------------------------------------
// Bidirectional streaming RPC: Chat
// ---------------------------------------------------------------------------

/**
 * Echo each incoming chat message with a bot response and a follow-up.
 *
 * @param messages  Incoming Flow of JSON-encoded ChatMessage payloads
 * @return Flow of JSON-encoded ChatMessage responses
 */
fun chat(messages: Flow<ByteArray>): Flow<ByteArray> = flow {
    var responseSeq = 0L

    messages.collect { msgBytes ->
        val msg = JSONObject(String(msgBytes, Charsets.UTF_8))
        val from = msg.optString("from", "unknown")
        val text = msg.optString("text", "")

        // Primary echo response
        responseSeq++
        val response = JSONObject().apply {
            put("from", "bot")
            put("text", "You said: \"$text\" - that's interesting!")
            put("seq", responseSeq)
            put("timestamp", System.currentTimeMillis())
        }
        emit(response.toString().toByteArray(Charsets.UTF_8))

        // Short delay, then a contextual follow-up
        delay(500)
        responseSeq++
        val followUp = JSONObject().apply {
            put("from", "bot")
            put("text", getFollowUp(text))
            put("seq", responseSeq)
            put("timestamp", System.currentTimeMillis())
        }
        emit(followUp.toString().toByteArray(Charsets.UTF_8))
    }
}

/** Generate a contextual follow-up based on the user's message text. */
private fun getFollowUp(text: String): String {
    val lower = text.lowercase()
    return when {
        lower.contains("hello") || lower.contains("hi") -> "Nice to meet you!"
        lower.contains("?") -> "Great question! Let me think about that..."
        lower.contains("bye") -> "Goodbye! Have a great day!"
        lower.contains("thanks") || lower.contains("thank") -> "You're welcome!"
        else -> "Tell me more about that!"
    }
}
