package com.demo.rpcbridge

import demo.hello.v1.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

class ChatServiceImpl : ChatService {

    // --- Bidi Streaming: Chat ---

    override fun chat(requests: Flow<ChatMessage>): Flow<ChatMessage> = flow {
        var responseSeq = 0uL

        requests.collect { incoming ->
            responseSeq++
            emit(ChatMessage(
                from = "bot",
                text = "You said: \"${incoming.text}\" - that's interesting!",
                seq = responseSeq,
                timestamp = System.currentTimeMillis().toULong(),
            ))

            responseSeq++
            emit(ChatMessage(
                from = "bot",
                text = getFollowUp(incoming.text),
                seq = responseSeq,
                timestamp = System.currentTimeMillis().toULong(),
            ))
        }
    }
}

private fun getFollowUp(text: String): String {
    val lower = text.lowercase()
    if (lower.contains("hello") || lower.contains("hi")) return "Nice to meet you!"
    if (lower.contains("?")) return "Great question! Let me think about that..."
    if (lower.contains("bye")) return "Goodbye! Have a great day!"
    return "Tell me more about that!"
}
