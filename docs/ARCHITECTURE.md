# Architecture Overview

This document describes the high-level architecture of the RPC Bridge framework, a cross-platform RPC system for communication between sandboxed web content and native host code.

## What is RPC Bridge?

RPC Bridge is a framework for type-safe, streaming-capable RPC between web content (running in iframes, WebViews, or Electron renderers) and native host code (running in the host page, iOS/Swift, Android/Kotlin, or Electron main process). It uses Protocol Buffer service definitions as the source of truth and generates client stubs, server interfaces, and message encode/decode code for TypeScript, Swift, and Kotlin.

## System Overview

```
                        +-----------------------+
                        |   .proto definitions  |
                        |   (service + message) |
                        +-----------+-----------+
                                    |
                                    v
                        +-----------+-----------+
                        |      Code Generator   |
                        |  (parser + gen-ts/     |
                        |   gen-swift/gen-kotlin)|
                        +-----------+-----------+
                                    |
                    +---------------+----------------+
                    |               |                |
                    v               v                v
            +-------+------+ +-----+------+ +-------+------+
            | TypeScript    | | Swift      | | Kotlin       |
            | messages.ts   | | structs +  | | data classes |
            | client.ts     | | protocol + | | interface +  |
            | server.ts     | | dispatcher | | dispatcher   |
            +-------+------+ +-----+------+ +-------+------+
                    |               |                |
                    v               v                v
            +-------+------+ +-----+------+ +-------+------+
            | @rpc-bridge/  | | Foundation | | Android SDK  |
            | core runtime  | | (Data,     | | (ByteArray,  |
            | (frame, stream| | async/     | | coroutines)  |
            |  client,server| | await)     | |              |
            |  errors)      | +-----+------+ +-------+------+
            +-------+------+       |                |
                    |               |                |
                    v               v                v
            +-------+--------------+----------------+------+
            |              Transport Abstraction             |
            |            (MessageTransportBase)              |
            +--+--------+--------+--------+--------+--------+
               |        |        |        |        |
               v        v        v        v        v
           +------+ +------+ +------+ +------+ +------+
           | Web  | | Web  | | iOS  | |Androi| |Elect |
           | Msg  | | post | | WK   | |d Web | |ron   |
           | Port | | Msg  | | Web  | |View  | |Msg   |
           |      | |      | | View | |      | |Port  |
           +------+ +------+ +------+ +------+ +------+
```

## Layer Diagram

The system is organized into six layers, each building on the one below:

```
+===================================================================+
|                       DEMO APPLICATIONS                            |
|  Web (iframe)  |  iOS (WKWebView)  |  Android  |  Electron        |
+===================================================================+
|                     PLATFORM ADAPTERS                              |
|  MessagePort  |  postMessage  |  WKWebView  |  AndroidWebView  |  |
|  Electron MessageChannelMain / PreloadTransport                    |
+===================================================================+
|                      TRANSPORT LAYER                               |
|  Transport interface  |  MessageTransportBase                      |
|  Structured clone (object) or JSON string encoding                 |
+===================================================================+
|                       RUNTIME LAYER                                |
|  RpcClient  |  RpcServer  |  Stream  |  StreamManager             |
|  Errors  |  Types                                                  |
+===================================================================+
|                     CODE GENERATION                                |
|  Proto parser  |  gen-typescript  |  gen-swift  |  gen-kotlin      |
|  Messages (encode/decode)  |  Client stubs  |  Server dispatchers  |
+===================================================================+
|                    PROTO DEFINITIONS                                |
|  frame.proto (wire protocol)  |  hello.proto (demo service)        |
+===================================================================+
```

### Layer 1: Proto Definitions

The `.proto` files are the single source of truth. Two categories:

- **`proto/rpc/bridge/v1/frame.proto`** -- Defines `RpcFrame`, the fundamental unit of communication. Uses a `oneof body` with typed variants (OpenBody, MessageBody, HalfCloseBody, CloseBody, CancelBody, ErrorBody) to discriminate frame types. This is the wire protocol specification.

- **`demos/proto/hello.proto`** -- Defines the demo service (`HelloBridgeService`) with all four RPC patterns: unary, server-streaming, client-streaming, and bidi-streaming. Application developers write files like this.

### Layer 2: Code Generation (`packages/codegen`)

A hand-rolled proto parser reads `.proto` files and generates platform-specific code:

- **TypeScript**: `messages.ts` (interfaces and factory functions for JSON serialization), `client.ts` (typed client stubs wrapping `RpcClient`), `server.ts` (handler interfaces + dispatcher factory)
- **Swift**: `Codable` structs with `CodingKeys` for JSON serialization, service protocols, dispatcher classes
- **Kotlin**: `@Serializable` data classes using `kotlinx.serialization.json`, service interfaces, dispatcher classes

### Layer 3: Runtime (`packages/rpc-core`)

The core runtime handles the RPC lifecycle:

