// RPC Bridge Playground - iOS ViewController.
//
// Hosts a single WKWebView that loads both the JS client (product-ios.js)
// and the JS server (host-ios.js). Swift acts as a pure frame relay between
// two WKWebViewTransport instances, mirroring the Android playground design:
//
//   JS client TX -> rpcBridgeClient handler -> window.__rpcServerReceive
//   JS server TX -> rpcBridgeServer handler -> window.__rpcClientReceive
//
// No RpcBridge Swift library is used; this demo intentionally exercises only
// the WKWebView transport layer.

import UIKit
import WebKit

// MARK: - RelayDelegate

/// Forwards script messages from one named channel to a paired JS callback.
/// Held weakly so WKUserContentController does not create a retain cycle
/// with the ViewController.
private final class RelayDelegate: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private let outboundCallback: String

    init(webView: WKWebView, outboundCallback: String) {
        self.webView = webView
        self.outboundCallback = outboundCallback
        super.init()
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let webView, let json = message.body as? String else { return }
        let escaped = escapeForJSStringLiteral(json)
        let js = "window.\(outboundCallback)('\(escaped)')"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

/// Escape a JSON string for safe embedding inside a single-quoted JS string
/// literal. Mirrors the escaping in NativeBridgeTransport.swift.
private func escapeForJSStringLiteral(_ s: String) -> String {
    return s
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "'", with: "\\'")
        .replacingOccurrences(of: "\n", with: "\\n")
        .replacingOccurrences(of: "\r", with: "\\r")
        .replacingOccurrences(of: "\t", with: "\\t")
        .replacingOccurrences(of: "\0", with: "\\0")
        .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
        .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
}

// MARK: - ViewController

class ViewController: UIViewController, WKNavigationDelegate {
    private var webView: WKWebView!
    private var serverRelay: RelayDelegate?
    private var clientRelay: RelayDelegate?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        setupWebView()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        addRelays()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        removeRelays()
    }

    // MARK: - WebView Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.userContentController = WKUserContentController()
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif
        view.addSubview(webView)

        // The JS server handler reads frames the JS client wants to send to
        // the server and forwards them to __rpcServerReceive.
        clientRelay = RelayDelegate(webView: webView, outboundCallback: "__rpcServerReceive")
        // And vice versa.
        serverRelay = RelayDelegate(webView: webView, outboundCallback: "__rpcClientReceive")

        if let htmlPath = Bundle.module.path(forResource: "index", ofType: "html", inDirectory: "web") {
            let htmlURL = URL(fileURLWithPath: htmlPath)
            webView.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())
        } else {
            let html = """
            <!DOCTYPE html>
            <html><body>
                <h1>RPC Bridge Playground - iOS</h1>
                <p>Web content bundle not found. Run copy-assets.sh after npm run build.</p>
            </body></html>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }
    }

    // MARK: - Handler lifecycle

    private func addRelays() {
        guard let clientRelay, let serverRelay else { return }
        let controller = webView.configuration.userContentController
        controller.add(clientRelay, name: "rpcBridgeClient")
        controller.add(serverRelay, name: "rpcBridgeServer")
    }

    private func removeRelays() {
        let controller = webView?.configuration.userContentController
        controller?.removeScriptMessageHandler(forName: "rpcBridgeClient")
        controller?.removeScriptMessageHandler(forName: "rpcBridgeServer")
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("[iOS] WebView finished navigation")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("[iOS] WebView navigation failed: \(error.localizedDescription)")
    }

    deinit {
        let controller = webView?.configuration.userContentController
        controller?.removeScriptMessageHandler(forName: "rpcBridgeClient")
        controller?.removeScriptMessageHandler(forName: "rpcBridgeServer")
    }
}
