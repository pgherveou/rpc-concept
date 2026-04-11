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
            |  flow-control)| +-----+------+ +-------+------+
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
|  Transport interface  |  MessageTransportBase  |  FrameEncoding   |
|  Binary (Uint8Array) or Base64 (string) encoding                  |
+===================================================================+
|                       RUNTIME LAYER                                |
|  RpcClient  |  RpcServer  |  Stream  |  StreamManager             |
|  Handshake  |  FlowControl  |  Errors  |  Types                   |
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

- **`proto/rpc/bridge/v1/frame.proto`** -- Defines `RpcFrame`, the fundamental unit of communication. All frame types (HANDSHAKE, OPEN, MESSAGE, HALF_CLOSE, CLOSE, CANCEL, ERROR, REQUEST_N) and their fields are defined here. This is the wire protocol specification.

- **`proto/demo/hello/v1/hello.proto`** -- Defines the demo service (`HelloBridgeService`) with all four RPC patterns: unary, server-streaming, client-streaming, and bidi-streaming. Application developers write files like this.

### Layer 2: Code Generation (`packages/codegen`)

A hand-rolled proto parser reads `.proto` files and generates platform-specific code:

- **TypeScript**: `messages.ts` (classes with static `encode`/`decode`), `client.ts` (typed client stubs wrapping `RpcClient`), `server.ts` (handler interfaces + dispatcher factory)
- **Swift**: structs with `encode()`/`decode(from:)`, service protocols, dispatcher classes
- **Kotlin**: data classes with `encode()`/`decode()`, service interfaces, dispatcher classes

### Layer 3: Runtime (`packages/rpc-core`)

The core runtime handles the RPC lifecycle:

- **`frame.ts`** -- Hand-rolled protobuf encoder/decoder for `RpcFrame`. Wire-compatible with native protobuf parsers on Swift/Kotlin, but avoids requiring a protobuf runtime dependency in JavaScript.
- **`client.ts`** -- `RpcClient` manages outgoing calls: stream creation, frame dispatch, flow control, deadlines, cancellation.
- **`server.ts`** -- `RpcServer` dispatches incoming calls to registered service handlers. Supports all four RPC patterns.
- **`stream.ts`** -- `Stream` manages a single logical stream's lifecycle and message buffering. `StreamManager` tracks all active streams per connection.
- **`flow-control.ts`** -- Credit-based backpressure via `SendFlowController` and `ReceiveFlowController`. Uses REQUEST_N frames for credit replenishment.
- **`handshake.ts`** -- Protocol version negotiation and capability intersection.
- **`errors.ts`** -- Structured error codes modeled after gRPC status codes.
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

`MessageTransportBase` provides the common logic for encoding frames (binary or base64), decoding incoming raw data, and managing handler registration. Platform adapters only need to implement `sendRaw()` and call `handleRawMessage()`.

### Layer 5: Platform Adapters

Each platform has a transport adapter that bridges the `Transport` interface to the platform's native messaging primitive:

| Package | Platform | Mechanism | Encoding |
|---------|----------|-----------|----------|
| `transport-web` | Browser | `MessagePort` | Binary (with transferable `ArrayBuffer`) |
| `transport-web` | Browser | `postMessage` | Base64 (string) |
| `transport-ios` | iOS WKWebView | `webkit.messageHandlers` + `evaluateJavaScript` | Base64 |
| `transport-android` | Android WebView | `@JavascriptInterface` + `evaluateJavascript` | Base64 |
| `transport-electron` | Electron | `MessagePort` / `MessageChannelMain` | Binary |

### Layer 6: Demo Applications

Complete working demos for each platform:

- **`demos/web`** -- Host page with `RpcServer` + sandboxed iframe with `RpcClient`, connected via `MessagePort`
- **`demos/electron`** -- Main process server + sandboxed renderer client via `MessageChannelMain`
- **`demos/ios`** -- Swift Package with `RpcBridgeServer`, `HelloServiceImpl`, and WKWebView integration
- **`demos/android`** -- Gradle project with `RpcBridgeServer`, `HelloServiceImpl`, and WebView integration

