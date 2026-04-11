# RPC Bridge Framework

A cross-platform RPC framework for type-safe, streaming-capable communication between sandboxed web content and native host code. Define your API in Protocol Buffers, generate typed client stubs and server interfaces for TypeScript, Swift, and Kotlin, and communicate over any platform bridge -- iframes, WKWebView, Android WebView, or Electron IPC.

## Key Features

- **Proto-first**: Define services and messages in `.proto` files. Generate everything else.
- **All four RPC patterns**: Unary, server-streaming, client-streaming, and bidirectional streaming.
- **Cross-platform**: TypeScript, Swift, and Kotlin code generation from the same proto definition.
- **Credit-based flow control**: Built-in backpressure prevents fast producers from overwhelming slow consumers.
- **Protocol negotiation**: Version and capability handshake at connection time.
- **Forward-compatible wire protocol**: Unknown fields and frame types are silently ignored.
- **Zero network dependency**: Communicates over platform-native bridges, not HTTP.

## Monorepo Structure

```
rpc-concept/
  proto/                              Protocol Buffer definitions
    rpc/bridge/v1/frame.proto           Wire protocol (RpcFrame, FrameType)
    demo/hello/v1/hello.proto           Demo service (HelloBridgeService)

  packages/
    rpc-core/                         Core runtime library
      src/
        frame.ts                        Frame encode/decode (protobuf wire format)
        client.ts                       RpcClient -- outgoing call management
        server.ts                       RpcServer -- incoming call dispatch
        stream.ts                       Stream lifecycle and message buffering
        flow-control.ts                 Credit-based backpressure
        handshake.ts                    Version + capability negotiation
        errors.ts                       Structured error codes (gRPC-compatible)
        transport.ts                    Transport interface + MessageTransportBase
        types.ts                        Shared types (MethodType, Metadata, etc.)

    codegen/                          Code generator
      src/
        parser.ts                       Minimal .proto file parser
        gen-typescript.ts               TypeScript message/client/server generator
        gen-swift.ts                    Swift struct/protocol/dispatcher generator
        gen-kotlin.ts                   Kotlin data class/interface/dispatcher generator
        cli.ts                          CLI entry point

    transport-web/                    Browser transports
      src/
        message-port-transport.ts       MessagePort (preferred, binary, zero-copy)
        post-message-transport.ts       postMessage (base64, cross-origin safe)

    transport-ios/                    iOS WKWebView transport (JS side)
      src/wkwebview-transport.ts        webkit.messageHandlers + evaluateJavaScript

    transport-android/                Android WebView transport (JS side)
      src/webview-transport.ts          @JavascriptInterface + evaluateJavascript

    transport-electron/               Electron transports
      src/
        main-transport.ts              Main process (MessagePortMain)
        preload-transport.ts           Renderer process (MessagePort)

    shared-ui/                        Shared demo UI components

  generated/                          Generated code output
    ts/demo/hello/v1/                   TypeScript (messages, client, server)
    swift/                              Swift
    kotlin/                             Kotlin

  demos/
    web/                              Browser demo (host page + sandboxed iframe)
    electron/                         Electron demo (main process + renderer)
    ios/                              iOS demo (Swift Package)
    android/                          Android demo (Gradle project)

  tests/                              Integration and unit tests
    src/
      frame.test.ts                     Frame encoding/decoding round-trips
      stream.test.ts                    Stream lifecycle and message delivery
      flow-control.test.ts              Credit-based flow control
      client-server.test.ts             Full RPC integration (all 4 patterns)
      cancellation.test.ts              Cancellation + deadline tests
      compatibility.test.ts             Forward/backward compatibility

  docs/                               Documentation
```

## Quick Start

### Prerequisites

- Node.js 20+
- npm 9+

### Install and Build

```bash
# Install all workspace dependencies
npm install

# Build everything (core, codegen, generate code, transports, shared-ui)
npm run build
```

The build pipeline:

1. Compiles `packages/rpc-core` (core runtime)
2. Compiles `packages/codegen` (code generator)
3. Runs code generation on `proto/demo/hello/v1/hello.proto`
4. Compiles all transport packages
5. Compiles `packages/shared-ui`

### Run Code Generation

To regenerate the TypeScript/Swift/Kotlin code from proto definitions:

```bash
npm run generate
```

This invokes:

```bash
rpc-bridge-codegen \
  --proto proto/demo/hello/v1/hello.proto \
  --ts-out generated/ts/demo/hello/v1 \
  --swift-out generated/swift \
  --kotlin-out generated/kotlin
```

## Running the Demos

### Web Demo (iframe)

```bash
cd demos/web
npm run build
npm run serve
# Open http://localhost:3000 in your browser
```

The host page runs the RPC server; the sandboxed iframe runs the RPC client. Communication happens over a MessagePort channel.

### Electron Demo

```bash
cd demos/electron
npm run start
```

The main process runs the RPC server; the sandboxed renderer runs the RPC client. Communication happens over MessageChannelMain.

### iOS Demo

Open `demos/ios/Package.swift` in Xcode. The demo is a Swift Package that implements the `HelloBridgeService` server with WKWebView integration.

### Android Demo

Open `demos/android/` in Android Studio. The demo is a Gradle project that implements the `HelloBridgeService` server with WebView integration.

## Running Tests

```bash
# Build everything first
npm run build

# Then build and run tests
cd tests
npm run build
npm test
```

Or from the root:

```bash
npm test
```

The test suite covers:

- Frame encoding/decoding (all frame types, edge cases, forward compatibility)
- Stream lifecycle (state machine, message delivery, cancellation)
- Flow control (credit management, backpressure, watermark replenishment)
- Client-server integration (all four RPC patterns over loopback transport)
- Cancellation (AbortSignal, deadlines, transport close)
- Compatibility (version negotiation, unknown fields/types, backward compatibility)

## Documentation

Detailed documentation is available in the `docs/` directory:

- **[Architecture Overview](docs/ARCHITECTURE.md)** -- System design, layer diagram, how pieces fit together, design rationale
- **[Wire Protocol](docs/PROTOCOL.md)** -- Frame format, frame types, stream lifecycle, flow control, error codes
- **[Compatibility](docs/COMPATIBILITY.md)** -- Versioning strategy, forward/backward compatibility, capability negotiation
- **[Code Generation](docs/CODEGEN.md)** -- What gets generated, proto parser, TS/Swift/Kotlin output, extending for new languages
- **[Platform Bridges](docs/PLATFORM-BRIDGES.md)** -- Transport implementations per platform, encoding strategies, security
- **[Tradeoffs](docs/TRADEOFFS.md)** -- Current limitations, future extensions, performance considerations

## License

TBD
