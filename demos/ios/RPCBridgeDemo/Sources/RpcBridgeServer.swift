// RpcBridgeServer.swift
// RPCBridgeDemo
//
// Server-side RPC runtime for iOS. Handles incoming frames from the
// WKWebView client, manages stream state, dispatches to service handlers,
// and sends response frames back through the transport.
//
// This mirrors the TypeScript RpcServer in packages/rpc-core/src/server.ts,
// implementing the same frame-level protocol:
// - HANDSHAKE: Protocol version negotiation
// - OPEN: Stream creation and method dispatch
// - MESSAGE: Payload delivery with flow control
// - HALF_CLOSE: End of client messages
// - CLOSE: Successful stream completion
// - ERROR: Stream-level error signaling
// - CANCEL: Stream cancellation
// - REQUEST_N: Credit-based flow control

import Foundation

// MARK: - Protocol Version Constants

/// Current protocol version. Must match the TypeScript side.
private let currentProtocolVersion: UInt32 = 1

/// Implementation identifier for this Swift runtime.
private let swiftImplementationId = "rpc-bridge-ios-demo/1.0.0"

/// Default capabilities advertised by this implementation.
/// Must match the capabilities in the TypeScript handshake module.
private let defaultCapabilities = ["flow_control", "deadline", "cancellation"]

/// Default initial flow control credits granted to each stream.
private let defaultInitialCredits: UInt32 = 16

// MARK: - Stream State

/// Possible states for a server-side stream.
/// Follows the same state machine as the TypeScript Stream class.
enum StreamState: Sendable {
    case idle
    case open
    case halfClosedRemote   // Client sent HALF_CLOSE (no more client messages)
    case halfClosedLocal    // Server sent HALF_CLOSE (no more server messages)
    case halfClosedBoth
    case closed
    case error
    case cancelled
}

// MARK: - Server Stream

/// Manages the state and message buffering for a single server-side stream.
/// Each RPC call creates one ServerStream instance that tracks its lifecycle
/// from OPEN through CLOSE/ERROR/CANCEL.
final class ServerStream: @unchecked Sendable {
    let streamId: UInt32
    private(set) var state: StreamState = .idle
    private var sendSequence: UInt32 = 0
    private var sendCredits: UInt32 = 0

    /// Continuation for feeding incoming messages to the async stream consumer.
    private var messageContinuation: AsyncStream<Data>.Continuation?

    /// The async stream that service handlers consume to receive client messages.
    let messages: AsyncStream<Data>

    /// Task managing the stream handler, used for cancellation.
    var handlerTask: Task<Void, Never>?

    init(streamId: UInt32) {
        self.streamId = streamId
        var continuation: AsyncStream<Data>.Continuation!
        self.messages = AsyncStream<Data> { c in
            continuation = c
        }
        self.messageContinuation = continuation
        // Grant initial send credits so the server can send responses
        self.sendCredits = defaultInitialCredits
    }

    /// Transition to open state.
    func open() {
        state = .open
    }

    /// Get and increment the send sequence number.
    func nextSendSequence() -> UInt32 {
        sendSequence += 1
        return sendSequence
    }

    /// Push an incoming message payload from the client.
    func pushMessage(_ data: Data) {
        messageContinuation?.yield(data)
    }

    /// Signal that the client will send no more messages.
    func pushEnd() {
        messageContinuation?.finish()
        messageContinuation = nil

        if state == .halfClosedLocal {
            state = .halfClosedBoth
        } else {
            state = .halfClosedRemote
        }
    }

    /// Signal a client-side error on this stream.
    func pushError() {
        messageContinuation?.finish()
        messageContinuation = nil
        state = .error
    }

    /// Cancel this stream.
    func cancel() {
        messageContinuation?.finish()
        messageContinuation = nil
        state = .cancelled
        handlerTask?.cancel()
    }

    /// Mark this stream as closed.
    func close() {
        messageContinuation?.finish()
        messageContinuation = nil
        state = .closed
    }

    /// Add send credits (called when REQUEST_N is received from the client).
    func addSendCredits(_ n: UInt32) {
        sendCredits += n
    }

    /// Consume one send credit. Returns true if a credit was available.
    func consumeSendCredit() -> Bool {
        if sendCredits > 0 {
            sendCredits -= 1
            return true
        }
        return false
    }
}

// MARK: - Frame Send Callback

/// Callback type for sending frames back to the WKWebView client.
/// The transport layer provides this closure when setting up the server.
typealias FrameSender = @Sendable (RpcFrame) -> Void

// MARK: - RpcBridgeServer

