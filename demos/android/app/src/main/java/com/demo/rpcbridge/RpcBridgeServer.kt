/**
 * Kotlin server-side RPC runtime for the bridge protocol.
 *
 * Handles incoming frames from the WebView transport, manages stream state,
 * dispatches to service handlers, and sends response frames back. This is
 * the Kotlin equivalent of RpcServer in @rpc-bridge/core.
 *
 * Uses Kotlin coroutines and Flow for async stream processing.
 */
package com.demo.rpcbridge

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch

private const val TAG = "RpcBridgeServer"

// ---------------------------------------------------------------------------
// Handler type aliases
// ---------------------------------------------------------------------------

/** Unary: single request -> single response. */
typealias UnaryHandler = suspend (request: ByteArray) -> ByteArray

/** Server-streaming: single request -> stream of responses. */
typealias ServerStreamHandler = (request: ByteArray) -> Flow<ByteArray>

/** Client-streaming: stream of requests -> single response. */
typealias ClientStreamHandler = suspend (requests: Flow<ByteArray>) -> ByteArray

/** Bidi-streaming: stream of requests -> stream of responses. */
typealias BidiStreamHandler = (requests: Flow<ByteArray>) -> Flow<ByteArray>

// ---------------------------------------------------------------------------
// Method registration
// ---------------------------------------------------------------------------

/** Describes one registered RPC method with its handler. */
sealed class MethodRegistration(val name: String) {
    class Unary(name: String, val handler: UnaryHandler) : MethodRegistration(name)
    class ServerStream(name: String, val handler: ServerStreamHandler) : MethodRegistration(name)
    class ClientStream(name: String, val handler: ClientStreamHandler) : MethodRegistration(name)
    class BidiStream(name: String, val handler: BidiStreamHandler) : MethodRegistration(name)
}

/** Service registration grouping methods under a fully-qualified service name. */
data class ServiceRegistration(
    val name: String,
    val methods: Map<String, MethodRegistration>,
)

// ---------------------------------------------------------------------------
// Stream state tracking
// ---------------------------------------------------------------------------

private enum class StreamState {
    OPEN,
    HALF_CLOSED_REMOTE,
    CLOSED,
    CANCELLED,
}

/**
 * Tracks the server-side state of one logical RPC stream.
 *
 * Incoming messages are buffered in a Channel so handler coroutines can
 * consume them asynchronously via Flow.
 */
