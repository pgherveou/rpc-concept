/**
 * Native WebView bridge transport (web/JS side).
 *
 * Auto-detects iOS (WKWebView) vs Android (WebView) and uses the
 * appropriate bridge API:
 *
 * iOS (WKWebView):
 *   JS -> Native: window.webkit.messageHandlers.rpcBridge.postMessage(json)
 *   Native -> JS: window.__rpcBridgeReceive(json)
 *
 * Android (WebView):
 *   JS -> Native: window.RpcBridge.sendFrame(base64)
 *   Native -> JS: window.__rpcBridgeReceive(base64)
 *   Base64 encoding is required because Android's @JavascriptInterface
 *   only supports primitive types.
 */

import { MessageTransportBase, FrameEncoding, type Logger, type RpcFrame } from '@rpc-bridge/core';

declare global {
  interface Window {
    webkit?: {
      messageHandlers: Record<string, {
        postMessage(message: unknown): void;
      }>;
    };
    __rpcBridgeReceive?: (data: string) => void;
    [key: string]: unknown;
  }
}

export interface NativeWebViewTransportOptions {
  /** Name of the global callback for receiving messages from native. */
  callbackName?: string;
  /** Optional logger. */
  logger?: Logger;
}

const DEFAULT_CALLBACK_NAME = '__rpcBridgeReceive';
const IOS_HANDLER_NAME = 'rpcBridge';
const ANDROID_INTERFACE_NAME = 'RpcBridge';

const isIOS = typeof window !== 'undefined' && !!window.webkit?.messageHandlers;

export class NativeWebViewTransport extends MessageTransportBase {
  private readonly callbackName: string;

  constructor(options: NativeWebViewTransportOptions = {}) {
    super(FrameEncoding.JSON, options.logger);
    this.callbackName = options.callbackName ?? DEFAULT_CALLBACK_NAME;

    // Register global callback for receiving messages from native.
    (window as Record<string, unknown>)[this.callbackName] = (data: string) => {
      this.handleRawMessage(isIOS ? data : atob(data));
    };

    // Verify the bridge exists
    if (isIOS) {
      if (!window.webkit?.messageHandlers[IOS_HANDLER_NAME]) {
        this.logger.warn(
          `WKWebView message handler '${IOS_HANDLER_NAME}' not found. ` +
          'Messages will fail until the native side registers the handler.',
        );
      }
    } else {
      const bridge = window[ANDROID_INTERFACE_NAME] as Record<string, unknown> | undefined;
      if (!bridge || typeof bridge.sendFrame !== 'function') {
        this.logger.warn(
          `Android bridge interface '${ANDROID_INTERFACE_NAME}' not found. ` +
          'Messages will fail until the native side injects the interface.',
        );
      }
    }
  }

  protected sendRaw(data: string | RpcFrame): void {
    if (typeof data !== 'string') {
      throw new Error('Expected JSON string but received non-string data');
    }
    if (isIOS) {
      const handler = window.webkit?.messageHandlers[IOS_HANDLER_NAME];
      if (!handler) {
        throw new Error(`WKWebView message handler '${IOS_HANDLER_NAME}' not available`);
      }
      handler.postMessage(data);
    } else {
      const bridge = window[ANDROID_INTERFACE_NAME] as Record<string, unknown> | undefined;
      if (!bridge || typeof bridge.sendFrame !== 'function') {
        throw new Error(`Android bridge interface '${ANDROID_INTERFACE_NAME}' not available`);
      }
      (bridge.sendFrame as (s: string) => void)(btoa(data));
    }
  }

  close(): void {
    delete (window as Record<string, unknown>)[this.callbackName];
    super.close();
  }
}
