package com.demo.rpcbridge

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.rpcbridge.NativeBridgeTransport
import com.rpcbridge.RpcBridgeServer
import demo.hello.v1.HelloBridgeServiceDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

private const val TAG = "MainActivity"

class MainActivity : AppCompatActivity() {

    private val rpcScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private lateinit var webView: WebView
    private lateinit var transport: NativeBridgeTransport
    private lateinit var server: RpcBridgeServer

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).also { setContentView(it) }

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

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

        // 3. Register the Hello service using the generated dispatcher
        val helloService = HelloServiceImpl()
        val dispatcher = HelloBridgeServiceDispatcher(helloService)
        server.registerDispatcher(dispatcher)

        // 4. Wire incoming frames from the transport to the server
        transport.onFrame = { frame ->
            server.handleFrame(frame)
        }

        // 5. Add the @JavascriptInterface so JS can call into native code
        webView.addJavascriptInterface(RpcJavascriptInterface(transport), "RpcBridge")

        // 6. Load the web content
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: android.webkit.WebResourceRequest,
            ): Boolean {
                val url = request.url.toString()
                if (url.startsWith("file:///android_asset/")) {
                    return false
                }
                Log.w(TAG, "Blocked navigation to: $url")
                return true
            }
        }
        webView.loadUrl("file:///android_asset/index.html")

        Log.i(TAG, "RPC bridge initialized, loading web content")
    }

    override fun onDestroy() {
        transport.close()
        server.close()
        rpcScope.cancel()
        webView.parent?.let { (it as? android.view.ViewGroup)?.removeView(webView) }
        webView.removeJavascriptInterface("RpcBridge")
        webView.destroy()
        super.onDestroy()
    }
}

// ---------------------------------------------------------------------------
// JavascriptInterface bridge object
// ---------------------------------------------------------------------------

class RpcJavascriptInterface(
    private val transport: NativeBridgeTransport,
) {
    @JavascriptInterface
    fun sendFrame(base64: String) {
        transport.onReceiveFromWebView(base64)
    }
}
