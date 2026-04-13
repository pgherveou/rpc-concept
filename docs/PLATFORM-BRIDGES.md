# Platform Bridge Implementations

This document describes how RPC Bridge adapts to different platform environments, the transport abstraction layer, and the security considerations for each platform.

## Transport Abstraction

All platform-specific communication is hidden behind the `Transport` interface:

```typescript
interface Transport {
  send(frame: RpcFrame): void;
  onFrame(handler: FrameHandler): () => void;  // returns unsubscribe function
  onError(handler: TransportErrorHandler): void;
  onClose(handler: TransportCloseHandler): void;
  close(): void;
  readonly isOpen: boolean;
}
```

### MessageTransportBase

`MessageTransportBase` is the abstract base class that all platform transports extend. It provides:

- **Frame serialization**: Serializes `RpcFrame` objects to JSON and deserializes incoming data back to frames.
- **Encoding strategy**: Uses structured clone (plain objects) on platforms that support it, or JSON strings on string-only bridges.
- **Handler management**: Maintains lists of frame, error, and close handlers.
- **Error handling**: Catches decode errors and routes them to error handlers.

Subclasses only need to implement two things:

```typescript
abstract class MessageTransportBase {
  // Subclass implements: send raw data over the platform bridge
  protected abstract sendRaw(data: unknown): void;

  // Subclass calls: when raw data arrives from the peer
  protected handleRawMessage(data: unknown): void;
}
```

### Frame Encoding Strategies

| Platform | Format | Reason |
|----------|--------|--------|
| Web (MessagePort) | Structured clone (object) | MessagePort supports structured clone natively |
| Web (postMessage) | JSON string | Cross-origin postMessage wraps frames in an envelope |
| iOS (WKWebView) | JSON string | `webkit.messageHandlers` only supports JSON-compatible types |
| Android (WebView) | JSON string, base64-wrapped | `@JavascriptInterface` only supports primitive types; base64 avoids quoting issues |
| Electron (MessagePort) | Structured clone (object) | Electron MessagePort supports structured clone |

## Web: MessagePort Transport (Preferred)

**Package**: `@rpc-bridge/transport-web`
**Class**: `MessagePortTransport`
**Encoding**: Structured clone (plain object)

### Architecture

```
Host Page                              Sandboxed Iframe
+-----------------------+              +-----------------------+
| MessagePortTransport  |              | MessagePortTransport  |
|   port: port1         |<--- MP ----->|   port: port2         |
+-----------------------+              +-----------------------+
        ^                                       ^
        |                                       |
   MessageChannel                          Transferred via
   .port1 (retained)                       postMessage
```

### How It Works

1. Host page creates a `MessageChannel`, which provides two entangled `MessagePort` objects.
2. Host keeps `port1` and wraps it in a `MessagePortTransport`.
3. Host transfers `port2` to the iframe via `iframe.contentWindow.postMessage(msg, origin, [port2])`.
4. Iframe receives `port2` in the `message` event's `ports` array and wraps it in its own `MessagePortTransport`.

### Structured Clone Transfer

MessagePort uses the structured clone algorithm, so `RpcFrame` objects (plain JSON-compatible objects) are passed directly without manual serialization:

```typescript
protected sendRaw(data: unknown): void {
  this.port.postMessage(data);
}
```

### Why MessagePort is Preferred

- **Dedicated channel**: No need to filter messages from other sources.
- **Structured clone**: Frame objects are cloned natively by the browser, no JSON.stringify/parse needed.
- **Bidirectional**: Both sides can send and receive.
- **Works with iframes and workers**: Same API for both.

## Web: postMessage Transport

**Package**: `@rpc-bridge/transport-web`
**Class**: `PostMessageTransport`
**Encoding**: JSON string (inside postMessage envelope)

### Architecture

```
Host Page                              Sandboxed Iframe
+-----------------------+             +-----------------------+
| PostMessageTransport  |             | PostMessageTransport  |
|   target: iframe.cw   |--- pM ----->|   target: parent      |
|   source: window      |<--- pM -----|   source: window      |
+-----------------------+             +-----------------------+
```

### How It Works

Uses `window.postMessage` for cross-origin communication. Messages are wrapped in an envelope:

