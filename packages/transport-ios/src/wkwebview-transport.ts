/**
 * WKWebView bridge transport (web/JS side).
 *
 * Communication pattern:
 * - JS -> Native: window.webkit.messageHandlers.<name>.postMessage(base64String)
 * - Native -> JS: WKWebView.evaluateJavaScript() calls a global callback function
 *
 * The native side (Swift) uses WKScriptMessageHandler to receive messages
 * and evaluateJavaScript to send messages back.
 *
 * Since WKWebView message handlers only support JSON-compatible types,
 * we use base64 encoding for frame data.
 */

import { MessageTransportBase, FrameEncoding, type Logger } from '@rpc-bridge/core';

/** Global type declarations for WKWebView bridge */
declare global {
  interface Window {
    webkit?: {
      messageHandlers: Record<string, {
        postMessage(message: unknown): void;
      }>;
    };
    __rpcBridgeReceive?: (base64Frame: string) => void;
  }
}

export interface WKWebViewTransportOptions {
  /** Name of the WKWebView message handler (registered on native side). */
  handlerName?: string;
  /** Name of the global callback function for receiving messages. */
  callbackName?: string;
  /** Optional logger. */
  logger?: Logger;
}

const DEFAULT_HANDLER_NAME = 'rpcBridge';
const DEFAULT_CALLBACK_NAME = '__rpcBridgeReceive';

export class WKWebViewTransport extends MessageTransportBase {
  private readonly handlerName: string;

  constructor(options: WKWebViewTransportOptions = {}) {
    super(FrameEncoding.BASE64, options.logger);
    this.handlerName = options.handlerName ?? DEFAULT_HANDLER_NAME;
    const callbackName = options.callbackName ?? DEFAULT_CALLBACK_NAME;

    // Register the global callback for receiving messages from native
    (window as unknown as Record<string, unknown>)[callbackName] = (base64Frame: string) => {
      this.handleRawMessage(base64Frame);
    };

    // Verify the message handler exists
    if (!window.webkit?.messageHandlers[this.handlerName]) {
      this.logger.warn(
        `WKWebView message handler '${this.handlerName}' not found. ` +
        'Messages will fail until the native side registers the handler.',
      );
    }
  }

  protected sendRaw(data: Uint8Array | string): void {
    const base64 = typeof data === 'string' ? data : '';
    const handler = window.webkit?.messageHandlers[this.handlerName];
    if (!handler) {
      throw new Error(`WKWebView message handler '${this.handlerName}' not available`);
    }
    handler.postMessage(base64);
  }

  close(): void {
    super.close();
  }
}
