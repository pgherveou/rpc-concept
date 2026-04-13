# Platform Bridge Implementations

This document describes how RPC Bridge adapts to different platform environments, the transport abstraction layer, and the security considerations for each platform.

## Transport Abstraction

All platform-specific communication is hidden behind the `Transport` interface:

```typescript
interface Transport {
  send(frame: RpcFrame): void;
  onFrame(handler: FrameHandler): void;
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
| Android (WebView) | JSON string | `@JavascriptInterface` only supports primitive types (String, int, etc.) |
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

## iOS: WKWebView Bridge

**Package**: `@rpc-bridge/transport-ios`
**Class**: `WKWebViewTransport` (JS side)
**Encoding**: JSON string

### Architecture

```
WKWebView (JS)                          Native (Swift)
+--------------------------+             +--------------------------+
| WKWebViewTransport       |             | WKScriptMessageHandler   |
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

### JS to Native (Client to Server)

The JS side calls the WKWebView message handler:

```typescript
protected sendRaw(data: unknown): void {
  window.webkit.messageHandlers.rpcBridge.postMessage(jsonString);
}
```

On the Swift side, a `WKScriptMessageHandler` receives the message:

```swift
func userContentController(_ controller: WKUserContentController,
                           didReceive message: WKScriptMessage) {
    guard let json = message.body as? String else { return }
    let frame = try JSONDecoder().decode(RpcFrame.self, from: json.data(using: .utf8)!)
    server.handleFrame(frame)
}
```

### Native to JS (Server to Client)

The Swift side evaluates JavaScript in the WebView:

```swift
func sendToWebView(frame: RpcFrame) {
    let json = String(data: try! JSONEncoder().encode(frame), encoding: .utf8)!
    let js = "window.__rpcBridgeReceive(\(json))"
    webView.evaluateJavaScript(js, completionHandler: nil)
}
```

The JS side receives via the global callback:

```typescript
window.__rpcBridgeReceive = (jsonFrame: string) => {
  this.handleRawMessage(jsonFrame);
};
```

### Why JSON Strings

WKWebView's `WKScriptMessageHandler` only supports JSON-compatible types (strings, numbers, arrays, dictionaries). Frames are serialized as JSON strings to pass through this interface.

### Security Considerations

- **WKWebView security**: WKWebView runs web content in a separate process with limited access. The only bridge to native code is through explicitly registered message handlers.
- **Handler registration**: Only register the specific message handlers needed. Avoid exposing generic native APIs.
- **Input validation**: Always validate and sanitize data received from the WebView before processing.

## Android: WebView Bridge

**Package**: `@rpc-bridge/transport-android`
**Class**: `AndroidWebViewTransport` (JS side)
**Encoding**: JSON string

### Architecture

```
WebView (JS)                             Native (Kotlin)
+--------------------------+             +--------------------------+
| AndroidWebViewTransport  |             | NativeBridgeTransport    |
|                          |             |                          |
| sendRaw(json) ----------+--- JI ----->| @JavascriptInterface     |
|   window.RpcBridge       |             |   fun sendFrame(json)    |
|   .sendFrame(json)      |             |     -> onReceiveFromWeb() |
|                          |             |                          |
| __rpcBridgeReceive(json)<+--- eval ---| sendToWebView(frame)     |
|   (global callback)     |             |   -> evaluateJavascript( |
+--------------------------+             |      "window.__rpc..."   |
                                         +--------------------------+
```

### JS to Native

The JS side calls the injected `@JavascriptInterface` object:

```typescript
protected sendRaw(data: unknown): void {
  window.RpcBridge.sendFrame(jsonString);
}
```

On the Kotlin side:

```kotlin
class WebViewBridge(private val transport: NativeBridgeTransport) {
    @JavascriptInterface
    fun sendFrame(json: String) {
        transport.onReceiveFromWebView(json)
    }
}

// Registration:
webView.addJavascriptInterface(bridge, "RpcBridge")
```

### Native to JS

The Kotlin side evaluates JavaScript:

```kotlin
fun sendToWebView(frame: RpcFrame) {
    val json = Json.encodeToString(frame)
    val js = "window.$callbackName($json)"

    // Must run on main thread
    mainHandler.post {
        webView.evaluateJavascript(js, null)
    }
}
```

### Thread Safety

Android WebView has specific threading requirements:

- `@JavascriptInterface` methods are called on a **background thread** (not the main thread).
- `evaluateJavascript` MUST be called on the **main thread**.
- The `NativeBridgeTransport` handles this dispatch internally using `Handler(Looper.getMainLooper())`.

### Security Considerations

- **`@JavascriptInterface` exposure**: Only annotate methods that should be callable from JS. Avoid exposing sensitive native APIs.
- **Target API level**: On Android API 17+, only methods annotated with `@JavascriptInterface` are exposed. On older APIs, ALL public methods are exposed (dangerous).
- **Input validation**: Treat all data from the WebView as untrusted. Validate frame structure before processing.

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
                         +-- JSON string --------+-- Android WebView
                                                 +-- postMessage (Web)
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
