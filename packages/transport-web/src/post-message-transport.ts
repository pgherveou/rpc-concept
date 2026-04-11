/**
 * postMessage-based transport for cross-origin iframe communication.
 *
 * Uses window.postMessage / self.postMessage for communication between
 * a host page and a sandboxed iframe. This is less efficient than
 * MessagePort (no transferables for structured data) but works in
 * environments where MessagePort setup isn't possible.
 *
 * For security, always specify the target origin.
 */

import { MessageTransportBase, FrameEncoding, type Logger } from '@rpc-bridge/core';

export interface PostMessageTransportOptions {
  /** Window or Worker to send messages to. */
  target: Window | Worker;
  /** Target origin for postMessage (use '*' only for development). */
  targetOrigin: string;
  /** Source to listen for messages on (defaults to self/window). */
  source?: Window | Worker;
  /** Expected origin of incoming messages (for validation). */
  expectedOrigin?: string;
  /** Message channel identifier to distinguish our messages from others. */
  channelId?: string;
  /** Optional logger. */
  logger?: Logger;
}

const DEFAULT_CHANNEL_ID = 'rpc-bridge';

export class PostMessageTransport extends MessageTransportBase {
  private readonly target: Window | Worker;
  private readonly targetOrigin: string;
  private readonly expectedOrigin?: string;
  private readonly channelId: string;
  private readonly messageListener: (event: MessageEvent) => void;
  private readonly source: Window | Worker;

  constructor(options: PostMessageTransportOptions) {
    // Use base64 encoding for postMessage (safer than transferring binary)
    super(FrameEncoding.BASE64, options.logger);
    this.target = options.target;
    this.targetOrigin = options.targetOrigin;
    this.expectedOrigin = options.expectedOrigin;
    this.channelId = options.channelId ?? DEFAULT_CHANNEL_ID;
    this.source = options.source ?? (typeof self !== 'undefined' ? self as unknown as Window : window);

    if (!this.expectedOrigin) {
      this.logger.warn(
        'PostMessageTransport: no expectedOrigin set -- accepting messages from ALL origins. ' +
        'Set expectedOrigin to the host origin in production.',
      );
    }

    this.messageListener = (event: MessageEvent) => {
      // Validate origin
      if (this.expectedOrigin && event.origin !== this.expectedOrigin) {
        return;
      }

      // Check channel ID
      const data = event.data;
      if (!data || typeof data !== 'object' || data.channel !== this.channelId) {
        return;
      }

      if (typeof data.frame === 'string') {
        this.handleRawMessage(data.frame);
      }
    };

    // Listen for messages
    (this.source as EventTarget).addEventListener('message', this.messageListener as EventListener);
  }

  protected sendRaw(data: Uint8Array | string): void {
    if (typeof data !== 'string') {
      throw new Error('PostMessageTransport expects base64 string data');
    }
    const message = {
      channel: this.channelId,
      frame: data,
    };

    if (this.target instanceof Worker) {
      this.target.postMessage(message);
    } else {
      (this.target as Window).postMessage(message, this.targetOrigin);
    }
  }

  close(): void {
    (this.source as EventTarget).removeEventListener('message', this.messageListener as EventListener);
    super.close();
  }
}
