package com.demo.rpcbridge

import demo.hello.v1.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

class HelloServiceImpl : HelloBridgeService {

    private val serverVersion = "android-demo/1.0.0"

    // --- Unary: SayHello ---

    override suspend fun sayHello(request: HelloRequest): HelloResponse {
        val name = request.name.ifEmpty { "World" }

        val greeting = when (request.language.lowercase()) {
            "es" -> "\u00a1Hola, $name!"
            "fr" -> "Bonjour, $name!"
            "de" -> "Hallo, $name!"
            "ja" -> "\u3053\u3093\u306b\u3061\u306f\u3001$name!"
            else -> "Hello, $name!"
        }

        return HelloResponse(
            message = greeting,
            timestamp = System.currentTimeMillis().toULong(),
            serverVersion = serverVersion,
        )
    }

    // --- Server Streaming: WatchGreeting ---

    override fun watchGreeting(request: GreetingStreamRequest): Flow<GreetingEvent> = flow {
        val name = request.name.ifEmpty { "World" }
        val maxCount = if (request.maxCount == 0u) 10u else request.maxCount
        val intervalMs = if (request.intervalMs == 0u) 1000L else request.intervalMs.toLong()

        val greetings = listOf(
            "Hello", "Hey there", "Greetings", "Hi", "Welcome",
            "Howdy", "Salutations", "Good day",
        )

        for (seq in 1u..maxCount) {
            val message = greetings[((seq - 1u) % greetings.size.toUInt()).toInt()]

            emit(GreetingEvent(
                message = "[$seq/$maxCount] $message, $name!",
                seq = seq.toULong(),
                timestamp = System.currentTimeMillis().toULong(),
            ))

            if (seq < maxCount) {
                delay(intervalMs)
            }
        }
    }

    // --- Client Streaming: CollectNames ---

    override suspend fun collectNames(requests: Flow<CollectNamesRequest>): CollectNamesResponse {
        val names = mutableListOf<String>()

        requests.collect { request ->
            if (request.name.isNotEmpty()) {
                names.add(request.name)
            }
        }

        val count = names.size.toUInt()
        val message = when {
            names.isEmpty() -> "No names were collected."
            names.size == 1 -> "Hello, ${names[0]}! You were the only one."
            else -> {
                val allButLast = names.dropLast(1).joinToString(", ")
                val last = names.last()
                "Hello to $allButLast, and $last! That's ${names.size} of you!"
            }
        }

        return CollectNamesResponse(message = message, count = count)
    }

    // --- Bidi Streaming: Chat ---

    override fun chat(requests: Flow<ChatMessage>): Flow<ChatMessage> = flow {
        var responseSeq = 0uL

        requests.collect { incoming ->
            responseSeq++
            val responseText = generateBotResponse(incoming.text)

            emit(ChatMessage(
                from = "bot",
                text = responseText,
                seq = responseSeq,
                timestamp = System.currentTimeMillis().toULong(),
            ))
        }
    }
}

private fun generateBotResponse(text: String): String {
    val lower = text.lowercase().trim()

    if (lower.contains("hello") || lower.contains("hi") || lower.contains("hey")) {
        return "Hey there! How can I help you today?"
    }
    if (lower.contains("how are you")) {
        return "I'm running great on Android! Thanks for asking."
    }
    if (lower.contains("bye") || lower.contains("goodbye")) {
        return "Goodbye! It was nice chatting with you."
    }
    if (lower.endsWith("?")) {
        return "That's a great question! Let me think... I'd say the answer is 42."
    }

    return "You said: \"$text\" - I'm a demo bot running natively on Android!"
}
