package com.rpcbridge

import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebView

private const val TAG = "NativeBridgeTransport"

class NativeBridgeTransport(
    private val webView: WebView,
    private val callbackName: String = "__rpcBridgeReceive",
) {
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var closed = false

    var onFrame: ((RpcFrame) -> Unit)? = null

    // --- Receiving frames from WebView (JS -> Native) ---

    fun onReceiveFromWebView(base64: String) {
        if (closed) return
        try {
            val frame = decodeFrameFromBase64(base64)
            Log.d(TAG, "Received frame: ${frameTypeName(frame)}, stream=${frame.streamId}")
            onFrame?.invoke(frame)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decode frame from WebView: ${e.message}", e)
        }
    }

    // --- Sending frames to WebView (Native -> JS) ---

    fun sendToWebView(frame: RpcFrame) {
        if (closed) return
        try {
            val base64 = encodeFrameToBase64(frame)
            val js = "window.$callbackName('$base64')"

            Log.d(TAG, "Sending frame: ${frameTypeName(frame)}, stream=${frame.streamId}")

            if (Looper.myLooper() == Looper.getMainLooper()) {
                if (!closed) webView.evaluateJavascript(js, null)
            } else {
                mainHandler.post {
                    if (!closed) webView.evaluateJavascript(js, null)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send frame to WebView: ${e.message}", e)
        }
    }

    // --- Lifecycle ---

    fun close() {
        closed = true
        onFrame = null
        Log.d(TAG, "Transport closed")
    }
}
