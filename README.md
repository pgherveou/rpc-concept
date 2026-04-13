# RPC Bridge Framework

A cross-platform RPC framework for type-safe, streaming-capable communication between sandboxed web content and native host code. Define your API in Protocol Buffers, generate typed client stubs and server interfaces for TypeScript, Swift, and Kotlin, and communicate over any platform bridge -- iframes, WKWebView, Android WebView, or Electron IPC.

## Key Features

- **Proto-first**: Define services and messages in `.proto` files. Generate everything else.
- **All four RPC patterns**: Unary, server-streaming, client-streaming, and bidirectional streaming.
- **Cross-platform**: TypeScript, Swift, and Kotlin code generation from the same proto definition.
- **Forward-compatible wire protocol**: Unknown fields and frame types are silently ignored.
- **Zero network dependency**: Communicates over platform-native bridges, not HTTP.

## Monorepo Structure

```
rpc-concept/
  proto/
    rpc/bridge/v1/frame.proto         Wire protocol (RpcFrame, oneof body)

  packages/                           Framework code only
    rpc-core/                           Core runtime (frame, client, server, stream)
    codegen/                            Code generator (parser + TS/Swift/Kotlin)
    transport-web/                      Browser transports (MessagePort, postMessage)
    transport-ios/                      iOS WKWebView transport (JS side)
    transport-android/                  Android WebView transport (JS side)
    transport-electron/                 Electron transports (main + preload)

  demos/                              Demo applications
    proto/hello.proto                   Demo service definition (shared by guest + host)
    generated/                          Generated TS messages + client/server stubs
    guest-app/                          Shared guest web client
      src/
        main.ts                           Single entry point (dual boot)
        ui.ts                             Shared demo UI components
    host/
      web/                              Web host (host page + iframe shell)
      ios/                              iOS host (Swift Package + WKWebView)
      electron/                         Electron host (main process + preload)
      android/                          Android host (Gradle project)

  tests/                              Unit and integration tests
  e2e/                                Playwright e2e tests
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
3. Runs code generation from `demos/proto/hello.proto` into `demos/generated/`
4. Compiles all transport packages
5. Compiles `demos/guest-app` (shared guest web client)

### Run Code Generation

To regenerate the TypeScript/Swift/Kotlin code from proto definitions:

```bash
npm run generate
```

This invokes:

```bash
rpc-bridge-codegen \
  --proto demos/proto/hello.proto \
  --ts-out demos/generated \
  --swift-out demos/host/ios/RPCBridgeDemo/generated \
  --kotlin-out demos/host/android/generated
```

## Running the Demos

### Web Demo (iframe)

```bash
cd demos/host/web
npm run build
npm run serve
# Open http://localhost:3000 in your browser
```

The host page runs the RPC server; the sandboxed iframe runs the guest app (RPC client). Communication happens over a MessagePort channel.

### Electron Demo

```bash
cd demos/host/electron
npm run start
```

The main process runs the RPC server; the sandboxed renderer runs the guest app (RPC client). Communication happens over MessageChannelMain.

### iOS Demo

Open `demos/host/ios/Package.swift` in Xcode. The demo is a Swift Package that implements the `HelloBridgeService` server with WKWebView integration.

### Android Demo

Open `demos/host/android/` in Android Studio. The demo is a Gradle project that implements the `HelloBridgeService` server with WebView integration.

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
- Client-server integration (all four RPC patterns over loopback transport)
- Cancellation (AbortSignal, deadlines, transport close)
- Compatibility (unknown fields/types, backward compatibility)

## Documentation

Detailed documentation is available in the `docs/` directory:

- **[Architecture Overview](docs/ARCHITECTURE.md)** -- System design, layer diagram, how pieces fit together, design rationale
- **[Wire Protocol](docs/PROTOCOL.md)** -- Frame format, frame types, stream lifecycle, error codes
- **[Compatibility](docs/COMPATIBILITY.md)** -- Versioning strategy, forward/backward compatibility
- **[Code Generation](docs/CODEGEN.md)** -- What gets generated, proto parser, TS/Swift/Kotlin output, extending for new languages
- **[Platform Bridges](docs/PLATFORM-BRIDGES.md)** -- Transport implementations per platform, encoding strategies, security
- **[Tradeoffs](docs/TRADEOFFS.md)** -- Current limitations, future extensions, performance considerations

## License

TBD
