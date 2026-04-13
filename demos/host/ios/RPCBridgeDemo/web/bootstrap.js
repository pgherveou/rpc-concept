(() => {
  // ../../../packages/rpc-core/dist/frame.js
  function isOpenFrame(f) {
    return "open" in f;
  }
  function isMessageFrame(f) {
    return "message" in f;
  }
  function isHalfCloseFrame(f) {
    return "halfClose" in f;
  }
  function isCloseFrame(f) {
    return "close" in f;
  }
  function isCancelFrame(f) {
    return "cancel" in f;
  }
  function isErrorFrame(f) {
    return "error" in f;
  }
  function frameType(frame) {
    if ("open" in frame)
      return "open";
    if ("message" in frame)
      return "message";
    if ("halfClose" in frame)
      return "halfClose";
    if ("close" in frame)
      return "close";
    if ("cancel" in frame)
      return "cancel";
    if ("error" in frame)
      return "error";
    return "unknown";
  }
  function createOpenFrame(streamId, method) {
    return { streamId, open: { method } };
  }
  function createMessageFrame(streamId, payload) {
    return { streamId, message: { payload } };
  }
  function createHalfCloseFrame(streamId) {
    return { streamId, halfClose: {} };
  }
  function createCancelFrame(streamId) {
    return { streamId, cancel: {} };
  }
  function frameToJSON(frame) {
    return JSON.stringify(frame, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  }
  function frameFromJSON(json) {
    return JSON.parse(json);
  }

  // ../../../packages/rpc-core/dist/types.js
  var MethodType;
  (function(MethodType2) {
    MethodType2[MethodType2["UNSPECIFIED"] = 0] = "UNSPECIFIED";
    MethodType2[MethodType2["UNARY"] = 1] = "UNARY";
    MethodType2[MethodType2["SERVER_STREAMING"] = 2] = "SERVER_STREAMING";
    MethodType2[MethodType2["CLIENT_STREAMING"] = 3] = "CLIENT_STREAMING";
    MethodType2[MethodType2["BIDI_STREAMING"] = 4] = "BIDI_STREAMING";
  })(MethodType || (MethodType = {}));
  var silentLogger = {
    debug() {
    },
    info() {
    },
    warn() {
    },
    error() {
    }
  };
  function createConsoleLogger(prefix) {
    return {
      debug: (msg, ...args) => console.debug(`[${prefix}] ${msg}`, ...args),
      info: (msg, ...args) => console.info(`[${prefix}] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[${prefix}] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[${prefix}] ${msg}`, ...args)
    };
  }

  // ../../../packages/rpc-core/dist/transport.js
  var FrameEncoding;
  (function(FrameEncoding2) {
    FrameEncoding2["STRUCTURED_CLONE"] = "structured_clone";
    FrameEncoding2["JSON"] = "json";
  })(FrameEncoding || (FrameEncoding = {}));
  var MessageTransportBase = class {
    encoding;
    frameHandlers = [];
    errorHandlers = [];
    closeHandlers = [];
    logger;
    _isOpen = true;
    constructor(encoding = FrameEncoding.STRUCTURED_CLONE, logger) {
      this.encoding = encoding;
      this.logger = logger ?? silentLogger;
    }
    get isOpen() {
      return this._isOpen;
    }
    send(frame) {
      if (!this._isOpen) {
        throw new Error("Transport is closed");
      }
      const method = isOpenFrame(frame) ? frame.open.method : "-";
      if (this.encoding === FrameEncoding.STRUCTURED_CLONE) {
        this.logger.debug(`TX frame ${frameType(frame)} stream=${frame.streamId} method=${method} (structured clone)`);
        this.sendRaw(frame);
      } else {
        this.logger.debug(`TX frame ${frameType(frame)} stream=${frame.streamId} method=${method} (json)`);
        this.sendRaw(frameToJSON(frame));
      }
    }
    /** Call this from subclass when raw data arrives from the peer. */
    handleRawMessage(data) {
      try {
        if (this.encoding === FrameEncoding.STRUCTURED_CLONE) {
          const frame = data;
          const method = isOpenFrame(frame) ? frame.open.method : "-";
          this.logger.debug(`RX frame ${frameType(frame)} stream=${frame.streamId} method=${method} (structured clone)`);
          this.dispatchFrame(frame);
        } else {
          const frame = frameFromJSON(data);
          const method = isOpenFrame(frame) ? frame.open.method : "-";
          this.logger.debug(`RX frame ${frameType(frame)} stream=${frame.streamId} method=${method} (json)`);
          this.dispatchFrame(frame);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error("Failed to decode frame:", error);
        this.emitError(error);
      }
    }
    dispatchFrame(frame) {
      const handlers = [...this.frameHandlers];
      for (const handler of handlers) {
        try {
          handler(frame);
        } catch (err) {
          this.logger.error("Frame handler error:", err);
        }
      }
    }
    onFrame(handler) {
      this.frameHandlers.push(handler);
      return () => {
        const idx = this.frameHandlers.indexOf(handler);
        if (idx >= 0)
          this.frameHandlers.splice(idx, 1);
      };
    }
    onError(handler) {
      this.errorHandlers.push(handler);
    }
    onClose(handler) {
      this.closeHandlers.push(handler);
    }
    close() {
      if (!this._isOpen)
        return;
      this._isOpen = false;
      this.logger.info("Transport closed");
      for (const handler of this.closeHandlers) {
        try {
          handler();
        } catch (err) {
          this.logger.error("Close handler error:", err);
        }
      }
      this.frameHandlers = [];
      this.errorHandlers = [];
      this.closeHandlers = [];
    }
    emitError(error) {
      for (const handler of this.errorHandlers) {
        try {
          handler(error);
        } catch (err) {
          this.logger.error("Error handler threw:", err);
        }
      }
    }
  };

  // ../../../packages/rpc-core/dist/errors.js
  var RpcStatusCode;
  (function(RpcStatusCode2) {
    RpcStatusCode2[RpcStatusCode2["OK"] = 0] = "OK";
    RpcStatusCode2[RpcStatusCode2["CANCELLED"] = 1] = "CANCELLED";
    RpcStatusCode2[RpcStatusCode2["INVALID_ARGUMENT"] = 3] = "INVALID_ARGUMENT";
    RpcStatusCode2[RpcStatusCode2["DEADLINE_EXCEEDED"] = 4] = "DEADLINE_EXCEEDED";
    RpcStatusCode2[RpcStatusCode2["UNIMPLEMENTED"] = 12] = "UNIMPLEMENTED";
    RpcStatusCode2[RpcStatusCode2["INTERNAL"] = 13] = "INTERNAL";
  })(RpcStatusCode || (RpcStatusCode = {}));
  var RpcError = class _RpcError extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.name = "RpcError";
      this.code = code;
      Object.setPrototypeOf(this, _RpcError.prototype);
    }
    get codeName() {
      return RpcStatusCode[this.code] ?? `UNKNOWN(${this.code})`;
    }
    toString() {
      return `RpcError: [${this.codeName}] ${this.message}`;
    }
    static fromFrame(errorCode, errorMessage) {
      const code = errorCode in RpcStatusCode ? errorCode : RpcStatusCode.INTERNAL;
      return new _RpcError(code, errorMessage);
    }
  };
  var DeadlineExceededError = class _DeadlineExceededError extends RpcError {
    constructor(message = "Deadline exceeded") {
      super(RpcStatusCode.DEADLINE_EXCEEDED, message);
      this.name = "DeadlineExceededError";
      Object.setPrototypeOf(this, _DeadlineExceededError.prototype);
    }
  };
  var CancelledError = class _CancelledError extends RpcError {
    constructor(message = "Stream cancelled") {
      super(RpcStatusCode.CANCELLED, message);
      this.name = "CancelledError";
      Object.setPrototypeOf(this, _CancelledError.prototype);
    }
  };

  // ../../../packages/rpc-core/dist/stream.js
  var StreamState;
  (function(StreamState2) {
    StreamState2["IDLE"] = "idle";
    StreamState2["OPEN"] = "open";
    StreamState2["HALF_CLOSED_LOCAL"] = "half_closed_local";
    StreamState2["HALF_CLOSED_REMOTE"] = "half_closed_remote";
    StreamState2["HALF_CLOSED_BOTH"] = "half_closed_both";
    StreamState2["CLOSED"] = "closed";
    StreamState2["ERROR"] = "error";
    StreamState2["CANCELLED"] = "cancelled";
  })(StreamState || (StreamState = {}));
  var Stream = class {
    streamId;
    _state = StreamState.IDLE;
    abortController = new AbortController();
    // Incoming message queue
    queue = [];
    waiter = null;
    constructor(streamId) {
      this.streamId = streamId;
    }
    get state() {
      return this._state;
    }
    get signal() {
      return this.abortController.signal;
    }
    setState(newState) {
      this._state = newState;
    }
    open() {
      this._state = StreamState.OPEN;
    }
    pushMessage(message) {
      const item = { type: "message", value: message };
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(item);
      } else {
        this.queue.push(item);
      }
    }
    pushEnd() {
      const item = { type: "end" };
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(item);
      } else {
        this.queue.push(item);
      }
    }
    pushError(error) {
      const item = { type: "error", error };
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(item);
      } else {
        this.queue.push(item);
      }
    }
    cancel(reason) {
      if (this._state === StreamState.CLOSED || this._state === StreamState.ERROR || this._state === StreamState.CANCELLED) {
        return;
      }
      this._state = StreamState.CANCELLED;
      const err = new CancelledError(reason ?? "Stream cancelled");
      this.abortController.abort(err);
      this.pushError(err);
    }
    async *messages() {
      while (true) {
        const item = await this.nextItem();
        if (item.type === "message") {
          yield item.value;
        } else if (item.type === "error") {
          throw item.error;
        } else {
          return;
        }
      }
    }
    nextItem() {
      if (this.queue.length > 0) {
        return Promise.resolve(this.queue.shift());
      }
      return new Promise((resolve) => {
        this.waiter = resolve;
      });
    }
    async collectUnary() {
      const item = await this.nextItem();
      if (item.type === "error")
        throw item.error;
      if (item.type === "end") {
        throw new RpcError(RpcStatusCode.INTERNAL, "Expected response message but stream ended");
      }
      const endItem = await this.nextItem();
      if (endItem.type === "error")
        throw endItem.error;
      if (endItem.type === "message") {
        throw new RpcError(RpcStatusCode.INTERNAL, "Expected end of stream but received another message");
      }
      return item.value;
    }
  };
  var StreamManager = class {
    streams = /* @__PURE__ */ new Map();
    nextStreamId;
    constructor(clientSide) {
      this.nextStreamId = clientSide ? 1 : 2;
    }
    createStream() {
      const id = this.nextStreamId;
      this.nextStreamId += 2;
      const stream = new Stream(id);
      this.streams.set(id, stream);
      return stream;
    }
    /** Register an externally-created stream (e.g., server accepting a client stream). */
    registerStream(stream) {
      this.streams.set(stream.streamId, stream);
    }
    /** Get a stream by ID. */
    getStream(streamId) {
      return this.streams.get(streamId);
    }
    /** Remove a stream (after it's fully closed). */
    removeStream(streamId) {
      this.streams.delete(streamId);
    }
    /** Cancel all active streams. */
    cancelAll(reason) {
      for (const stream of this.streams.values()) {
        stream.cancel(reason);
      }
      this.streams.clear();
    }
    /** Number of active streams. */
    get size() {
      return this.streams.size;
    }
  };

  // ../../../packages/rpc-core/dist/client.js
  var RpcClient = class {
    transport;
    streams;
    logger;
    defaultDeadlineMs;
    closed = false;
    constructor(options) {
      this.transport = options.transport;
      this.logger = options.logger ?? silentLogger;
      this.streams = new StreamManager(true);
      this.defaultDeadlineMs = options.defaultDeadlineMs ?? 0;
      this.transport.onFrame((frame) => this.handleFrame(frame));
      this.transport.onError((err) => this.handleTransportError(err));
      this.transport.onClose(() => this.handleTransportClose());
    }
    close() {
      if (this.closed)
        return;
      this.closed = true;
      this.streams.cancelAll("Client closed");
      this.transport.close();
    }
    async unary(method, request, options) {
      this.ensureOpen();
      const stream = this.streams.createStream();
      const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
      const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);
      try {
        this.transport.send(createOpenFrame(stream.streamId, method));
        stream.open();
        this.transport.send(createMessageFrame(stream.streamId, request));
        this.transport.send(createHalfCloseFrame(stream.streamId));
        stream.setState(StreamState.HALF_CLOSED_LOCAL);
        return await stream.collectUnary();
      } catch (err) {
        this.cancelStream(stream);
        throw err;
      } finally {
        cleanup();
        this.streams.removeStream(stream.streamId);
      }
    }
    async *serverStream(method, request, options) {
      this.ensureOpen();
      const stream = this.streams.createStream();
      const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
      const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);
      try {
        this.transport.send(createOpenFrame(stream.streamId, method));
        stream.open();
        this.transport.send(createMessageFrame(stream.streamId, request));
        this.transport.send(createHalfCloseFrame(stream.streamId));
        stream.setState(StreamState.HALF_CLOSED_LOCAL);
        for await (const msg of stream.messages()) {
          yield msg;
        }
      } catch (err) {
        this.cancelStream(stream);
        throw err;
      } finally {
        cleanup();
        this.streams.removeStream(stream.streamId);
      }
    }
    async clientStream(method, requests, options) {
      this.ensureOpen();
      const stream = this.streams.createStream();
      const deadlineMs = options?.deadlineMs ?? this.defaultDeadlineMs;
      const cleanup = this.setupCancellation(stream, options?.signal, deadlineMs);
      try {
        this.transport.send(createOpenFrame(stream.streamId, method));
        stream.open();
        for await (const req of requests) {
          if (stream.state === StreamState.CANCELLED || stream.state === StreamState.ERROR) {
            break;
          }
          this.transport.send(createMessageFrame(stream.streamId, req));
        }
        this.transport.send(createHalfCloseFrame(stream.streamId));
        stream.setState(StreamState.HALF_CLOSED_LOCAL);
        return await stream.collectUnary();
      } catch (err) {
        this.cancelStream(stream);
        throw err;
      } finally {
        cleanup();
        this.streams.removeStream(stream.streamId);
      }
    }
    bidiStream(method, requests, options) {
      const self = this;
      return (async function* () {
        self.ensureOpen();
        const stream = self.streams.createStream();
        const deadlineMs = options?.deadlineMs ?? self.defaultDeadlineMs;
        const cleanup = self.setupCancellation(stream, options?.signal, deadlineMs);
        try {
          self.transport.send(createOpenFrame(stream.streamId, method));
          stream.open();
          const sendDone = (async () => {
            try {
              for await (const req of requests) {
                if (stream.state === StreamState.CANCELLED || stream.state === StreamState.ERROR) {
                  break;
                }
                self.transport.send(createMessageFrame(stream.streamId, req));
              }
              if (stream.state === StreamState.OPEN) {
                self.transport.send(createHalfCloseFrame(stream.streamId));
                stream.setState(StreamState.HALF_CLOSED_LOCAL);
              }
            } catch (err) {
              if (!(err instanceof CancelledError)) {
                self.logger.error("Bidi send error:", err);
              }
            }
          })();
          try {
            for await (const msg of stream.messages()) {
              yield msg;
            }
          } finally {
            await sendDone.catch(() => {
            });
          }
        } catch (err) {
          self.cancelStream(stream);
          throw err;
        } finally {
          cleanup();
          self.streams.removeStream(stream.streamId);
        }
      })();
    }
    handleFrame(frame) {
      const stream = this.streams.getStream(frame.streamId);
      if (!stream) {
        this.logger.warn(`Received frame for unknown stream ${frame.streamId}`);
        return;
      }
      if (isMessageFrame(frame)) {
        stream.pushMessage(frame.message.payload);
      } else if (isCloseFrame(frame)) {
        stream.setState(StreamState.CLOSED);
        stream.pushEnd();
      } else if (isErrorFrame(frame)) {
        stream.setState(StreamState.ERROR);
        stream.pushError(RpcError.fromFrame(frame.error.errorCode, frame.error.errorMessage));
      } else if (isHalfCloseFrame(frame)) {
        if (stream.state === StreamState.HALF_CLOSED_LOCAL) {
          stream.setState(StreamState.HALF_CLOSED_BOTH);
        } else {
          stream.setState(StreamState.HALF_CLOSED_REMOTE);
        }
      } else if (isCancelFrame(frame)) {
        stream.cancel("Cancelled by server");
      } else {
        this.logger.debug(`Ignoring unknown frame on stream ${frame.streamId}`);
      }
    }
    handleTransportError(err) {
      this.logger.error("Transport error:", err);
      this.streams.cancelAll("Transport error");
    }
    handleTransportClose() {
      this.logger.info("Transport closed");
      this.streams.cancelAll("Transport closed");
      this.closed = true;
    }
    ensureOpen() {
      if (this.closed) {
        throw new RpcError(RpcStatusCode.INTERNAL, "Client is closed");
      }
      if (!this.transport.isOpen) {
        throw new RpcError(RpcStatusCode.INTERNAL, "Transport is not open");
      }
    }
    setupCancellation(stream, signal, deadlineMs) {
      let deadlineTimer;
      let abortHandler;
      if (signal) {
        if (signal.aborted) {
          stream.cancel("Aborted");
        } else {
          abortHandler = () => {
            stream.cancel("Aborted");
            this.cancelStream(stream);
          };
          signal.addEventListener("abort", abortHandler, { once: true });
        }
      }
      if (deadlineMs && deadlineMs > 0) {
        deadlineTimer = setTimeout(() => {
          if (stream.state === StreamState.OPEN || stream.state === StreamState.HALF_CLOSED_LOCAL || stream.state === StreamState.HALF_CLOSED_REMOTE) {
            stream.pushError(new DeadlineExceededError());
            stream.setState(StreamState.ERROR);
            this.cancelStream(stream);
          }
        }, deadlineMs);
      }
      return () => {
        if (deadlineTimer !== void 0) {
          clearTimeout(deadlineTimer);
        }
        if (abortHandler && signal) {
          signal.removeEventListener("abort", abortHandler);
        }
      };
    }
    cancelStream(stream) {
      try {
        if (this.transport.isOpen && stream.state !== StreamState.CLOSED && stream.state !== StreamState.ERROR) {
          this.transport.send(createCancelFrame(stream.streamId));
        }
      } catch {
      }
    }
  };

  // ../../../packages/transport-ios/dist/wkwebview-transport.js
  var DEFAULT_HANDLER_NAME = "rpcBridge";
  var DEFAULT_CALLBACK_NAME = "__rpcBridgeReceive";
  var WKWebViewTransport = class extends MessageTransportBase {
    handlerName;
    callbackName;
    constructor(options = {}) {
      super(FrameEncoding.JSON, options.logger);
      this.handlerName = options.handlerName ?? DEFAULT_HANDLER_NAME;
      this.callbackName = options.callbackName ?? DEFAULT_CALLBACK_NAME;
      window[this.callbackName] = (base64Frame) => {
        this.handleRawMessage(base64Frame);
      };
      if (!window.webkit?.messageHandlers[this.handlerName]) {
        this.logger.warn(`WKWebView message handler '${this.handlerName}' not found. Messages will fail until the native side registers the handler.`);
      }
    }
    sendRaw(data) {
      if (typeof data !== "string") {
        throw new Error("Expected JSON string but received non-string data");
      }
      const handler = window.webkit?.messageHandlers[this.handlerName];
      if (!handler) {
        throw new Error(`WKWebView message handler '${this.handlerName}' not available`);
      }
      handler.postMessage(data);
    }
    close() {
      delete window[this.callbackName];
      super.close();
    }
  };

  // src/bootstrap.ts
  var transport = new WKWebViewTransport({
    logger: createConsoleLogger("iOS-Transport")
  });
  var client = new RpcClient({
    transport,
    logger: createConsoleLogger("Guest-Client")
  });
  window.__rpcBridgeBoot(client, { json: true });
})();
//# sourceMappingURL=bootstrap.js.map