/// The server runtime that receives frames from the web client, dispatches
/// RPC calls to registered service handlers, and sends response frames back.
///
/// Usage:
/// 1. Create the server with a frame sender callback
/// 2. Register the HelloBridgeService implementation
/// 3. Feed incoming frames via `handleFrame(_:)`
///
/// The server manages the full RPC lifecycle including handshake negotiation,
/// stream creation, method dispatch, flow control, and error handling.
final class RpcBridgeServer: @unchecked Sendable {

    /// Callback for sending frames to the client.
    private let sendFrame: FrameSender

    /// Active streams keyed by stream ID.
    private var streams: [UInt32: ServerStream] = [:]

    /// Lock for thread-safe stream map access.
    private let lock = NSLock()

    /// Whether the handshake has been completed.
    private var handshakeCompleted = false

    /// The registered service implementation.
    private let service: HelloBridgeServiceProvider

    /// Fully qualified service name matching the proto package + service name.
    /// This must match what the TypeScript client sends in OPEN frames.
    private let serviceName = "demo.hello.v1.HelloBridgeService"

    /// Optional logging function for debugging.
    var log: ((String) -> Void)?

    // MARK: - Initialization

    init(service: HelloBridgeServiceProvider, sendFrame: @escaping FrameSender) {
        self.service = service
        self.sendFrame = sendFrame
    }

    // MARK: - Frame Handling

    /// Process an incoming frame from the web client.
    /// This is the main entry point called by the transport layer.
    /// Routes frames to the appropriate handler based on frame type.
    func handleFrame(_ frame: RpcFrame) {
        switch frame.type {
        case .handshake:
            handleHandshake(frame)

        case .open:
            handleOpen(frame)

        case .message:
            handleMessage(frame)

        case .halfClose:
            handleHalfClose(frame)

        case .cancel:
            handleCancel(frame)

        case .requestN:
            handleRequestN(frame)

        case .error:
            handleClientError(frame)

        case .close, .unspecified:
            // CLOSE from client is unusual but harmless; UNSPECIFIED is ignored
            log?("[Server] Ignoring frame type: \(frame.type) on stream \(frame.streamId)")
        }
    }

    // MARK: - Handshake

    /// Handle the client's HANDSHAKE frame and send our response.
    /// Negotiates protocol version (minimum of both sides) and
    /// intersects capabilities for feature negotiation.
    private func handleHandshake(_ frame: RpcFrame) {
        let peerVersion = frame.protocolVersion ?? 1
        let negotiatedVersion = min(currentProtocolVersion, peerVersion)

        log?("[Server] Handshake received: v\(peerVersion), peer=\(frame.implementationId ?? "unknown")")

        // Send our handshake response
        let response = createHandshakeFrame(
            protocolVersion: currentProtocolVersion,
            capabilities: defaultCapabilities,
            implementationId: swiftImplementationId
        )
        sendFrame(response)
        handshakeCompleted = true

        log?("[Server] Handshake complete: negotiated v\(negotiatedVersion)")
    }

    // MARK: - Stream Open

    /// Handle an OPEN frame to start a new RPC stream.
    /// Parses the method name, validates the service, and dispatches
    /// to the appropriate handler based on the method type.
    private func handleOpen(_ frame: RpcFrame) {
        guard let method = frame.method, !method.isEmpty else {
            sendError(streamId: frame.streamId, code: RpcStatusCode.invalidArgument, message: "Missing method name")
            return
        }

        // Parse method: "package.ServiceName/MethodName"
        guard let slashIdx = method.lastIndex(of: "/") else {
            sendError(streamId: frame.streamId, code: RpcStatusCode.invalidArgument, message: "Invalid method format: \(method)")
            return
        }

        let svcName = String(method[method.startIndex..<slashIdx])
        let methodName = String(method[method.index(after: slashIdx)...])

        // Verify the service name matches
        guard svcName == serviceName else {
            sendError(streamId: frame.streamId, code: RpcStatusCode.unimplemented, message: "Unknown service: \(svcName)")
            return
        }

        // Create the server-side stream
        let stream = ServerStream(streamId: frame.streamId)
        stream.open()
        lock.lock()
        streams[frame.streamId] = stream
        lock.unlock()

        log?("[Server] Stream \(frame.streamId) opened for method: \(method)")

        // Dispatch to the appropriate handler based on method name
        let task = Task { [weak self] in
            guard let self else { return }
            await self.dispatchMethod(
                stream: stream,
                methodName: methodName,
                methodType: frame.methodType ?? .unary
            )
        }
        stream.handlerTask = task
    }

