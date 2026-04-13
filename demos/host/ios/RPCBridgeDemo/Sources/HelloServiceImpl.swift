// HelloServiceImpl.swift
// RPCBridgeDemo
//
// Swift implementation of the HelloBridgeService defined in
// proto/demo/hello/v1/hello.proto. Uses generated types from DemoHelloV1.
//
// Implements all four RPC patterns:
// - Unary: SayHello
// - Server streaming: WatchGreeting
// - Client streaming: CollectNames
// - Bidi streaming: Chat

import Foundation

// MARK: - HelloServiceImpl

final class HelloServiceImpl: DemoHelloV1.HelloBridgeServiceProvider, Sendable {

    private let serverVersion = "ios-demo/1.0.0"

    // MARK: - Unary: SayHello

    func sayHello(_ request: DemoHelloV1.HelloRequest) async throws -> DemoHelloV1.HelloResponse {
        let name = request.name.isEmpty ? "World" : request.name

        let greeting: String
        switch request.language.lowercased() {
        case "es":
            greeting = "Hola, \(name)!"
        case "fr":
            greeting = "Bonjour, \(name)!"
        case "de":
            greeting = "Hallo, \(name)!"
        default:
            greeting = "Hello, \(name)!"
        }

        var response = DemoHelloV1.HelloResponse()
        response.message = greeting
        response.timestamp = currentTimestampMs()
        response.serverVersion = serverVersion
        return response
    }

    // MARK: - Server Streaming: WatchGreeting

    func watchGreeting(_ request: DemoHelloV1.GreetingStreamRequest) -> AsyncThrowingStream<DemoHelloV1.GreetingEvent, Error> {
        let name = request.name.isEmpty ? "World" : request.name
        let maxCount = request.maxCount == 0 ? UInt32(10) : request.maxCount
        let intervalMs = request.intervalMs == 0 ? UInt32(1000) : request.intervalMs

        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    for seq in 1...maxCount {
                        try Task.checkCancellation()

                        let greetings = [
                            "Hello, \(name)!",
                            "Hey there, \(name)!",
                            "Greetings, \(name)!",
                            "Hi, \(name)!",
                            "Welcome, \(name)!",
                        ]
                        let message = greetings[Int(seq - 1) % greetings.count]

                        var event = DemoHelloV1.GreetingEvent()
                        event.message = "[\(seq)/\(maxCount)] \(message)"
                        event.seq = UInt64(seq)
                        event.timestamp = currentTimestampMs()

                        continuation.yield(event)

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

    func collectNames(_ requests: AsyncStream<DemoHelloV1.CollectNamesRequest>) async throws -> DemoHelloV1.CollectNamesResponse {
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

        var response = DemoHelloV1.CollectNamesResponse()
        response.message = message
        response.count = count
        return response
    }

    // MARK: - Bidi Streaming: Chat

    func chat(_ requests: AsyncStream<DemoHelloV1.ChatMessage>) -> AsyncThrowingStream<DemoHelloV1.ChatMessage, Error> {
        return AsyncThrowingStream { continuation in
            let task = Task {
                var responseSeq: UInt64 = 0

                for await incomingMessage in requests {
                    if Task.isCancelled { break }

                    responseSeq += 1

                    let responseText = generateBotResponse(to: incomingMessage.text)

                    var response = DemoHelloV1.ChatMessage()
                    response.from = "bot"
                    response.text = responseText
                    response.seq = responseSeq
                    response.timestamp = currentTimestampMs()

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

private func currentTimestampMs() -> UInt64 {
    return UInt64(Date().timeIntervalSince1970 * 1000)
}
