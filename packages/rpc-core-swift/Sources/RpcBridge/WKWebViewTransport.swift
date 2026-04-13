// WKWebViewTransport.swift
// RpcBridge
//
// Native-side transport adapter for the WKWebView bridge.
// Counterpart to the TypeScript WKWebViewTransport in
// packages/transport-ios/src/wkwebview-transport.ts.
//
// Communication flow:
// - JS -> Native: WKScriptMessageHandler receives JSON strings via
//   window.webkit.messageHandlers.rpcBridge.postMessage(jsonString)
// - Native -> JS: evaluateJavaScript calls the global callback
//   window.__rpcBridgeReceive(jsonString)

import Foundation
import WebKit

// MARK: - NativeBridgeTransport

@MainActor
public final class NativeBridgeTransport: NSObject, WKScriptMessageHandler {

    private let callbackName: String
    private weak var webView: WKWebView?
    private var server: RpcBridgeServer?

    public var log: (@Sendable (String) -> Void)?

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
        guard let json = try? frameToJSON(frame) else {
            log?("[Transport] Failed to encode frame to JSON")
            return
        }

        log?("[Transport] TX frame \(frameTypeName(frame)) stream=\(frame.streamId)")

        guard let webView else { return }

        // Escape the JSON string for embedding in JS
        let escaped = json
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")

        let js = "window.\(callbackName)('\(escaped)')"

        webView.evaluateJavaScript(js) { [weak self] _, error in
            if let error {
                self?.log?("[Transport] JS eval error: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - WKScriptMessageHandler

    public func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let jsonString = message.body as? String else {
            log?("[Transport] Received non-string message from JS, ignoring")
            return
        }

        guard let frame = try? frameFromJSON(jsonString) else {
            log?("[Transport] Failed to decode JSON frame from JS")
            return
        }

        log?("[Transport] RX frame \(frameTypeName(frame)) stream=\(frame.streamId)")

        server?.handleFrame(frame)
    }

    // MARK: - Cleanup

    public func tearDown() {
        server?.cancelAll()
        server = nil
        webView = nil
    }
}