## Monorepo Structure

```
rpc-concept/
  proto/                          # Protocol Buffer definitions
    rpc/bridge/v1/frame.proto     #   Wire protocol (RpcFrame)
    demo/hello/v1/hello.proto     #   Demo service definition
  packages/
    rpc-core/                     # Core runtime (frame, client, server, stream)
    codegen/                      # Code generator (parser + gen-ts/swift/kotlin)
    transport-web/                # Browser transports (MessagePort, postMessage)
    transport-ios/                # iOS WKWebView transport (JS side)
    transport-android/            # Android WebView transport (JS side)
    transport-electron/           # Electron transports (preload + main)
    shared-ui/                    # Shared demo UI components
  generated/                      # Generated code output
    ts/demo/hello/v1/             #   TypeScript messages, client, server
    swift/                        #   Swift generated code
    kotlin/                       #   Kotlin generated code
  demos/
    web/                          # Browser demo (host + iframe)
    electron/                     # Electron demo (main + renderer)
    ios/                          # iOS demo (Swift Package)
    android/                      # Android demo (Gradle project)
  tests/                          # Integration & unit tests
  docs/                           # This documentation
```

## How the Pieces Fit Together

### A Typical RPC Call

1. **Application code** calls a typed method on a generated client stub (e.g., `client.sayHello(request)`).
2. The **generated client** encodes the request message using the generated `encode()` function and delegates to `RpcClient.unary()`.
3. `RpcClient` creates a new `Stream`, sends OPEN + MESSAGE + HALF_CLOSE frames via the `Transport`.
4. The **transport adapter** serializes each `RpcFrame` to protobuf binary (via `encodeFrame()`), optionally base64-encodes it, and sends it through the platform-specific channel.
5. On the other side, the **transport adapter** receives the raw data, decodes it back to `RpcFrame`, and dispatches to the `RpcServer`.
6. `RpcServer` parses the method name from the OPEN frame, looks up the registered service, creates a server-side `Stream`, and dispatches to the handler.
7. The **generated dispatcher** decodes the request bytes into a typed message, calls the application's handler implementation, and encodes the response.
8. `RpcServer` sends the response MESSAGE + CLOSE frames back through the transport.
9. `RpcClient` receives the response, resolves the promise, and the generated client decodes the response bytes into a typed message.

### Handshake Flow

When a connection is established:

1. Client sends a HANDSHAKE frame with its protocol version, capabilities, and implementation ID.
2. Server receives the HANDSHAKE, computes the negotiated version (`min(client, server)`) and intersects capabilities.
3. Server sends its own HANDSHAKE frame back.
4. Client computes the same negotiation. Both sides now agree on version and features.

## Design Decisions and Rationale

### Why Not gRPC Transport?

gRPC was the inspiration for this protocol's design (streaming patterns, status codes, method naming), but gRPC itself was not suitable as the transport for several reasons:

1. **gRPC-Web limitations**: gRPC-Web does not support client-streaming or bidi-streaming in browsers. It requires a proxy (Envoy) for HTTP/2 translation, adding operational complexity.

2. **WebView incompatibility**: There is no gRPC transport for WKWebView (`webkit.messageHandlers`), Android WebView (`@JavascriptInterface`), or Electron IPC. These environments do not support HTTP/2 connections between the web content and the host process.

3. **Sandboxing requirements**: The web content runs in sandboxed iframes or WebViews with no network access. Communication must happen through the platform's native bridge API, not over HTTP.

4. **Binary efficiency**: On platforms that support binary transfer (MessagePort with transferable ArrayBuffers, Electron MessageChannelMain), we achieve zero-copy frame delivery. gRPC-Web forces text-based encoding.

5. **Minimal footprint**: The hand-rolled protobuf encoder/decoder is ~300 lines of code with zero dependencies, compared to pulling in a full gRPC-Web runtime.