private class StreamInfo(
    val streamId: Int,
    val method: String,
) {
    var state: StreamState = StreamState.OPEN
    var sendSequence: Int = 0

    /** Channel for incoming MESSAGE payloads (client -> server). */
    val incoming: Channel<ByteArray> = Channel(Channel.UNLIMITED)

    /** Coroutine job running the handler, used for cancellation. */
    var handlerJob: Job? = null

    fun nextSendSequence(): Int = ++sendSequence
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default flow control credits. Matches DEFAULT_INITIAL_CREDITS in the TS runtime. */
private const val DEFAULT_INITIAL_CREDITS = 16

/** Protocol version advertised by this implementation. */
private const val PROTOCOL_VERSION = 1

/** Human-readable implementation identifier for handshake. */
private const val IMPLEMENTATION_ID = "rpc-bridge-android-demo/0.1.0"

/** Default capabilities advertised by this implementation. */
private val DEFAULT_CAPABILITIES = listOf("flow_control", "deadline", "cancellation")

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

// ---------------------------------------------------------------------------
// RpcBridgeServer
// ---------------------------------------------------------------------------

/**
 * Server runtime that processes RPC frames and dispatches to registered
 * service handlers. Typically bound to a [NativeBridgeTransport] which
 * bridges frames between the WebView and this server.
 *
 * @param scope     CoroutineScope for launching handler coroutines
 * @param sendFrame Callback to send an encoded RpcFrame back to the WebView
 */
class RpcBridgeServer(
    private val scope: CoroutineScope,
    private val sendFrame: (RpcFrame) -> Unit,
) {
    private val services = mutableMapOf<String, ServiceRegistration>()
    private val streams = mutableMapOf<Int, StreamInfo>()
    private var handshakeComplete = false

    // --- Public API ---

    /** Register a service with the server. */
    fun registerService(service: ServiceRegistration) {
        services[service.name] = service
        Log.d(TAG, "Registered service: ${service.name} (${service.methods.size} methods)")
    }

    /**
     * Handle an incoming frame from the transport layer.
     * This is the main entry point called by [NativeBridgeTransport].
     */
    fun handleFrame(frame: RpcFrame) {
        when (frame.type) {
            FrameType.HANDSHAKE -> handleHandshake(frame)
            FrameType.OPEN -> handleOpen(frame)
            FrameType.MESSAGE -> handleMessage(frame)
            FrameType.HALF_CLOSE -> handleHalfClose(frame)
            FrameType.CANCEL -> handleCancel(frame)
            FrameType.REQUEST_N -> handleRequestN(frame)
            else -> Log.d(TAG, "Ignoring unknown frame type ${frame.type} on stream ${frame.streamId}")
        }
    }

    /** Shut down the server and cancel all active streams. */
    fun close() {
        for ((_, stream) in streams) {
            stream.incoming.close()
            stream.handlerJob?.cancel()
        }
        streams.clear()
        Log.d(TAG, "Server closed")
    }

    // --- Handshake ---

    private fun handleHandshake(frame: RpcFrame) {
        Log.d(TAG, "Received handshake from peer: v${frame.protocolVersion}, " +
            "caps=[${frame.capabilities?.joinToString(",") ?: ""}], " +
            "impl=${frame.implementationId ?: "unknown"}")

        // Send our handshake response
        val response = createHandshakeFrame(
            protocolVersion = PROTOCOL_VERSION,
            capabilities = DEFAULT_CAPABILITIES,
            implementationId = IMPLEMENTATION_ID,
        )
        sendFrame(response)

        handshakeComplete = true
        Log.i(TAG, "Handshake complete")
    }

    // --- Stream: OPEN ---

    private fun handleOpen(frame: RpcFrame) {
        val method = frame.method
        if (method.isNullOrEmpty()) {
            sendError(frame.streamId, RpcStatusCode.INVALID_ARGUMENT, "Missing method name")
            return
        }

        // Parse "package.ServiceName/MethodName"
        val slashIdx = method.lastIndexOf('/')
        if (slashIdx < 0) {
            sendError(frame.streamId, RpcStatusCode.INVALID_ARGUMENT, "Invalid method format: $method")
            return
        }
        val serviceName = method.substring(0, slashIdx)
        val methodName = method.substring(slashIdx + 1)

        val service = services[serviceName]
        if (service == null) {
            sendError(frame.streamId, RpcStatusCode.UNIMPLEMENTED, "Unknown service: $serviceName")
            return
        }

        val registration = service.methods[methodName]
        if (registration == null) {
            sendError(frame.streamId, RpcStatusCode.UNIMPLEMENTED, "Unknown method: $method")
            return
        }

        // Create stream tracking
        val streamInfo = StreamInfo(frame.streamId, method)
        streams[frame.streamId] = streamInfo

        Log.d(TAG, "Stream ${frame.streamId} opened: $method")

        // Dispatch to the appropriate handler pattern
        dispatchMethod(streamInfo, registration)
    }

    // --- Stream: MESSAGE ---

    private fun handleMessage(frame: RpcFrame) {
        val stream = streams[frame.streamId]
        if (stream == null) {
            Log.w(TAG, "MESSAGE for unknown stream ${frame.streamId}")
            return
        }
        if (stream.state == StreamState.CANCELLED || stream.state == StreamState.CLOSED) {
            return
        }
        val payload = frame.payload ?: ByteArray(0)
        stream.incoming.trySend(payload)
    }

    // --- Stream: HALF_CLOSE ---

    private fun handleHalfClose(frame: RpcFrame) {
        val stream = streams[frame.streamId]
        if (stream == null) {
            Log.w(TAG, "HALF_CLOSE for unknown stream ${frame.streamId}")
            return
        }
        stream.state = StreamState.HALF_CLOSED_REMOTE
        stream.incoming.close() // Signal end-of-input to the handler
        Log.d(TAG, "Stream ${frame.streamId} half-closed by client")
    }

    // --- Stream: CANCEL ---

    private fun handleCancel(frame: RpcFrame) {
        val stream = streams[frame.streamId] ?: return
        Log.d(TAG, "Stream ${frame.streamId} cancelled by client")
        stream.state = StreamState.CANCELLED
        stream.incoming.close()
        stream.handlerJob?.cancel()
        streams.remove(frame.streamId)
    }

    // --- Stream: REQUEST_N (flow control) ---

    private fun handleRequestN(frame: RpcFrame) {
        // In this demo we don't block on send-side credits; we log and
        // continue. A production implementation would track credits and
        // suspend senders when exhausted.
        Log.d(TAG, "Stream ${frame.streamId}: granted ${frame.requestN} additional credits")
    }

    // --- Handler dispatch ---

    private fun dispatchMethod(stream: StreamInfo, registration: MethodRegistration) {
        stream.handlerJob = scope.launch {
            try {
                when (registration) {
                    is MethodRegistration.Unary ->
                        handleUnary(stream, registration.handler)
                    is MethodRegistration.ServerStream ->
                        handleServerStream(stream, registration.handler)
                    is MethodRegistration.ClientStream ->
                        handleClientStream(stream, registration.handler)
                    is MethodRegistration.BidiStream ->
                        handleBidiStream(stream, registration.handler)
                }
            } catch (e: Exception) {
                if (stream.state != StreamState.CANCELLED) {
                    Log.e(TAG, "Handler error for ${stream.method}: ${e.message}", e)
                    sendError(stream.streamId, RpcStatusCode.INTERNAL, e.message ?: "Internal error")
                }
            } finally {
                streams.remove(stream.streamId)
            }
        }
    }

    // --- Unary ---

    private suspend fun handleUnary(stream: StreamInfo, handler: UnaryHandler) {
        // Wait for the single request message
        val requestBytes = stream.incoming.receive()

        // Wait for HALF_CLOSE (client signals end of input)
        // For unary calls the client sends MESSAGE then HALF_CLOSE.
        // The channel will be closed by handleHalfClose.
        drainRemaining(stream)

        // Call handler
        val responseBytes = handler(requestBytes)

        // Send response
        sendFrame(
            createMessageFrame(stream.streamId, stream.nextSendSequence(), responseBytes)
        )

        // Close stream
        sendFrame(createCloseFrame(stream.streamId))
        stream.state = StreamState.CLOSED
    }

    // --- Server-streaming ---

    private suspend fun handleServerStream(stream: StreamInfo, handler: ServerStreamHandler) {
        // Wait for the single request message
        val requestBytes = stream.incoming.receive()
        drainRemaining(stream)

        // Call handler to get the response Flow
        val responses = handler(requestBytes)

        // Send each response message
        responses.collect { responseBytes ->
            if (stream.state == StreamState.CANCELLED) return@collect
            sendFrame(
                createMessageFrame(stream.streamId, stream.nextSendSequence(), responseBytes)
            )
        }

        // Close stream
        if (stream.state != StreamState.CANCELLED) {
            sendFrame(createCloseFrame(stream.streamId))
            stream.state = StreamState.CLOSED
        }
    }

    // --- Client-streaming ---

    private suspend fun handleClientStream(stream: StreamInfo, handler: ClientStreamHandler) {
        // Grant initial credits so the client can start sending
        sendFrame(createRequestNFrame(stream.streamId, DEFAULT_INITIAL_CREDITS))

        // Build a Flow from the incoming channel
        val requestFlow = channelToFlow(stream)

        // Call handler
        val responseBytes = handler(requestFlow)

        // Send response
        sendFrame(
            createMessageFrame(stream.streamId, stream.nextSendSequence(), responseBytes)
        )

        // Close stream
        sendFrame(createCloseFrame(stream.streamId))
        stream.state = StreamState.CLOSED
    }

    // --- Bidi-streaming ---

    private suspend fun handleBidiStream(stream: StreamInfo, handler: BidiStreamHandler) {
        // Grant initial credits so the client can start sending
        sendFrame(createRequestNFrame(stream.streamId, DEFAULT_INITIAL_CREDITS))

        // Build a Flow from the incoming channel
        val requestFlow = channelToFlow(stream)

        // Call handler to get the response Flow
        val responses = handler(requestFlow)

        // Send each response message
        responses.collect { responseBytes ->
            if (stream.state == StreamState.CANCELLED) return@collect
            sendFrame(
                createMessageFrame(stream.streamId, stream.nextSendSequence(), responseBytes)
            )
        }

        // Send HALF_CLOSE from server side, then CLOSE
        if (stream.state != StreamState.CANCELLED) {
            sendFrame(createHalfCloseFrame(stream.streamId))
            sendFrame(createCloseFrame(stream.streamId))
            stream.state = StreamState.CLOSED
        }
    }

    // --- Helpers ---

    /**
     * Convert a stream's incoming Channel into a Flow for handler consumption.
     * Automatically replenishes flow-control credits as messages are consumed.
     */
    private fun channelToFlow(stream: StreamInfo): Flow<ByteArray> = flow {
        var consumed = 0
        for (bytes in stream.incoming) {
            emit(bytes)
            consumed++
            // Replenish credits when we've consumed a quarter of the window
            if (consumed >= DEFAULT_INITIAL_CREDITS / 4) {
                sendFrame(createRequestNFrame(stream.streamId, consumed))
                consumed = 0
            }
        }
    }

    /**
     * Drain any remaining messages from the incoming channel.
     * Used after receiving the expected request in unary/server-streaming patterns
     * to consume the HALF_CLOSE signal.
     */
    private suspend fun drainRemaining(stream: StreamInfo) {
        // The channel will be closed when HALF_CLOSE arrives.
        // We consume and discard any extra messages (there shouldn't be any
        // for unary/server-streaming, but this keeps the protocol robust).
        for (extra in stream.incoming) {
            Log.w(TAG, "Stream ${stream.streamId}: unexpected extra message after request")
        }
    }

    /** Send an ERROR frame and clean up the stream. */
    private fun sendError(streamId: Int, code: Int, message: String) {
        try {
            sendFrame(createErrorFrame(streamId, code, message))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send error frame: ${e.message}")
        }
        streams.remove(streamId)
    }
}
