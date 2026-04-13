package com.demo.rpcbridge

import demo.hello.v1.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

class HelloServiceImpl : HelloService {

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

}