### The Proto-First Philosophy

The `.proto` file is the contract between client and server:

- **Messages** define the data shapes with field numbers that enable binary compatibility.
- **Services** define the RPC methods with their streaming patterns.
- **Code generation** produces typed, safe code for every target platform.
- **Wire compatibility** is guaranteed because all platforms use the same protobuf binary encoding for both frames and messages.

This means a TypeScript client can talk to a Swift server (or a Kotlin server) with no serialization mismatches, because the proto definition governs field numbers and wire types on both sides.

### Frame Protocol Design

The frame protocol is intentionally simple:

- A single `RpcFrame` protobuf message type carries all frame types via a `FrameType` discriminator, avoiding the complexity of HTTP/2 framing.
- Field numbers are grouped by purpose (common: 1-6, handshake: 10-12, open: 15-17, error: 20-22, etc.) with reserved ranges for future extension.
- Unknown fields and frame types are silently ignored, enabling forward compatibility.

## Message Flow by RPC Pattern

### Unary (Request-Response)

```
Client                                    Server
  |                                         |
  |--- OPEN (method, metadata) ------------>|
  |--- REQUEST_N (initial credits) -------->|
  |--- MESSAGE (request payload) ---------->|
  |--- HALF_CLOSE ------------------------->|
  |                                         |  (dispatches to handler)
  |<-- MESSAGE (response payload) ----------|
  |<-- CLOSE (trailers) -------------------|
  |                                         |
```

### Server Streaming

```
Client                                    Server
  |                                         |
  |--- OPEN (method, metadata) ------------>|
  |--- REQUEST_N (initial credits) -------->|
  |--- MESSAGE (request payload) ---------->|
  |--- HALF_CLOSE ------------------------->|
  |                                         |  (dispatches to handler)
  |<-- MESSAGE (response 1) ---------------|
  |<-- MESSAGE (response 2) ---------------|
  |--- REQUEST_N (replenish credits) ------>|
  |<-- MESSAGE (response 3) ---------------|
  |<-- ...                                  |
  |<-- CLOSE (trailers) -------------------|
  |                                         |
```

### Client Streaming

```
Client                                    Server
  |                                         |
  |--- OPEN (method, metadata) ------------>|
  |--- REQUEST_N (initial credits) -------->|
  |                                         |<-- REQUEST_N (credits for client)
  |--- MESSAGE (request 1) --------------->|
  |--- MESSAGE (request 2) --------------->|
  |--- MESSAGE (request 3) --------------->|
  |--- HALF_CLOSE ------------------------->|
  |                                         |  (handler processes all requests)
  |<-- MESSAGE (response payload) ----------|
  |<-- CLOSE (trailers) -------------------|
  |                                         |
```

### Bidirectional Streaming

```
Client                                    Server
  |                                         |
  |--- OPEN (method, metadata) ------------>|
  |--- REQUEST_N (initial credits) -------->|
  |                                         |<-- REQUEST_N (credits for client)
  |--- MESSAGE (request 1) --------------->|
  |<-- MESSAGE (response 1) ---------------|
  |--- MESSAGE (request 2) --------------->|
  |<-- MESSAGE (response 2a) --------------|
  |<-- MESSAGE (response 2b) --------------|
  |--- REQUEST_N (replenish) -------------->|
  |--- MESSAGE (request 3) --------------->|
  |--- HALF_CLOSE ------------------------->|
  |<-- MESSAGE (response 3) ---------------|
  |<-- HALF_CLOSE --------------------------|
  |<-- CLOSE (trailers) -------------------|
  |                                         |
```

### Cancellation (Any Pattern)

```
Client                                    Server
  |                                         |
  |--- OPEN ------>                         |
  |--- MESSAGE --->  (RPC in progress)      |
  |                                         |
  |--- CANCEL ----------------------------- >|
  |                                         |  (handler task cancelled)
  |                                         |
```

Either side can send CANCEL. The recipient should stop processing and clean up the stream. No further frames should be sent on a cancelled stream.