- **`frame.ts`** -- Frame type definitions and type guards for `RpcFrame`. The frame uses a `oneof body` discriminated union, with helper functions (`isOpenFrame`, `isMessageFrame`, etc.) for type-safe dispatch.
- **`client.ts`** -- `RpcClient` manages outgoing calls: stream creation, frame dispatch, deadlines, cancellation.
- **`server.ts`** -- `RpcServer` dispatches incoming calls to registered service handlers. Supports all four RPC patterns.
- **`stream.ts`** -- `Stream` manages a single logical stream's lifecycle and message buffering. `StreamManager` tracks all active streams per connection.
- **`errors.ts`** -- Error codes (OK, CANCELLED, INVALID_ARGUMENT, DEADLINE_EXCEEDED, UNIMPLEMENTED, INTERNAL).
- **`transport.ts`** -- The `Transport` interface and `MessageTransportBase` abstract class that all platform adapters extend.

### Layer 4: Transport

The `Transport` interface defines the minimal contract for sending and receiving `RpcFrame` messages:

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

`MessageTransportBase` provides the common logic for serializing frames (structured clone or JSON string), deserializing incoming data, and managing handler registration. Platform adapters only need to implement `sendRaw()` and call `handleRawMessage()`.

### Layer 5: Platform Adapters

Each platform has a transport adapter that bridges the `Transport` interface to the platform's native messaging primitive:

| Package | Platform | Mechanism | Encoding |
|---------|----------|-----------|----------|
| `transport-web` | Browser | `MessagePort` | Structured clone (object) |
| `transport-web` | Browser | `postMessage` | JSON string |
| `transport-ios` | iOS WKWebView | `webkit.messageHandlers` + `evaluateJavaScript` | JSON string |
| `transport-android` | Android WebView | `@JavascriptInterface` + `evaluateJavascript` | JSON string |
| `transport-electron` | Electron | `MessagePort` / `MessageChannelMain` | Structured clone (object) |

### Layer 6: Demo Applications

Each demo has a **host** (native/platform code running the RPC server) and embeds the shared **guest app** (web client running the RPC client). The guest app lives in `demos/guest-app/` and is bundled per-platform.