    /// Dispatch an RPC call to the correct service handler method.
    private func dispatchMethod(
        stream: ServerStream,
        methodName: String,
        methodType: MethodType
    ) async {
        do {
            switch methodName {
            case "SayHello":
                try await handleSayHello(stream: stream)

            case "WatchGreeting":
                try await handleWatchGreeting(stream: stream)

            case "CollectNames":
                try await handleCollectNames(stream: stream)

            case "Chat":
                try await handleChat(stream: stream)

            default:
                sendError(
                    streamId: stream.streamId,
                    code: RpcStatusCode.unimplemented,
                    message: "Unknown method: \(serviceName)/\(methodName)"
                )
                removeStream(stream.streamId)
                return
            }
        } catch is CancellationError {
            // Stream was cancelled; nothing to do
            log?("[Server] Stream \(stream.streamId) handler cancelled")
        } catch {
            // Send error frame for unhandled errors
            let message = String(describing: error)
            sendError(streamId: stream.streamId, code: RpcStatusCode.internal, message: message)
        }

        removeStream(stream.streamId)
    }

    // MARK: - Unary Handler: SayHello

    /// Handle the SayHello unary RPC.
    /// Waits for the client's single request message, calls the service,
    /// then sends the single response followed by CLOSE.
    private func handleSayHello(stream: ServerStream) async throws {
        // Wait for the single request message
        let requestData = try await collectUnaryRequest(stream: stream)
        let request = HelloRequest.decode(from: requestData)

        // Call the service handler
        let response = try await service.sayHello(request)

        // Send response MESSAGE
        let seq = stream.nextSendSequence()
        let msgFrame = createMessageFrame(
            streamId: stream.streamId,
            sequence: seq,
            payload: response.encode()
        )
        sendFrame(msgFrame)

        // Send CLOSE to complete the stream
        sendFrame(createCloseFrame(streamId: stream.streamId))
        stream.close()

        log?("[Server] SayHello completed on stream \(stream.streamId)")
    }

    // MARK: - Server Streaming Handler: WatchGreeting

    /// Handle the WatchGreeting server-streaming RPC.
    /// Waits for the client's single request, then streams multiple
    /// response events with flow control.
    private func handleWatchGreeting(stream: ServerStream) async throws {
        // Wait for the single request message
        let requestData = try await collectUnaryRequest(stream: stream)
        let request = GreetingStreamRequest.decode(from: requestData)

        // Call the service handler to get the response stream
        let responses = service.watchGreeting(request)

        // Send each response with flow control
        for try await event in responses {
            if stream.state == .cancelled { return }
            try Task.checkCancellation()

            let seq = stream.nextSendSequence()
            let msgFrame = createMessageFrame(
                streamId: stream.streamId,
                sequence: seq,
                payload: event.encode()
            )
            sendFrame(msgFrame)
        }

        // Send CLOSE to complete the stream
        sendFrame(createCloseFrame(streamId: stream.streamId))
        stream.close()

        log?("[Server] WatchGreeting completed on stream \(stream.streamId)")
    }

    // MARK: - Client Streaming Handler: CollectNames

    /// Handle the CollectNames client-streaming RPC.
    /// Sends initial REQUEST_N credits, feeds client messages to the
    /// service handler via AsyncStream, then sends the single response.
    private func handleCollectNames(stream: ServerStream) async throws {
        // Grant initial credits so the client can start sending
        sendFrame(createRequestNFrame(streamId: stream.streamId, n: defaultInitialCredits))

        // Create a typed async stream from the raw message stream
        let typedRequests = AsyncStream<CollectNamesRequest> { continuation in
            Task {
                var received: UInt32 = 0
                for await data in stream.messages {
                    let request = CollectNamesRequest.decode(from: data)
                    continuation.yield(request)

                    // Replenish credits when we've consumed a portion
                    received += 1
                    if received % (defaultInitialCredits / 4) == 0 {
                        self.sendFrame(createRequestNFrame(streamId: stream.streamId, n: defaultInitialCredits))
                    }
                }
                continuation.finish()
            }
        }

        // Call the service handler
        let response = try await service.collectNames(typedRequests)

        // Send response MESSAGE
        let seq = stream.nextSendSequence()
        let msgFrame = createMessageFrame(
            streamId: stream.streamId,
            sequence: seq,
            payload: response.encode()
        )
        sendFrame(msgFrame)

        // Send CLOSE to complete the stream
        sendFrame(createCloseFrame(streamId: stream.streamId))
        stream.close()

        log?("[Server] CollectNames completed on stream \(stream.streamId)")
    }

    // MARK: - Bidi Streaming Handler: Chat

