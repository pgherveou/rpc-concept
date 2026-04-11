// NativeBridgeTransport.swift
// RPCBridgeDemo
//
// Native-side transport adapter for the WKWebView bridge.
// This is the counterpart to the TypeScript WKWebViewTransport in
// packages/transport-ios/src/wkwebview-transport.ts.
//
// Communication flow:
// - JS -> Native: WKScriptMessageHandler receives base64 strings via
//   window.webkit.messageHandlers.rpcBridge.postMessage(base64)
// - Native -> JS: evaluateJavaScript calls the global callback
//   window.__rpcBridgeReceive(base64)
//
// All frames are binary protobuf encoded, then base64-wrapped for transport
// over the WKWebView bridge (which only supports JSON-compatible types).

import Foundation
import WebKit

// MARK: - NativeBridgeTransport

/// Transport adapter that bridges between the WKWebView script message handler
/// and the RpcBridgeServer. Receives base64-encoded frames from JavaScript,
/// decodes them, feeds them to the server, and sends server responses back
/// to JavaScript via evaluateJavaScript.
///
/// Thread safety: WKScriptMessageHandler callbacks arrive on the main thread.
/// Frame sending (evaluateJavaScript) must also happen on the main thread.
/// The server may call sendFrame from background tasks, so we dispatch
/// those calls to the main actor.
final class NativeBridgeTransport: NSObject, WKScriptMessageHandler, @unchecked Sendable {

    /// Name of the JavaScript global callback function for receiving frames.
    /// Must match DEFAULT_CALLBACK_NAME in wkwebview-transport.ts.
    private let callbackName: String

    /// Weak reference to the WKWebView for sending frames back to JS.
    /// Weak to avoid a retain cycle (WKWebView -> userContentController ->
    /// scriptMessageHandler -> WKWebView).
    private weak var webView: WKWebView?

    /// The RPC server that processes incoming frames.
    private var server: RpcBridgeServer?

    /// Optional logging function for debugging frame traffic.
    var log: ((String) -> Void)?

    // MARK: - Initialization

    /// Create a new transport adapter.
    ///
    /// - Parameters:
    ///   - webView: The WKWebView hosting the web content.
    ///   - callbackName: Name of the JS global callback function.
    ///     Defaults to "__rpcBridgeReceive" to match the TypeScript transport.
    init(webView: WKWebView, callbackName: String = "__rpcBridgeReceive") {
        self.webView = webView
        self.callbackName = callbackName
        super.init()
    }

    // MARK: - Server Registration

    /// Attach the RPC server to this transport.
    /// The server's sendFrame callback will be wired to send frames
    /// back through the WKWebView.
    func attachServer(_ server: RpcBridgeServer) {
        self.server = server
    }

    // MARK: - Sending Frames to JavaScript

    /// Send an RpcFrame to the web client by encoding it to protobuf binary,
    /// base64-encoding the result, and calling the JavaScript callback.
    ///
    /// This method is safe to call from any thread; it dispatches to the
    /// main actor for the evaluateJavaScript call.
    func sendFrameToJS(_ frame: RpcFrame) {
        let encoded = frame.encode()
        let base64 = dataToBase64(encoded)

        log?("[Transport] TX frame type=\(frame.type) stream=\(frame.streamId) (\(encoded.count) bytes)")

        // evaluateJavaScript must be called on the main thread
        Task { @MainActor [weak self] in
            guard let self, let webView = self.webView else { return }

            // Escape the base64 string for safe embedding in JavaScript.
            // Base64 only contains [A-Za-z0-9+/=] so no special escaping
            // is needed, but we single-quote it for safety.
            let js = "window.\(self.callbackName)('\(base64)')"

            webView.evaluateJavaScript(js) { _, error in
                if let error {
                    self.log?("[Transport] JS eval error: \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - WKScriptMessageHandler

    /// Called by WKWebView when JavaScript posts a message via
    /// window.webkit.messageHandlers.rpcBridge.postMessage(base64String).
    ///
    /// This is the receive path: base64 string -> binary protobuf -> RpcFrame -> server.
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        // The message body is a base64-encoded string
        guard let base64String = message.body as? String else {
            log?("[Transport] Received non-string message from JS, ignoring")
            return
        }

        // Decode from base64 to binary
        guard let data = base64ToData(base64String) else {
            log?("[Transport] Failed to decode base64 from JS")
            return
        }

        // Decode the protobuf frame
        let frame = RpcFrame.decode(from: data)

        log?("[Transport] RX frame type=\(frame.type) stream=\(frame.streamId) (\(data.count) bytes)")

        // Dispatch to the server
        server?.handleFrame(frame)
    }

    // MARK: - Cleanup

    /// Tear down the transport, cancelling all active streams.
    func tearDown() {
        server?.cancelAll()
        server = nil
        webView = nil
    }
}
