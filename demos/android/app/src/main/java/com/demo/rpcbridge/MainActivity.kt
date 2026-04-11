/**
 * Android Demo - Main Activity
 *
 * Hosts a WebView that loads embedded web content from assets and bridges
 * RPC calls between the JavaScript client and native Kotlin service
 * implementations.
 *
 * Architecture:
 *   WebView (JS client)                    Native (Kotlin)
 *   ┌──────────────────────┐              ┌────────────────────────┐
 *   │ AndroidWebViewTransport│              │ NativeBridgeTransport  │
 *   │ RpcClient             │◄────────────►│ RpcBridgeServer        │
 *   │ HelloServiceClient    │   base64     │ HelloServiceImpl       │
 *   └──────────────────────┘   frames     └────────────────────────┘
 *
 * The JS side calls window.RpcBridge.sendFrame(base64) which is handled
 * by the @JavascriptInterface. The native side responds by calling
 * webView.evaluateJavascript("window.__rpcBridgeReceive('...')", null).
 */
package com.demo.rpcbridge

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

private const val TAG = "MainActivity"

class MainActivity : AppCompatActivity() {

    /** Coroutine scope for RPC handler coroutines; cancelled when the activity is destroyed. */
    private val rpcScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private lateinit var webView: WebView
    private lateinit var transport: NativeBridgeTransport
    private lateinit var server: RpcBridgeServer

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Create WebView programmatically (no XML layout needed for the demo)
        webView = WebView(this).also { setContentView(it) }

        // Enable JavaScript - required for the RPC bridge
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        // Debug: allow inspecting the WebView from Chrome DevTools (only in debug builds)
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        // Forward console.log from the WebView to logcat
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(
                message: String?,
                lineNumber: Int,
                sourceID: String?,
            ): Unit {
                Log.d("WebViewConsole", "$message [${sourceID}:$lineNumber]")
            }
        }

        // --- Set up the RPC bridge ---

        // 1. Create the native transport bound to this WebView
        transport = NativeBridgeTransport(webView)

        // 2. Create the RPC server, wiring its output through the transport
        server = RpcBridgeServer(rpcScope) { frame ->
            transport.sendToWebView(frame)
        }

        // 3. Register the Hello service with all its methods
        server.registerService(buildHelloService())

        // 4. Wire incoming frames from the transport to the server
        transport.onFrame = { frame ->
            server.handleFrame(frame)
        }

        // 5. Add the @JavascriptInterface so JS can call into native code
        webView.addJavascriptInterface(RpcJavascriptInterface(transport), "RpcBridge")

        // 6. Load the web content with URL navigation restrictions
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: android.webkit.WebResourceRequest,
            ): Boolean {
                val url = request.url.toString()
                // Only allow loading from the local asset directory
                if (url.startsWith("file:///android_asset/")) {
                    return false // allow
                }
                Log.w(TAG, "Blocked navigation to: $url")
                return true // block all other URLs
            }
        }
        webView.loadUrl("file:///android_asset/index.html")

        Log.i(TAG, "RPC bridge initialized, loading web content")
    }

    override fun onDestroy() {
        // Proper WebView teardown order:
        // 1. Close transport to stop sending JS to a destroyed WebView
        transport.close()
        // 2. Close the RPC server (cancels all streams)
        server.close()
        // 3. Cancel the coroutine scope
        rpcScope.cancel()
        // 4. Remove from view hierarchy before destroying
        webView.parent?.let { (it as? android.view.ViewGroup)?.removeView(webView) }
        // 5. Remove the JavascriptInterface
        webView.removeJavascriptInterface("RpcBridge")
        // 6. Destroy the WebView
        webView.destroy()
        // 7. Call super last
        super.onDestroy()
    }

    // --- Service registration ---

    /**
     * Build the HelloBridgeService registration with all four RPC method patterns.
     */
    private fun buildHelloService(): ServiceRegistration {
        return ServiceRegistration(
            name = "demo.hello.v1.HelloBridgeService",
            methods = mapOf(
                "SayHello" to MethodRegistration.Unary("SayHello") { request ->
                    sayHello(request)
                },
                "WatchGreeting" to MethodRegistration.ServerStream("WatchGreeting") { request ->
                    watchGreeting(request)
                },
                "Chat" to MethodRegistration.BidiStream("Chat") { messages ->
                    chat(messages)
                },
            ),
        )
    }
}

// ---------------------------------------------------------------------------
// JavascriptInterface bridge object
// ---------------------------------------------------------------------------

/**
 * Object injected into the WebView as `window.RpcBridge`.
 *
 * The JS transport calls `RpcBridge.sendFrame(base64)` to send frames
 * from the web client to the native server. The @JavascriptInterface
 * annotation is required by Android for methods callable from JavaScript.
 *
 * Important: @JavascriptInterface methods run on a WebView background
 * thread, not the main thread. The transport handles thread dispatch
 * internally when sending responses back.
 */
class RpcJavascriptInterface(
    private val transport: NativeBridgeTransport,
) {
    /**
     * Receive a base64-encoded protobuf frame from JavaScript.
     * Called by the JS AndroidWebViewTransport.sendRaw() method.
     */
    @JavascriptInterface
    fun sendFrame(base64: String) {
        transport.onReceiveFromWebView(base64)
    }
}