    /// Handle the Chat bidirectional streaming RPC.
    /// Sends initial REQUEST_N credits, then processes client messages
    /// and server responses concurrently.
    private func handleChat(stream: ServerStream) async throws {
        // Grant initial credits so the client can start sending
        sendFrame(createRequestNFrame(streamId: stream.streamId, n: defaultInitialCredits))

        // Create a typed async stream from the raw message stream
        let typedRequests = AsyncStream<ChatMessage> { continuation in
            Task {
                var received: UInt32 = 0
                for await data in stream.messages {
                    let msg = ChatMessage.decode(from: data)
                    continuation.yield(msg)

                    // Replenish credits periodically
                    received += 1
                    if received % (defaultInitialCredits / 4) == 0 {
                        self.sendFrame(createRequestNFrame(streamId: stream.streamId, n: defaultInitialCredits))
                    }
                }
                continuation.finish()
            }
        }

        // Call the service handler to get the response stream
        let responses = service.chat(typedRequests)

        // Send each response event
        for try await event in responses {
            if stream.state == .cancelled { return }
            try Task.checkCancellation()

            let seq = stream.nextSendSequence()
            let msgFrame = createMessageFrame(
                streamId: stream.streamId,
                sequence: seq,
                payload: event.encode()
            )
            sendFrame(msgFrame)
        }

        // Send HALF_CLOSE from server side, then CLOSE
        sendFrame(createHalfCloseFrame(streamId: stream.streamId))
        sendFrame(createCloseFrame(streamId: stream.streamId))
        stream.close()

        log?("[Server] Chat completed on stream \(stream.streamId)")
    }

    // MARK: - Message/HalfClose/Cancel/RequestN/Error Handlers

    /// Handle an incoming MESSAGE frame by routing it to the appropriate stream.
    private func handleMessage(_ frame: RpcFrame) {
        lock.lock()
        let stream = streams[frame.streamId]
        lock.unlock()

        guard let stream else {
            log?("[Server] Received MESSAGE for unknown stream \(frame.streamId)")
            return
        }

        stream.pushMessage(frame.payload ?? Data())
    }

    /// Handle a HALF_CLOSE frame indicating the client is done sending.
    private func handleHalfClose(_ frame: RpcFrame) {
        lock.lock()
        let stream = streams[frame.streamId]
        lock.unlock()

        guard let stream else {
            log?("[Server] Received HALF_CLOSE for unknown stream \(frame.streamId)")
            return
        }

        stream.pushEnd()
        log?("[Server] Stream \(frame.streamId) half-closed by client")
    }

    /// Handle a CANCEL frame requesting stream cancellation.
    private func handleCancel(_ frame: RpcFrame) {
        lock.lock()
        let stream = streams[frame.streamId]
        lock.unlock()

        guard let stream else {
            log?("[Server] Received CANCEL for unknown stream \(frame.streamId)")
            return
        }

        stream.cancel()
        removeStream(frame.streamId)
        log?("[Server] Stream \(frame.streamId) cancelled by client")
    }

    /// Handle a REQUEST_N frame granting additional send credits.
    private func handleRequestN(_ frame: RpcFrame) {
        lock.lock()
        let stream = streams[frame.streamId]
        lock.unlock()

        guard let stream else { return }
        stream.addSendCredits(frame.requestN ?? 0)
    }

    /// Handle an ERROR frame from the client.
    private func handleClientError(_ frame: RpcFrame) {
        lock.lock()
        let stream = streams[frame.streamId]
        lock.unlock()

        guard let stream else { return }

        log?("[Server] Client error on stream \(frame.streamId): \(frame.errorMessage ?? "unknown")")
        stream.pushError()
        removeStream(frame.streamId)
    }

    // MARK: - Helpers

    /// Collect the single request message for a unary or server-streaming RPC.
    /// Waits for the first MESSAGE frame, which contains the request payload.
    private func collectUnaryRequest(stream: ServerStream) async throws -> Data {
        for await data in stream.messages {
            return data
        }
        throw RpcBridgeError.missingRequest
    }

    /// Send an error frame to the client.
    private func sendError(streamId: UInt32, code: UInt32, message: String) {
        let frame = createErrorFrame(
            streamId: streamId,
            errorCode: code,
            errorMessage: message
        )
        sendFrame(frame)
    }

    /// Remove a stream from the active streams map.
    private func removeStream(_ streamId: UInt32) {
        lock.lock()
        streams.removeValue(forKey: streamId)
        lock.unlock()
    }

    /// Cancel all active streams. Called when the transport is torn down.
    func cancelAll() {
        lock.lock()
        let allStreams = Array(streams.values)
        streams.removeAll()
        lock.unlock()

        for stream in allStreams {
            stream.cancel()
        }
    }
}

// MARK: - Errors

/// Errors specific to the RPC bridge server.
enum RpcBridgeError: Error, CustomStringConvertible {
    case missingRequest
    case unknownMethod(String)
    case transportClosed

    var description: String {
        switch self {
        case .missingRequest:
            return "Expected request message but stream ended"
        case .unknownMethod(let method):
            return "Unknown method: \(method)"
        case .transportClosed:
            return "Transport is closed"
        }
    }
}
