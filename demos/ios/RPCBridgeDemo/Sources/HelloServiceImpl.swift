// HelloServiceImpl.swift
// RPCBridgeDemo
//
// Swift implementation of the HelloBridgeService defined in
// proto/demo/hello/v1/hello.proto. This is the native-side service
// that handles RPC calls from the web UI running in WKWebView.
//
// Implements all four RPC patterns:
// - Unary: SayHello
// - Server streaming: WatchGreeting
// - Client streaming: CollectNames
// - Bidi streaming: Chat

import Foundation

// MARK: - HelloBridgeService Protocol

/// Protocol defining the HelloBridgeService contract.
/// Generated code would produce this from the proto definition;
/// here we define it manually to match the proto service declaration.
protocol HelloBridgeServiceProvider: Sendable {
    /// Unary RPC: Simple request-response greeting.
    func sayHello(_ request: HelloRequest) async throws -> HelloResponse

    /// Server streaming RPC: Continuous greeting events.
    func watchGreeting(_ request: GreetingStreamRequest) -> AsyncThrowingStream<GreetingEvent, Error>

    /// Client streaming RPC: Collect names, then return combined greeting.
    func collectNames(_ requests: AsyncStream<CollectNamesRequest>) async throws -> CollectNamesResponse

    /// Bidirectional streaming RPC: Real-time chat.
    func chat(_ requests: AsyncStream<ChatMessage>) -> AsyncThrowingStream<ChatMessage, Error>
}

// MARK: - HelloServiceImpl

/// Concrete implementation of HelloBridgeService.
/// Provides greeting functionality for the demo app, exercising
/// all four RPC streaming patterns.
final class HelloServiceImpl: HelloBridgeServiceProvider, Sendable {

    /// Server version string reported in responses for debugging.
    private let serverVersion = "ios-demo/1.0.0"

    // MARK: - Unary: SayHello

    /// Handle a simple greeting request.
    /// Returns a personalized greeting with timestamp and server version.
    func sayHello(_ request: HelloRequest) async throws -> HelloResponse {
        let name = request.name.isEmpty ? "World" : request.name

        // Determine greeting based on language preference
        let greeting: String
        switch request.language.lowercased() {
        case "es":
            greeting = "Hola, \(name)!"
        case "fr":
            greeting = "Bonjour, \(name)!"
        case "de":
            greeting = "Hallo, \(name)!"
        case "ja":
            greeting = "こんにちは、\(name)!"
        default:
            greeting = "Hello, \(name)!"
        }

        return HelloResponse(
            message: greeting,
            timestamp: currentTimestampMs(),
            serverVersion: serverVersion
        )
    }

    // MARK: - Server Streaming: WatchGreeting

    /// Produce a stream of periodic greeting events.
    /// The stream yields `maxCount` events (or runs indefinitely if maxCount is 0)
    /// with a configurable interval between events.
    func watchGreeting(_ request: GreetingStreamRequest) -> AsyncThrowingStream<GreetingEvent, Error> {
        let name = request.name.isEmpty ? "World" : request.name
        let maxCount = request.maxCount == 0 ? UInt32(10) : request.maxCount
        let intervalMs = request.intervalMs == 0 ? UInt32(1000) : request.intervalMs

        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    for seq in 1...maxCount {
                        // Check for cancellation before each event
                        try Task.checkCancellation()

                        let greetings = [
                            "Hello, \(name)!",
                            "Hey there, \(name)!",
                            "Greetings, \(name)!",
                            "Hi, \(name)!",
                            "Welcome, \(name)!",
                        ]
                        let message = greetings[Int(seq - 1) % greetings.count]

                        let event = GreetingEvent(
                            message: "[\(seq)/\(maxCount)] \(message)",
                            seq: UInt64(seq),
                            timestamp: currentTimestampMs()
                        )

                        continuation.yield(event)

                        // Wait for the configured interval before next event
                        try await Task.sleep(nanoseconds: UInt64(intervalMs) * 1_000_000)
                    }
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    // MARK: - Client Streaming: CollectNames

    /// Collect names from a client stream and return a combined greeting.
    /// Waits for all names to arrive, then produces a single response
    /// summarizing all collected names.
    func collectNames(_ requests: AsyncStream<CollectNamesRequest>) async throws -> CollectNamesResponse {
        var names: [String] = []

        for await request in requests {
            if !request.name.isEmpty {
                names.append(request.name)
            }
        }

        let count = UInt32(names.count)
        let message: String

        if names.isEmpty {
            message = "No names were collected."
        } else if names.count == 1 {
            message = "Hello, \(names[0])! You were the only one."
        } else {
            let allButLast = names.dropLast().joined(separator: ", ")
            let last = names.last!
            message = "Hello to \(allButLast), and \(last)! That's \(names.count) of you!"
        }

        return CollectNamesResponse(
            message: message,
            count: count
        )
    }

    // MARK: - Bidi Streaming: Chat

    /// Handle a bidirectional chat stream.
    /// For each incoming message from the user, produces a bot response.
    /// The bot echoes the message content with a playful transformation.
    func chat(_ requests: AsyncStream<ChatMessage>) -> AsyncThrowingStream<ChatMessage, Error> {
        return AsyncThrowingStream { continuation in
            let task = Task {
                var responseSeq: UInt64 = 0

                for await incomingMessage in requests {
                    // Check for cancellation
                    if Task.isCancelled { break }

                    responseSeq += 1

                    // Generate a contextual bot response
                    let responseText = generateBotResponse(to: incomingMessage.text)

                    let response = ChatMessage(
                        from: "bot",
                        text: responseText,
                        seq: responseSeq,
                        timestamp: currentTimestampMs()
                    )

                    continuation.yield(response)
                }

                continuation.finish()
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }
}

// MARK: - Private Helpers

/// Generate a bot response based on the incoming message text.
/// Uses simple pattern matching for a more interactive demo experience.
private func generateBotResponse(to text: String) -> String {
    let lowered = text.lowercased().trimmingCharacters(in: .whitespaces)

    if lowered.contains("hello") || lowered.contains("hi") || lowered.contains("hey") {
        return "Hey there! How can I help you today?"
    }
    if lowered.contains("how are you") {
        return "I'm running great on iOS! Thanks for asking."
    }
    if lowered.contains("bye") || lowered.contains("goodbye") {
        return "Goodbye! It was nice chatting with you."
    }
    if lowered.hasSuffix("?") {
        return "That's a great question! Let me think... I'd say the answer is 42."
    }

    return "You said: \"\(text)\" - I'm a demo bot running natively on iOS!"
}

/// Get the current timestamp in milliseconds since epoch.
/// Used for the timestamp fields in response messages.
private func currentTimestampMs() -> UInt64 {
    return UInt64(Date().timeIntervalSince1970 * 1000)
}
