// RPC Bridge Demo - iOS ViewController
// Hosts a WKWebView and sets up the native RPC bridge.

import UIKit
import WebKit
import RpcBridge

// MARK: - ScriptMessageDelegate

/// Weak-reference wrapper that forwards WKScriptMessageHandler calls to
/// the NativeBridgeTransport. Using a separate delegate object avoids a
/// retain cycle: WKUserContentController strongly retains its message
/// handlers, so if ViewController were the handler it would never be
/// deallocated while the WebView configuration is alive.
private class ScriptMessageDelegate: NSObject, WKScriptMessageHandler {
    private weak var transport: NativeBridgeTransport?

    init(transport: NativeBridgeTransport) {
        self.transport = transport
        super.init()
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        transport?.userContentController(userContentController, didReceive: message)
    }
}

// MARK: - ViewController

class ViewController: UIViewController, WKNavigationDelegate {
    private var webView: WKWebView!
    private var transport: NativeBridgeTransport!
    private var server: RpcBridgeServer!
    private var scriptMessageDelegate: ScriptMessageDelegate?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        setupWebView()
        setupBridge()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // Re-add the message handler when the view appears.
        // This pairs with removal in viewWillDisappear to avoid leaking
        // the handler when the view controller is off-screen.
        if let delegate = scriptMessageDelegate {
            webView?.configuration.userContentController
                .add(delegate, name: "rpcBridge")
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        // Remove the message handler to break the retain cycle while
        // the view controller is not visible.
        webView?.configuration.userContentController
            .removeScriptMessageHandler(forName: "rpcBridge")
    }

    // MARK: - WebView Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        let contentController = WKUserContentController()
        config.userContentController = contentController

        // Allow inline media and auto-play for demo purposes
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
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

        // Create a weak-reference delegate for WKScriptMessageHandler
        // to avoid retain cycles with WKUserContentController.
        // The handler is added in viewWillAppear (paired with removal in viewWillDisappear).
        scriptMessageDelegate = ScriptMessageDelegate(transport: transport)

        // Create the RPC server
        server = RpcBridgeServer(sendFrame: { [weak self] frame in
            self?.transport.sendFrameToJS(frame)
        })

        // Register the hello service dispatcher
        let helloService = HelloServiceImpl()
        let dispatcher = DemoHelloV1.HelloBridgeServiceDispatcher(provider: helloService)
        server.registerDispatcher(dispatcher)

        // Attach the server to the transport so incoming frames are routed
        transport.attachServer(server)

        print("[iOS] RPC bridge initialized, ready for connections")
    }

    // MARK: - WKNavigationDelegate

    /// Called when the webview finishes a navigation. Can be used to
    /// re-initialize bridge state if the page reloads.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("[iOS] WebView finished navigation")
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        print("[iOS] WebView navigation failed: \(error.localizedDescription)")
    }

    deinit {
        webView?.configuration.userContentController
            .removeScriptMessageHandler(forName: "rpcBridge")
        transport?.tearDown()
    }
}