```json
{
  "channel": "rpc-bridge",
  "frame": {"streamId":1, "open":{"method":"pkg.Svc/Method"}}
}
```

The `channelId` distinguishes RPC Bridge messages from other postMessage traffic.

### Security

- **Target origin**: Always specify `targetOrigin` (never use `'*'` in production).
- **Origin validation**: Validate `event.origin` on the receiving side.
- **Channel isolation**: The `channelId` filter prevents accidental processing of unrelated messages.

```typescript
constructor(options: PostMessageTransportOptions) {
  // ...
  this.messageListener = (event: MessageEvent) => {
    // Validate origin
    if (this.expectedOrigin && event.origin !== this.expectedOrigin) {
      return;  // Reject messages from unexpected origins
    }
    // Check channel ID
    if (!data || data.channel !== this.channelId) {
      return;  // Not our message
    }
    // Process frame
    this.handleRawMessage(data.frame);
  };
}
```

### When to Use postMessage

Use `PostMessageTransport` when:
- MessagePort setup is not possible (e.g., the iframe is loaded from a different origin without cooperation).
- You need compatibility with older browsers that have limited MessagePort support.
- The communication partner is a Web Worker that does not support transferables.

## Native WebView Bridge (iOS + Android)

**Package**: `@rpc-bridge/transport-native`
**Class**: `NativeWebViewTransport` (JS side, auto-detects platform)
**Encoding**: JSON string (iOS), JSON string base64-wrapped (Android)

A single JS-side transport handles both iOS and Android. Platform detection is automatic: if `window.webkit?.messageHandlers` exists, it uses the WKWebView API; otherwise it uses the Android WebView API.

### iOS (WKWebView)

```
WKWebView (JS)                          Native (Swift)
+--------------------------+             +--------------------------+
| NativeWebViewTransport   |             | WKScriptMessageHandler   |
|                          |             |                          |
| sendRaw(json) ----------+--- pM ----->| userContentController     |
|   webkit.messageHandlers |             |   .didReceive(message)   |
|   .rpcBridge.postMessage |             |                          |
|                          |             |                          |
| __rpcBridgeReceive(json)<+--- eval ---| evaluateJavaScript(      |
|   (global callback)     |             |   "window.__rpcBridge... |
+--------------------------+             |   Receive(<json>)")      |
                                         +--------------------------+
```

JS to native uses `window.webkit.messageHandlers.rpcBridge.postMessage(json)`. Native to JS uses `evaluateJavaScript` to call the global `__rpcBridgeReceive` callback with a JSON string.

### Android (WebView)

```
WebView (JS)                             Native (Kotlin)
+--------------------------+             +--------------------------+
| NativeWebViewTransport   |             | NativeBridgeTransport    |
|                          |             |                          |
| sendRaw(json) ----------+--- JI ----->| @JavascriptInterface     |
|   btoa(json) -> base64   |             |   fun sendFrame(base64)  |
|   window.RpcBridge       |             |     -> decode + process  |
|   .sendFrame(base64)    |             |                          |
|                          |             |                          |
| __rpcBridgeReceive(b64) <+--- eval ---| sendToWebView(frame)     |
|   atob(b64) -> json      |             |   -> encode + eval       |
+--------------------------+             +--------------------------+
```

Android's `@JavascriptInterface` only supports primitive types, so frames are base64-encoded for transport across the bridge. The JS side uses `btoa()`/`atob()` and the Kotlin side uses `Base64.encode`/`decode`.

### Thread Safety (Android)

- `@JavascriptInterface` methods are called on a **background thread**.
- `evaluateJavascript` MUST be called on the **main thread**.
- `NativeBridgeTransport` handles this dispatch internally using `Handler(Looper.getMainLooper())`.

### Security Considerations

- **iOS**: WKWebView runs web content in a separate process. Only explicitly registered message handlers bridge to native code.
- **Android**: On API 17+, only `@JavascriptInterface`-annotated methods are exposed. Treat all data from the WebView as untrusted.

## Electron: MessageChannelMain + MessagePort

