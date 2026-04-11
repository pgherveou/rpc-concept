// RPC Bridge Demo - iOS ViewController
// Hosts a WKWebView and sets up the native RPC bridge.

import UIKit
import WebKit

class ViewController: UIViewController, WKScriptMessageHandler {
    private var webView: WKWebView!
    private var transport: NativeBridgeTransport!
    private var server: RpcBridgeServer!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        setupWebView()
        setupBridge()
    }

    // MARK: - WebView Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        let contentController = WKUserContentController()

        // Register the script message handler for receiving frames from JS
        contentController.add(self, name: "rpcBridge")
        config.userContentController = contentController

        // Allow inline media and auto-play for demo purposes
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)

        // Load the embedded web UI
        if let htmlPath = Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "web") {
            let htmlURL = URL(fileURLWithPath: htmlPath)
            webView.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())
        } else {
            // Fallback: load a simple inline page
            let html = """
            <!DOCTYPE html>
            <html>
            <body>
                <h1>RPC Bridge Demo - iOS</h1>
                <p>Web content bundle not found. Build and copy the web assets.</p>
            </body>
            </html>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }
    }

    // MARK: - Bridge Setup

    private func setupBridge() {
        // Create the native transport that bridges WKWebView messages
        transport = NativeBridgeTransport(webView: webView)

        // Create the RPC server
        server = RpcBridgeServer(transport: transport)

        // Register the hello service
        let helloService = HelloServiceImpl()
        server.registerService(
            name: "demo.hello.v1.HelloBridgeService",
            provider: helloService
        )

        // Start accepting connections (handshake)
        Task {
            do {
                try await server.start()
                print("[iOS] RPC server started, ready for connections")
            } catch {
                print("[iOS] Server start failed: \(error)")
            }
        }
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        // Receive base64-encoded frames from JavaScript
        guard message.name == "rpcBridge",
              let base64String = message.body as? String else {
            return
        }

        transport.receiveFromWebView(base64String)
    }

    deinit {
        webView?.configuration.userContentController
            .removeScriptMessageHandler(forName: "rpcBridge")
        server?.stop()
    }
}
