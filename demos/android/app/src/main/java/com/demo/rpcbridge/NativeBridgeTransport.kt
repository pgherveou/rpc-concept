/**
 * Native-side bridge transport for Android WebView.
 *
 * This is the Kotlin counterpart to AndroidWebViewTransport (the JS side).
 * It forms the native half of the communication channel:
 *
 *   WebView (JS)                          Native (Kotlin)
 *   ┌───────────────────────┐            ┌───────────────────────────┐
 *   │ AndroidWebViewTransport│            │ NativeBridgeTransport     │
 *   │                       │  base64    │                           │
 *   │ sendRaw() ──────────► │ ─────────► │ onReceiveFromWebView()    │
 *   │                       │ interface  │   └─> decode + dispatch   │
 *   │                       │            │                           │
 *   │ __rpcBridgeReceive() ◄│ ◄───────── │ sendToWebView()           │
 *   │                       │ evaluate   │   └─> encode + eval JS    │
 *   └───────────────────────┘            └───────────────────────────┘
 *
 * Thread safety: [onReceiveFromWebView] is called on the @JavascriptInterface
 * thread (a WebView background thread), while [sendToWebView] must call
 * evaluateJavascript on the main thread. This class handles the thread
 * dispatch internally.
 */
package com.demo.rpcbridge

import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebView

private const val TAG = "NativeBridgeTransport"

/**
 * Bridges RPC frames between the WebView and the native [RpcBridgeServer].
 *
 * @param webView          The WebView hosting the JS client
 * @param callbackName     The global JS function name to call for native->JS frames.
 *                         Must match the callbackName in AndroidWebViewTransport options.
 */
class NativeBridgeTransport(
    private val webView: WebView,
    private val callbackName: String = "__rpcBridgeReceive",
) {
    private val mainHandler = Handler(Looper.getMainLooper())

    /** Guard flag to prevent evaluateJavascript calls after WebView is destroyed. */
    @Volatile
    private var closed = false

    /**
     * Listener invoked when a decoded frame arrives from the WebView.
     * Set this before the WebView loads content so no frames are missed.
     */
    var onFrame: ((RpcFrame) -> Unit)? = null

    // --- Receiving frames from WebView (JS -> Native) ---

    /**
     * Called by the @JavascriptInterface method when the JS side sends a frame.
     * Decodes the base64 payload and dispatches to the registered listener.
     *
     * Note: This runs on a WebView background thread (not the main thread).
     */
    fun onReceiveFromWebView(base64: String) {
        if (closed) return
        try {
            val frame = decodeFrameFromBase64(base64)
            Log.d(TAG, "Received frame: type=${frame.type}, stream=${frame.streamId}")
            onFrame?.invoke(frame)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decode frame from WebView: ${e.message}", e)
        }
    }

    // --- Sending frames to WebView (Native -> JS) ---

    /**
     * Encode an [RpcFrame] and deliver it to the WebView by calling the
     * global JS callback function via evaluateJavascript.
     *
     * This method is safe to call from any thread; it dispatches to the
     * main thread internally since evaluateJavascript requires it.
     */
    fun sendToWebView(frame: RpcFrame) {
        if (closed) return
        try {
            val base64 = encodeFrameToBase64(frame)
            val js = "window.$callbackName('$base64')"

            Log.d(TAG, "Sending frame: type=${frame.type}, stream=${frame.streamId}")

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

    /**
     * Mark this transport as closed. After this call, no further
     * evaluateJavascript calls will be made, preventing crashes when
     * the WebView is destroyed.
     */
    fun close() {
        closed = true
        onFrame = null
        Log.d(TAG, "Transport closed")
    }
}
