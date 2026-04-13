package com.demo.rpcbridge

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * Pure base64 frame relay between two AndroidWebViewTransport instances.
 *
 * The JS server transport uses interface "RpcBridgeServer" and callback "__rpcServerReceive".
 * The JS client transport uses interface "RpcBridgeClient" and callback "__rpcClientReceive".
 *
 * When the client sends a frame via RpcBridgeClient.sendFrame(base64),
 * we relay it to the server by calling window.__rpcServerReceive(base64).
 * When the server sends a frame via RpcBridgeServer.sendFrame(base64),
 * we relay it to the client by calling window.__rpcClientReceive(base64).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        webView.addJavascriptInterface(ClientBridge(), "RpcBridgeClient")
        webView.addJavascriptInterface(ServerBridge(), "RpcBridgeServer")

        webView.webViewClient = WebViewClient()
        webView.loadUrl("file:///android_asset/web/android-index.html")
    }

    /** Client -> Server relay: JS client calls sendFrame, we forward to server callback. */
    inner class ClientBridge {
        @JavascriptInterface
        fun sendFrame(base64: String) {
            webView.post {
                webView.evaluateJavascript("window.__rpcServerReceive('$base64')", null)
            }
        }
    }

    /** Server -> Client relay: JS server calls sendFrame, we forward to client callback. */
    inner class ServerBridge {
        @JavascriptInterface
        fun sendFrame(base64: String) {
            webView.post {
                webView.evaluateJavascript("window.__rpcClientReceive('$base64')", null)
            }
        }
    }
}
