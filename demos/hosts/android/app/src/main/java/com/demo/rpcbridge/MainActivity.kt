package com.demo.rpcbridge

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
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
        server.registerDispatcher(GeneralServiceDispatcher(GeneralServiceImpl(
            onNavigate = { url ->
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            },
            onNotification = { text, deeplink ->
                val channelId = "rpc_playground"
                val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    manager.createNotificationChannel(
                        NotificationChannel(channelId, "RPC Playground", NotificationManager.IMPORTANCE_DEFAULT)
                    )
                }
                val builder = NotificationCompat.Builder(this, channelId)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle("RPC Playground")
                    .setContentText(text)
                    .setAutoCancel(true)
                if (deeplink.isNotEmpty()) {
                    val intent = PendingIntent.getActivity(
                        this, 0, Intent(Intent.ACTION_VIEW, Uri.parse(deeplink)),
                        PendingIntent.FLAG_IMMUTABLE
                    )
                    builder.setContentIntent(intent)
                }
                manager.notify(System.currentTimeMillis().toInt(), builder.build())
            },
        )))
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
