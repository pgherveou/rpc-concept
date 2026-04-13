package com.rpcbridge

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch

private const val TAG = "RpcBridgeServer"

// ---------------------------------------------------------------------------
// Dispatch types
// ---------------------------------------------------------------------------

sealed class DispatchResult {
    class Unary(val data: ByteArray) : DispatchResult()
    class Stream(val responseFlow: Flow<ByteArray>) : DispatchResult()
}

interface ServiceDispatcher {
    val serviceName: String
    suspend fun dispatch(method: String, messages: Flow<ByteArray>): DispatchResult
}

// ---------------------------------------------------------------------------
// Stream state tracking
// ---------------------------------------------------------------------------

private enum class StreamState {
    OPEN,
    HALF_CLOSED_REMOTE,
    CLOSED,
    CANCELLED,
}

private class StreamInfo(
    val streamId: Int,
    val method: String,
) {
    var state: StreamState = StreamState.OPEN
    val incoming: Channel<ByteArray> = Channel(Channel.UNLIMITED)
    var handlerJob: Job? = null
}

// ---------------------------------------------------------------------------
// RpcBridgeServer
// ---------------------------------------------------------------------------

class RpcBridgeServer(
    private val scope: CoroutineScope,
    private val sendFrame: (RpcFrame) -> Unit,
) {
    private val dispatchers = mutableListOf<ServiceDispatcher>()
    private val streams = java.util.concurrent.ConcurrentHashMap<Int, StreamInfo>()

    fun registerDispatcher(dispatcher: ServiceDispatcher) {
        dispatchers.add(dispatcher)
        Log.d(TAG, "Registered dispatcher: ${dispatcher.serviceName}")
    }

    @Synchronized
    fun handleFrame(frame: RpcFrame) {
        when (val body = frame.body) {
            is FrameBody.Open -> handleOpen(frame.streamId, body.method)
            is FrameBody.Message -> handleMessage(frame.streamId, body.payload)
            is FrameBody.HalfClose -> handleHalfClose(frame.streamId)
            is FrameBody.Cancel -> handleCancel(frame.streamId)
            is FrameBody.Close -> Log.d(TAG, "Ignoring close frame on stream ${frame.streamId}")
            is FrameBody.Error -> Log.d(TAG, "Ignoring error frame on stream ${frame.streamId}")
        }
    }

    fun close() {
        for ((_, stream) in streams) {
            stream.incoming.close()
            stream.handlerJob?.cancel()
        }
        streams.clear()
        Log.d(TAG, "Server closed")
    }

    // --- Stream: OPEN ---

    private fun handleOpen(streamId: Int, method: String) {
        if (method.isEmpty()) {
            sendError(streamId, RpcStatusCode.INVALID_ARGUMENT, "Missing method name")
            return
        }

        val slashIdx = method.lastIndexOf('/')
        if (slashIdx < 0) {
            sendError(streamId, RpcStatusCode.INVALID_ARGUMENT, "Invalid method format: $method")
            return
        }
        val serviceName = method.substring(0, slashIdx)

        val dispatcher = dispatchers.find { it.serviceName == serviceName }
        if (dispatcher == null) {
            sendError(streamId, RpcStatusCode.UNIMPLEMENTED, "Unknown service: $serviceName")
            return
        }

        val streamInfo = StreamInfo(streamId, method)
        streams[streamId] = streamInfo

        Log.d(TAG, "Stream $streamId opened: $method")

        streamInfo.handlerJob = scope.launch {
            try {
                val messagesFlow = channelToFlow(streamInfo)
                val result = dispatcher.dispatch(method, messagesFlow)

                when (result) {
                    is DispatchResult.Unary -> {
                        sendFrame(createMessageFrame(streamInfo.streamId, result.data))
                        sendFrame(createCloseFrame(streamInfo.streamId))
                        streamInfo.state = StreamState.CLOSED
                    }
                    is DispatchResult.Stream -> {
                        result.responseFlow.collect { responseBytes ->
                            if (streamInfo.state == StreamState.CANCELLED) return@collect
                            sendFrame(createMessageFrame(streamInfo.streamId, responseBytes))
                        }
                        if (streamInfo.state != StreamState.CANCELLED) {
                            sendFrame(createCloseFrame(streamInfo.streamId))
                            streamInfo.state = StreamState.CLOSED
                        }
                    }
                }
            } catch (e: Exception) {
                if (streamInfo.state != StreamState.CANCELLED) {
                    Log.e(TAG, "Handler error for ${streamInfo.method}: ${e.message}", e)
                    sendError(streamInfo.streamId, RpcStatusCode.INTERNAL, e.message ?: "Internal error")
                }
            } finally {
                streams.remove(streamInfo.streamId)
            }
        }
    }

    // --- Stream: MESSAGE ---

    private fun handleMessage(streamId: Int, payload: ByteArray?) {
        val stream = streams[streamId]
        if (stream == null) {
            Log.w(TAG, "MESSAGE for unknown stream $streamId")
            return
        }
        if (stream.state == StreamState.CANCELLED || stream.state == StreamState.CLOSED) {
            return
        }
        stream.incoming.trySend(payload ?: ByteArray(0))
    }

    // --- Stream: HALF_CLOSE ---

    private fun handleHalfClose(streamId: Int) {
        val stream = streams[streamId]
        if (stream == null) {
            Log.w(TAG, "HALF_CLOSE for unknown stream $streamId")
            return
        }
        stream.state = StreamState.HALF_CLOSED_REMOTE
        stream.incoming.close()
        Log.d(TAG, "Stream $streamId half-closed by client")
    }

    // --- Stream: CANCEL ---

    private fun handleCancel(streamId: Int) {
        val stream = streams[streamId] ?: return
        Log.d(TAG, "Stream $streamId cancelled by client")
        stream.state = StreamState.CANCELLED
        stream.incoming.close()
        stream.handlerJob?.cancel()
        streams.remove(streamId)
    }

    // --- Helpers ---

    private fun channelToFlow(stream: StreamInfo): Flow<ByteArray> = flow {
        for (bytes in stream.incoming) {
            emit(bytes)
        }
    }

    private fun sendError(streamId: Int, code: Int, message: String) {
        try {
            sendFrame(createErrorFrame(streamId, code, message))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send error frame: ${e.message}")
        }
        streams.remove(streamId)
    }
}
