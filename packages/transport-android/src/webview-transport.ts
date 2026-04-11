/**
 * Android WebView bridge transport (web/JS side).
 *
 * Communication pattern:
 * - JS -> Native: Calls a @JavascriptInterface method injected by Android:
 *     window.<interfaceName>.sendFrame(base64String)
 * - Native -> JS: Android calls WebView.evaluateJavascript() with a
 *     global callback function.
 *
 * Since Android WebView's @JavascriptInterface only supports primitive types
 * (String, int, etc.), we use base64 encoding for frame data.
 *
 * On the Kotlin/Android side:
 *   webView.addJavascriptInterface(bridgeObject, interfaceName)
 *   bridgeObject exposes: @JavascriptInterface fun sendFrame(base64: String)
 *   To send to JS: webView.evaluateJavascript("window.__rpcBridgeReceive('...')", null)
 */

import { MessageTransportBase, FrameEncoding, type Logger } from '@rpc-bridge/core';

declare global {
  interface Window {
    __rpcBridgeReceive?: (base64Frame: string) => void;
    [key: string]: unknown;
  }
}

export interface AndroidWebViewTransportOptions {
  /** Name of the @JavascriptInterface object on window. */
  interfaceName?: string;
  /** Name of the global callback for receiving messages from native. */
  callbackName?: string;
  /** Optional logger. */
  logger?: Logger;
}

const DEFAULT_INTERFACE_NAME = 'RpcBridge';
const DEFAULT_CALLBACK_NAME = '__rpcBridgeReceive';

export class AndroidWebViewTransport extends MessageTransportBase {
  private readonly interfaceName: string;

  constructor(options: AndroidWebViewTransportOptions = {}) {
    super(FrameEncoding.BASE64, options.logger);
    this.interfaceName = options.interfaceName ?? DEFAULT_INTERFACE_NAME;
    const callbackName = options.callbackName ?? DEFAULT_CALLBACK_NAME;

    // Register global callback for receiving messages from native
    (window as Record<string, unknown>)[callbackName] = (base64Frame: string) => {
      this.handleRawMessage(base64Frame);
    };

    // Verify the interface exists
    const bridge = window[this.interfaceName] as Record<string, unknown> | undefined;
    if (!bridge || typeof bridge.sendFrame !== 'function') {
      this.logger.warn(
        `Android bridge interface '${this.interfaceName}' not found. ` +
        'Messages will fail until the native side injects the interface.',
      );
    }
  }

  protected sendRaw(data: Uint8Array | string): void {
    const base64 = typeof data === 'string' ? data : '';
    const bridge = window[this.interfaceName] as Record<string, unknown> | undefined;
    if (!bridge || typeof bridge.sendFrame !== 'function') {
      throw new Error(`Android bridge interface '${this.interfaceName}' not available`);
    }
    (bridge.sendFrame as (s: string) => void)(base64);
  }

  close(): void {
    super.close();
  }
}
