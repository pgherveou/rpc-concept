// Server.swift
// RpcBridge
//
// Generic server-side RPC runtime for iOS. Handles incoming frames,
// manages stream state, dispatches to service handlers via the
// ServiceDispatcher protocol, and sends response frames back.

import Foundation

// MARK: - Dispatch Types

/// Result of dispatching an RPC call to a service handler.
public enum DispatchResult: Sendable {
    /// Single response (unary or client-streaming RPC).
    case unary(Data)
    /// Stream of responses (server-streaming or bidi RPC).
    case stream(AsyncThrowingStream<Data, Error>)
}

/// Protocol for service dispatchers that route JSON data to typed handlers.
/// Generated code produces concrete implementations of this protocol.
public protocol ServiceDispatcher: Sendable {
    /// Fully qualified service name (e.g. "demo.hello.v1.HelloBridgeService").
    var serviceName: String { get }

    /// Dispatch an RPC call. The full method string (e.g.
    /// "demo.hello.v1.HelloBridgeService/SayHello") and the JSON-encoded
    /// message stream are passed in.
    func dispatch(method: String, messages: AsyncStream<Data>) async throws -> DispatchResult
}

// MARK: - Stream State

enum StreamState: Sendable {
    case idle
    case open
    case halfClosedRemote
    case closed
    case error
    case cancelled
}

// MARK: - Server Stream

final class ServerStream: @unchecked Sendable {
    let streamId: UInt32
    private let lock = NSLock()
    private var _state: StreamState = .idle

    private var messageContinuation: AsyncStream<Data>.Continuation?
    let messages: AsyncStream<Data>
    private var _handlerTask: Task<Void, Never>?

    var state: StreamState {
        lock.lock()
        defer { lock.unlock() }
        return _state
    }

    var handlerTask: Task<Void, Never>? {
        get { lock.lock(); defer { lock.unlock() }; return _handlerTask }
        set { lock.lock(); defer { lock.unlock() }; _handlerTask = newValue }
    }

    init(streamId: UInt32) {
        self.streamId = streamId
        let (stream, continuation) = AsyncStream<Data>.makeStream()
        self.messages = stream
        self.messageContinuation = continuation
    }

    func open() {
        lock.lock()
        _state = .open
        lock.unlock()
    }

    func pushMessage(_ data: Data) {
        lock.lock()
        let cont = messageContinuation
        lock.unlock()
        cont?.yield(data)
    }

    func pushEnd() {
        lock.lock()
        messageContinuation?.finish()
        messageContinuation = nil
        _state = .halfClosedRemote
        lock.unlock()
    }

    func pushError() {
        lock.lock()
        messageContinuation?.finish()
        messageContinuation = nil
        _state = .error
        lock.unlock()
    }

    func cancel() {
        lock.lock()
        messageContinuation?.finish()
        messageContinuation = nil
        _state = .cancelled
        let task = _handlerTask
        lock.unlock()
        task?.cancel()
    }

    func close() {
        lock.lock()
        messageContinuation?.finish()
        messageContinuation = nil
        _state = .closed
        lock.unlock()
    }
}

// MARK: - Frame Send Callback

public typealias FrameSender = @Sendable (RpcFrame) -> Void

// MARK: - RpcBridgeServer

public final class RpcBridgeServer: @unchecked Sendable {

    private let sendFrame: FrameSender
    private var streams: [UInt32: ServerStream] = [:]
    private let lock = NSLock()
    private var dispatchers: [String: any ServiceDispatcher] = [:]
    private var _log: ((String) -> Void)?

    /// Log callback. Must be set before processing any frames.
    public var log: ((String) -> Void)? {
        get { lock.lock(); defer { lock.unlock() }; return _log }
        set { lock.lock(); defer { lock.unlock() }; _log = newValue }
    }

    // MARK: - Initialization

    public init(sendFrame: @escaping FrameSender) {
        self.sendFrame = sendFrame
    }

    // MARK: - Service Registration

    public func registerDispatcher(_ dispatcher: any ServiceDispatcher) {
        lock.lock()
        dispatchers[dispatcher.serviceName] = dispatcher
        lock.unlock()
    }

    // MARK: - Frame Handling

    public func handleFrame(_ frame: RpcFrame) {
        let streamId = frame.streamId
        switch frame.body {
        case .open(let body):
            handleOpen(streamId: streamId, method: body.method)
        case .message(let body):
            handleMessage(streamId: streamId, payload: body.payload)
        case .halfClose:
            handleHalfClose(streamId: streamId)
        case .cancel:
            handleCancel(streamId: streamId)
        case .error(let body):
            handleClientError(streamId: streamId, errorCode: body.errorCode, errorMessage: body.errorMessage)
        case .close, .unknown:
            log?("[Server] Ignoring frame \(frameTypeName(frame)) on stream \(streamId)")
        }
    }

