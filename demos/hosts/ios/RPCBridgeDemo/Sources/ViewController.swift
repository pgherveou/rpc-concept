// RPC Bridge Playground - iOS ViewController.
//
// Hosts a WKWebView that loads the product web app. Swift provides all
// TruAPI services natively via RpcBridgeServer + NativeBridgeTransport.

import UIKit
import UserNotifications
import WebKit
import RpcBridge

// MARK: - ScriptMessageDelegate

/// Forwards WKScriptMessage events to NativeBridgeTransport without
/// creating a retain cycle with WKUserContentController.
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
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        setupWebView()
        setupBridge()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        guard let scriptMessageDelegate else { return }
        webView.configuration.userContentController.add(scriptMessageDelegate, name: "rpcBridge")
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "rpcBridge")
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

    // MARK: - Bridge Setup

    private func setupBridge() {
        transport = NativeBridgeTransport(webView: webView)
        scriptMessageDelegate = ScriptMessageDelegate(transport: transport)

        server = RpcBridgeServer(sendFrame: { [weak self] frame in
            Task { @MainActor in
                self?.transport.sendFrameToJS(frame)
            }
        })

        server.registerDispatcher(TruapiV02.GeneralServiceDispatcher(provider: GeneralServiceImpl()))
        server.registerDispatcher(TruapiV02.AccountServiceDispatcher(provider: AccountServiceImpl()))
        server.registerDispatcher(TruapiV02.ChainServiceDispatcher(provider: ChainServiceImpl()))
        server.registerDispatcher(TruapiV02.ChatServiceDispatcher(provider: ChatServiceImpl()))
        server.registerDispatcher(TruapiV02.EntropyServiceDispatcher(provider: EntropyServiceImpl()))
        server.registerDispatcher(TruapiV02.LocalStorageServiceDispatcher(provider: LocalStorageServiceImpl()))
        server.registerDispatcher(TruapiV02.PaymentServiceDispatcher(provider: PaymentServiceImpl()))
        server.registerDispatcher(TruapiV02.PermissionsServiceDispatcher(provider: PermissionsServiceImpl()))
        server.registerDispatcher(TruapiV02.PreimageServiceDispatcher(provider: PreimageServiceImpl()))
        server.registerDispatcher(TruapiV02.SigningServiceDispatcher(provider: SigningServiceImpl()))
        server.registerDispatcher(TruapiV02.StatementStoreServiceDispatcher(provider: StatementStoreServiceImpl()))

        transport.attachServer(server)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("[iOS] WebView finished navigation")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("[iOS] WebView navigation failed: \(error.localizedDescription)")
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "rpcBridge")
    }
}