A host can embed multiple products simultaneously, each with its own transport and RpcServer. The transport itself is the routing mechanism: responses flow back through the same physical channel that received the request. See [TRADEOFFS.md](TRADEOFFS.md#multi-product-support) for details.

- **`demos/proto`** -- Proto service definitions shared by guest and host. Generated code goes to `demos/generated/`.
- **`demos/guest-app`** -- Shared guest web client (React). Single entry point (`main.ts`) with dual boot: MessagePort via `message` event (web/Electron) or direct transport injection via `window.__rpcBridgeBoot` (iOS/Android).
- **`demos/host/web`** -- Web host: host page with `RpcServer`, sandboxed iframe loads guest app via `MessagePort`
- **`demos/host/electron`** -- Electron host: main process server, sandboxed renderer loads guest app via `MessageChannelMain`
- **`demos/host/ios`** -- iOS host: Swift app with `RpcBridgeServer`, `HelloServiceImpl`, WKWebView loads guest app
- **`demos/host/android`** -- Android host: Gradle project with `RpcBridgeServer`, `HelloServiceImpl`, WebView loads guest app

## Monorepo Structure

```
rpc-concept/
  proto/
    rpc/bridge/v1/frame.proto     # Core wire protocol (RpcFrame)
  packages/                       # Framework code only
    rpc-core/                       Core runtime (frame, client, server, stream)
    codegen/                        Code generator (parser + gen-ts/swift/kotlin)
    rpc-core-swift/                 Swift package (frame codec, server runtime, WKWebView transport)
    rpc-core-android/               Android library (frame codec, server runtime, WebView transport)
    transport-web/                  Browser transports (MessagePort, postMessage)
    transport-ios/                  iOS WKWebView transport (JS side)
    transport-android/              Android WebView transport (JS side)
    transport-electron/             Electron transports (preload + main)
  demos/                          # Demo applications
    proto/hello.proto               Demo service proto definition (shared by guest + host)
    generated/                      Generated TS messages + stubs (client + server)
    guest-app/                      Shared guest web client
      src/main.ts                     Single entry point (dual boot)
      src/ui.ts                       Shared demo UI
    host/
      web/                          Web host (host page + iframe shell)
      ios/                          iOS host (Swift app + WKWebView)
      electron/                     Electron host (main process + preload)
      android/                      Android host (Gradle project)
  tests/                          # Unit and integration tests
  e2e/                            # Playwright e2e tests
  docs/                           # This documentation
```

## How the Pieces Fit Together

### A Typical RPC Call

1. **Application code** calls a typed method on a generated client stub (e.g., `client.sayHello(request)`).
2. The **generated client** encodes the request message using the generated `encode()` function and delegates to `RpcClient.unary()`.
3. `RpcClient` creates a new `Stream`, sends OPEN + MESSAGE + HALF_CLOSE frames via the `Transport`.
4. The **transport adapter** serializes each `RpcFrame` to JSON and sends it through the platform-specific channel (structured clone for MessagePort, JSON string for WebView bridges).
5. On the other side, the **transport adapter** receives the data, deserializes it back to an `RpcFrame`, and dispatches to the `RpcServer`.
6. `RpcServer` parses the method name from the OPEN frame, looks up the registered service, creates a server-side `Stream`, and dispatches to the handler.
7. The **generated dispatcher** deserializes the request into a typed message, calls the application's handler implementation, and serializes the response.
8. `RpcServer` sends the response MESSAGE + CLOSE frames back through the transport.
9. `RpcClient` receives the response, resolves the promise, and the generated client deserializes the response into a typed message.

## Design Decisions and Rationale

### Why Not gRPC Transport?

gRPC was the inspiration for this protocol's design (streaming patterns, status codes, method naming), but gRPC itself was not suitable as the transport for several reasons:

1. **gRPC-Web limitations**: gRPC-Web does not support client-streaming or bidi-streaming in browsers. It requires a proxy (Envoy) for HTTP/2 translation, adding operational complexity.

2. **WebView incompatibility**: There is no gRPC transport for WKWebView (`webkit.messageHandlers`), Android WebView (`@JavascriptInterface`), or Electron IPC.

3. **Sandboxing requirements**: The web content runs in sandboxed iframes or WebViews with no network access. Communication must happen through the platform's native bridge API, not over HTTP.

4. **Structured clone efficiency**: On platforms that support structured clone (MessagePort, Electron MessageChannelMain), frames are passed as plain objects without serialization overhead.

5. **Minimal footprint**: JSON encoding requires no additional libraries. Proto definitions are used for code generation only, not runtime encoding.

### The Proto-First Philosophy

The `.proto` file is the contract between client and server:

- **Messages** define the data shapes, generating typed structs/classes for every platform.
- **Services** define the RPC methods with their streaming patterns.
- **Code generation** produces typed, safe code for every target platform.
- **Wire compatibility** is guaranteed because all platforms use JSON serialization with the same schema derived from the proto definitions.

### Frame Protocol Design

The frame protocol is intentionally minimal for local IPC:

- A single `RpcFrame` message uses a `oneof body` to discriminate between frame types (open, message, half_close, close, cancel, error).
- Each body variant carries only the fields relevant to its frame type, enforced by the type system on every platform.
- Unknown body variants are silently ignored, enabling forward compatibility.
- No handshake, no sequence numbers, no metadata, no flow control. Guest and host are built together and communicate within the same process.

## Message Flow by RPC Pattern

### Unary (Request-Response)

```
Client                                    Server
  |                                         |
  |--- OPEN (method) ---------------------->|
  |--- MESSAGE (request payload) ---------->|
  |--- HALF_CLOSE ------------------------->|
  |                                         |  (dispatches to handler)
  |<-- MESSAGE (response payload) ----------|
  |<-- CLOSE -------------------------------|
  |                                         |
```

### Server Streaming

```
Client                                    Server
  |                                         |
  |--- OPEN (method) ---------------------->|
  |--- MESSAGE (request payload) ---------->|
  |--- HALF_CLOSE ------------------------->|
  |                                         |  (dispatches to handler)
  |<-- MESSAGE (response 1) ----------------|
  |<-- MESSAGE (response 2) ----------------|
  |<-- MESSAGE (response 3) ----------------|
  |<-- ...                                  |
  |<-- CLOSE -------------------------------|
  |                                         |
```

### Client Streaming

```
Client                                    Server
  |                                         |
  |--- OPEN (method) ---------------------->|
  |--- MESSAGE (request 1) ---------------->|
  |--- MESSAGE (request 2) ---------------->|
  |--- MESSAGE (request 3) ---------------->|
  |--- HALF_CLOSE ------------------------->|
  |                                         |  (handler processes all requests)
  |<-- MESSAGE (response payload) ----------|
  |<-- CLOSE -------------------------------|
  |                                         |
```

### Bidirectional Streaming

```
Client                                    Server
  |                                         |
  |--- OPEN (method) ---------------------->|
  |--- MESSAGE (request 1) ---------------->|
  |<-- MESSAGE (response 1) ----------------|
  |--- MESSAGE (request 2) ---------------->|
  |<-- MESSAGE (response 2a) ---------------|
  |<-- MESSAGE (response 2b) ---------------|
  |--- MESSAGE (request 3) ---------------->|
  |--- HALF_CLOSE ------------------------->|
  |<-- MESSAGE (response 3) ----------------|
  |<-- CLOSE -------------------------------|
  |                                         |
```

### Cancellation (Any Pattern)

```
Client                                    Server
  |                                         |
  |--- OPEN ------>                         |
  |--- MESSAGE --->  (RPC in progress)      |
  |                                         |
  |--- CANCEL ----------------------------->|
  |                                         |  (handler task cancelled)
  |                                         |
```

Either side can send CANCEL. The recipient should stop processing and clean up the stream. No further frames should be sent on a cancelled stream.