    // MARK: - Stream Open

    private func handleOpen(streamId: UInt32, method: String) {
        guard !method.isEmpty else {
            sendError(streamId: streamId, code: RpcStatusCode.invalidArgument, message: "Missing method name")
            return
        }

        guard let slashIdx = method.lastIndex(of: "/") else {
            sendError(streamId: streamId, code: RpcStatusCode.invalidArgument, message: "Invalid method format: \(method)")
            return
        }

        let svcName = String(method[method.startIndex..<slashIdx])

        let stream = ServerStream(streamId: streamId)
        stream.open()

        lock.lock()
        let dispatcher = dispatchers[svcName]
        let duplicate = streams[streamId] != nil
        if !duplicate && dispatcher != nil {
            streams[streamId] = stream
        }
        lock.unlock()

        guard let dispatcher else {
            sendError(streamId: streamId, code: RpcStatusCode.unimplemented, message: "Unknown service: \(svcName)")
            return
        }

        if duplicate {
            sendError(streamId: streamId, code: RpcStatusCode.internal, message: "Duplicate stream ID: \(streamId)")
            return
        }

        log?("[Server] Stream \(streamId) opened for method: \(method)")

        let task = Task { [weak self] in
            guard let self else { return }
            await self.dispatchToHandler(stream: stream, method: method, dispatcher: dispatcher)
        }
        stream.handlerTask = task
    }

    // MARK: - Generic Dispatch

    private func dispatchToHandler(
        stream: ServerStream,
        method: String,
        dispatcher: any ServiceDispatcher
    ) async {
        do {
            let result = try await dispatcher.dispatch(method: method, messages: stream.messages)

            switch result {
            case .unary(let data):
                guard stream.state != .cancelled else { return }
                sendFrame(createMessageFrame(streamId: stream.streamId, payload: data))
                sendFrame(createCloseFrame(streamId: stream.streamId))
                stream.close()

            case .stream(let responseStream):
                for try await data in responseStream {
                    if stream.state == .cancelled { return }
                    try Task.checkCancellation()
                    sendFrame(createMessageFrame(streamId: stream.streamId, payload: data))
                }
                guard stream.state != .cancelled else { return }
                sendFrame(createCloseFrame(streamId: stream.streamId))
                stream.close()
            }
        } catch is CancellationError {
            log?("[Server] Stream \(stream.streamId) handler cancelled")
        } catch {
            let message = String(describing: error)
            sendError(streamId: stream.streamId, code: RpcStatusCode.internal, message: message)
        }

        removeStream(stream.streamId)
    }

    // MARK: - Message/HalfClose/Cancel/Error Handlers

    private func handleMessage(streamId: UInt32, payload: AnyCodable?) {
        lock.lock()
        let stream = streams[streamId]
        lock.unlock()

        guard let stream else {
            log?("[Server] Received MESSAGE for unknown stream \(streamId)")
            return
        }

        do {
            let data = try payloadToJSONData(payload)
            stream.pushMessage(data)
        } catch {
            log?("[Server] Failed to serialize payload for stream \(streamId): \(error)")
        }
    }

    private func handleHalfClose(streamId: UInt32) {
        lock.lock()
        let stream = streams[streamId]
        lock.unlock()

        guard let stream else {
            log?("[Server] Received HALF_CLOSE for unknown stream \(streamId)")
            return
        }

        stream.pushEnd()
        log?("[Server] Stream \(streamId) half-closed by client")
    }

    private func handleCancel(streamId: UInt32) {
        lock.lock()
        let stream = streams[streamId]
        lock.unlock()

        guard let stream else {
            log?("[Server] Received CANCEL for unknown stream \(streamId)")
            return
        }

        stream.cancel()
        removeStream(streamId)
        log?("[Server] Stream \(streamId) cancelled by client")
    }

    private func handleClientError(streamId: UInt32, errorCode: UInt32, errorMessage: String) {
        lock.lock()
        let stream = streams[streamId]
        lock.unlock()

        guard let stream else { return }

        let msg = errorMessage.isEmpty ? "unknown" : errorMessage
        log?("[Server] Client error on stream \(streamId): \(msg)")
        stream.pushError()
        removeStream(streamId)
    }

    // MARK: - Helpers

    private func sendError(streamId: UInt32, code: UInt32, message: String) {
        let frame = createErrorFrame(
            streamId: streamId,
            errorCode: code,
            errorMessage: message
        )
        sendFrame(frame)
    }

    private func removeStream(_ streamId: UInt32) {
        lock.lock()
        streams.removeValue(forKey: streamId)
        lock.unlock()
    }

    /// Cancel all active streams. Called when the transport is torn down.
    public func cancelAll() {
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

public enum RpcBridgeError: Error, CustomStringConvertible {
    case missingRequest
    case unknownMethod(String)
    case transportClosed

    public var description: String {
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
