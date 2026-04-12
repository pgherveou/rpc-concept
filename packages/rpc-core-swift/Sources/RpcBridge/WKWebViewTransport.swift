// WKWebViewTransport.swift
// RpcBridge
//
// Native-side transport adapter for the WKWebView bridge.
// Counterpart to the TypeScript WKWebViewTransport in
// packages/transport-ios/src/wkwebview-transport.ts.
//
// Communication flow:
// - JS -> Native: WKScriptMessageHandler receives base64 strings via
//   window.webkit.messageHandlers.rpcBridge.postMessage(base64)
// - Native -> JS: evaluateJavaScript calls the global callback
//   window.__rpcBridgeReceive(base64)

import Foundation
import WebKit

// MARK: - NativeBridgeTransport

public final class NativeBridgeTransport: NSObject, WKScriptMessageHandler, @unchecked Sendable {

    private let callbackName: String
    private weak var webView: WKWebView?
    private var server: RpcBridgeServer?

    public var log: ((String) -> Void)?

    // MARK: - Initialization

    public init(webView: WKWebView, callbackName: String = "__rpcBridgeReceive") {
        self.webView = webView
        self.callbackName = callbackName
        super.init()
    }

    // MARK: - Server Registration

    public func attachServer(_ server: RpcBridgeServer) {
        self.server = server
    }

    // MARK: - Sending Frames to JavaScript

    public func sendFrameToJS(_ frame: RpcFrame) {
        let encoded = frame.encode()
        let base64 = dataToBase64(encoded)

        log?("[Transport] TX frame type=\(frame.type) stream=\(frame.streamID) (\(encoded.count) bytes)")

        Task { @MainActor [weak self] in
            guard let self, let webView = self.webView else { return }

            let js = "window.\(self.callbackName)('\(base64)')"

            webView.evaluateJavaScript(js) { _, error in
                if let error {
                    self.log?("[Transport] JS eval error: \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - WKScriptMessageHandler

    public func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let base64String = message.body as? String else {
            log?("[Transport] Received non-string message from JS, ignoring")
            return
        }

        guard let data = base64ToData(base64String) else {
            log?("[Transport] Failed to decode base64 from JS")
            return
        }

        let frame = RpcFrame.decode(from: data)

        log?("[Transport] RX frame type=\(frame.type) stream=\(frame.streamID) (\(data.count) bytes)")

        server?.handleFrame(frame)
    }

    // MARK: - Cleanup

    public func tearDown() {
        server?.cancelAll()
        server = nil
        webView = nil
    }
}
