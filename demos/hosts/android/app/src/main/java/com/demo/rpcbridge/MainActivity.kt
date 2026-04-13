package com.demo.rpcbridge

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.rpcbridge.NativeBridgeTransport
import com.rpcbridge.RpcBridgeServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import truapi.v02.*

private const val TAG = "MainActivity"

class MainActivity : AppCompatActivity() {
    private val rpcScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var webView: WebView
    private lateinit var transport: NativeBridgeTransport
    private lateinit var server: RpcBridgeServer

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        if (BuildConfig.DEBUG) { WebView.setWebContentsDebuggingEnabled(true) }

        // Native RPC bridge
        transport = NativeBridgeTransport(webView)
        server = RpcBridgeServer(rpcScope) { frame -> transport.sendToWebView(frame) }

        // Register all 11 TruAPI service dispatchers
        server.registerDispatcher(GeneralServiceDispatcher(GeneralServiceImpl()))
        server.registerDispatcher(AccountServiceDispatcher(AccountServiceImpl()))
        server.registerDispatcher(ChainServiceDispatcher(ChainServiceImpl()))
        server.registerDispatcher(ChatServiceDispatcher(ChatServiceImpl()))
        server.registerDispatcher(EntropyServiceDispatcher(EntropyServiceImpl()))
        server.registerDispatcher(LocalStorageServiceDispatcher(LocalStorageServiceImpl()))
        server.registerDispatcher(PaymentServiceDispatcher(PaymentServiceImpl()))
        server.registerDispatcher(PermissionsServiceDispatcher(PermissionsServiceImpl()))
        server.registerDispatcher(PreimageServiceDispatcher(PreimageServiceImpl()))
        server.registerDispatcher(SigningServiceDispatcher(SigningServiceImpl()))
        server.registerDispatcher(StatementStoreServiceDispatcher(StatementStoreServiceImpl()))

        transport.onFrame = { frame -> server.handleFrame(frame) }
        webView.addJavascriptInterface(RpcJavascriptInterface(transport), "RpcBridge")

        webView.webViewClient = WebViewClient()
        webView.loadUrl("file:///android_asset/web/index.html")
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

class RpcJavascriptInterface(private val transport: NativeBridgeTransport) {
    @JavascriptInterface
    fun sendFrame(base64: String) {
        transport.onReceiveFromWebView(base64)
    }
}
