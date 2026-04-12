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

/// Protocol for service dispatchers that route raw bytes to typed handlers.
/// Generated code produces concrete implementations of this protocol.
public protocol ServiceDispatcher: Sendable {
    /// Fully qualified service name (e.g. "demo.hello.v1.HelloBridgeService").
    var serviceName: String { get }

    /// Dispatch an RPC call. The full method string (e.g.
    /// "demo.hello.v1.HelloBridgeService/SayHello") and the raw message
    /// stream are passed in. The dispatcher reads messages as needed
    /// for the RPC pattern (first message for unary, full stream for streaming).
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
    private(set) var state: StreamState = .idle

    private var messageContinuation: AsyncStream<Data>.Continuation?
    let messages: AsyncStream<Data>
    var handlerTask: Task<Void, Never>?

    init(streamId: UInt32) {
        self.streamId = streamId
        var continuation: AsyncStream<Data>.Continuation!
        self.messages = AsyncStream<Data> { c in
            continuation = c
        }
        self.messageContinuation = continuation
    }

    func open() {
        state = .open
    }

    func pushMessage(_ data: Data) {
        messageContinuation?.yield(data)
    }

    func pushEnd() {
        messageContinuation?.finish()
        messageContinuation = nil
        state = .halfClosedRemote
    }

    func pushError() {
        messageContinuation?.finish()
        messageContinuation = nil
        state = .error
    }

    func cancel() {
        messageContinuation?.finish()
        messageContinuation = nil
        state = .cancelled
        handlerTask?.cancel()
    }

    func close() {
        messageContinuation?.finish()
        messageContinuation = nil
        state = .closed
    }
}

// MARK: - Frame Send Callback

public typealias FrameSender = @Sendable (RpcFrame) -> Void

// MARK: - RpcBridgeServer

/// Generic server runtime that receives frames from the web client, dispatches
/// RPC calls to registered service dispatchers, and sends response frames back.
///
/// Usage:
/// 1. Create the server with a frame sender callback
/// 2. Register one or more ServiceDispatcher implementations
/// 3. Feed incoming frames via `handleFrame(_:)`
public final class RpcBridgeServer: @unchecked Sendable {

    private let sendFrame: FrameSender
    private var streams: [UInt32: ServerStream] = [:]
    private let lock = NSLock()
    private var dispatchers: [String: any ServiceDispatcher] = [:]

    public var log: ((String) -> Void)?

    // MARK: - Initialization

    public init(sendFrame: @escaping FrameSender) {
        self.sendFrame = sendFrame
    }

    // MARK: - Service Registration

    /// Register a service dispatcher. The dispatcher's serviceName is used
    /// to match incoming OPEN frames to the correct handler.
    public func registerDispatcher(_ dispatcher: any ServiceDispatcher) {
        dispatchers[dispatcher.serviceName] = dispatcher
    }

    // MARK: - Frame Handling

    public func handleFrame(_ frame: RpcFrame) {
        switch frame.type {
        case .open:
            handleOpen(frame)
        case .message:
            handleMessage(frame)
        case .halfClose:
            handleHalfClose(frame)
        case .cancel:
            handleCancel(frame)
        case .error:
            handleClientError(frame)
        case .close, .unspecified, .UNRECOGNIZED:
            log?("[Server] Ignoring frame type: \(frame.type) on stream \(frame.streamID)")
        }
    }

    // MARK: - Stream Open

    private func handleOpen(_ frame: RpcFrame) {
        let method = frame.method
        guard !method.isEmpty else {
            sendError(streamId: frame.streamID, code: RpcStatusCode.invalidArgument, message: "Missing method name")
            return
        }

        guard let slashIdx = method.lastIndex(of: "/") else {
            sendError(streamId: frame.streamID, code: RpcStatusCode.invalidArgument, message: "Invalid method format: \(method)")
            return
        }

        let svcName = String(method[method.startIndex..<slashIdx])

        guard let dispatcher = dispatchers[svcName] else {
            sendError(streamId: frame.streamID, code: RpcStatusCode.unimplemented, message: "Unknown service: \(svcName)")
            return
        }

        let stream = ServerStream(streamId: frame.streamID)
        stream.open()
        lock.lock()
        streams[frame.streamID] = stream
        lock.unlock()

        log?("[Server] Stream \(frame.streamID) opened for method: \(method)")

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
                sendFrame(createMessageFrame(streamId: stream.streamId, payload: data))
                sendFrame(createCloseFrame(streamId: stream.streamId))
                stream.close()

            case .stream(let responseStream):
                for try await data in responseStream {
                    if stream.state == .cancelled { return }
                    try Task.checkCancellation()
                    sendFrame(createMessageFrame(streamId: stream.streamId, payload: data))
                }
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

    private func handleMessage(_ frame: RpcFrame) {
        lock.lock()
        let stream = streams[frame.streamID]
        lock.unlock()

        guard let stream else {
            log?("[Server] Received MESSAGE for unknown stream \(frame.streamID)")
            return
        }

        stream.pushMessage(frame.payload)
    }

    private func handleHalfClose(_ frame: RpcFrame) {
        lock.lock()
        let stream = streams[frame.streamID]
        lock.unlock()

        guard let stream else {
            log?("[Server] Received HALF_CLOSE for unknown stream \(frame.streamID)")
            return
        }

        stream.pushEnd()
        log?("[Server] Stream \(frame.streamID) half-closed by client")
    }

    private func handleCancel(_ frame: RpcFrame) {
        lock.lock()
        let stream = streams[frame.streamID]
        lock.unlock()

        guard let stream else {
            log?("[Server] Received CANCEL for unknown stream \(frame.streamID)")
            return
        }

        stream.cancel()
        removeStream(frame.streamID)
        log?("[Server] Stream \(frame.streamID) cancelled by client")
    }

    private func handleClientError(_ frame: RpcFrame) {
        lock.lock()
        let stream = streams[frame.streamID]
        lock.unlock()

        guard let stream else { return }

        let msg = frame.errorMessage.isEmpty ? "unknown" : frame.errorMessage
        log?("[Server] Client error on stream \(frame.streamID): \(msg)")
        stream.pushError()
        removeStream(frame.streamID)
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