**Package**: `@rpc-bridge/transport-electron`
**Classes**: `ElectronMainTransport` (main process), `ElectronPreloadTransport` (renderer)
**Encoding**: Structured clone (plain object)

### Architecture

```
Main Process                             Renderer Process
+--------------------------+             +--------------------------+
| ElectronMainTransport    |             | ElectronPreloadTransport |
|   port: port1 (MCM)     |<--- MP ---->|   port: port (DOM)       |
+--------------------------+             +--------------------------+
        ^                                         ^
        |                                         |
   MessageChannelMain                        Received via
   .port1 (retained)                         ipcMain -> preload
                                             -> contextBridge
```

### Setup Flow

1. **Main process** creates a `MessageChannelMain` pair:
   ```typescript
   const { port1, port2 } = new MessageChannelMain();
   ```

2. **Main process** wraps `port1` in `ElectronMainTransport`:
   ```typescript
   const mainTransport = new ElectronMainTransport({ port: port1 });
   ```

3. **Main process** sends `port2` to the renderer when requested:
   ```typescript
   ipcMain.once('rpc-bridge-request-port', (event) => {
     event.sender.postMessage('rpc-bridge-port', null, [port2]);
   });
   ```

4. **Preload script** receives `port2` via `ipcRenderer`:
   ```typescript
   ipcRenderer.on('rpc-bridge-port', (event) => {
     const [port] = event.ports;
     resolve(port);  // Resolve the promise exposed to renderer
   });
   ```

5. **Preload script** exposes the port to the renderer via `contextBridge`:
   ```typescript
   contextBridge.exposeInMainWorld('rpcBridge', {
     getPort: () => portPromise,
   });
   ```

6. **Renderer** obtains the port and wraps it in `ElectronPreloadTransport`:
   ```typescript
   const port = await window.rpcBridge.getPort();
   const transport = new ElectronPreloadTransport({ port });
   ```

### Structured Clone Transport

Electron's MessagePort API (on both the main process `MessagePortMain` and renderer-side DOM `MessagePort`) supports the structured clone algorithm. Frame objects are passed directly as plain objects:

```typescript
protected sendRaw(data: unknown): void {
  this.port.postMessage(data);
}
```

### Duck-Typed MessagePortMain

The `ElectronMainTransport` uses a duck-typed interface for Electron's `MessagePortMain` to avoid a hard dependency on the `electron` package (which would fail to import in non-Electron environments during type-checking):

```typescript
interface ElectronMessagePortMain {
  postMessage(message: unknown, transfer?: unknown[]): void;
  on(event: 'message', handler: (event: { data: unknown }) => void): this;
  on(event: 'close', handler: () => void): this;
  start(): void;
  close(): void;
}
```

### Security Model

Electron's security configuration for the demo:

```typescript
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,   // Renderer cannot access preload context
  sandbox: true,             // Preload runs sandboxed
  nodeIntegration: false,    // No Node.js APIs in renderer
}
```

The renderer has **no access** to Node.js APIs, Electron APIs, or the file system. Its only connection to the main process is through the MessagePort-based RPC bridge, exposed via `contextBridge`. This is the recommended security posture for Electron apps.

## Encoding Strategy Summary

```
                         +-- Structured clone ---+-- MessagePort (Web)
                         |   (plain object)      +-- Electron MessagePort
RpcFrame --serialize---->|
                         |                       +-- WKWebView (iOS)
                         +-- JSON string --------+-- postMessage (Web)
                         |
                         +-- JSON + base64 ------+-- Android WebView
```

### Structured Clone Advantages

- No manual serialization/deserialization in JS (the browser handles it)
- Supports nested objects natively
- Efficient for same-process communication

### JSON String Advantages

- Works with string-only APIs (WKWebView message handlers, Android `@JavascriptInterface`)
- Human-readable on the wire, easy to debug
- Compatible with older/restricted environments

## Loopback Transport (Testing)

For testing, `@rpc-bridge/core` provides a `createLoopbackTransportPair()` function that creates two connected in-memory transports:

```typescript
const [clientTransport, serverTransport] = createLoopbackTransportPair();
```

Frames sent on one transport are delivered to the other via `queueMicrotask()` (simulating async delivery). This enables testing the full RPC stack without any platform-specific APIs.
