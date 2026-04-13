# RPC Bridge - Project Guide

## What is this?

A cross-platform RPC framework for type-safe, streaming-capable communication between sandboxed product apps and native host code. Product and host are always collocated inside the same app, communication is purely local IPC.

## Documentation

The `docs/` directory is the source of truth for design and architecture. Consult these before making changes:

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** -- System design, layers, how pieces fit together
- **[PROTOCOL.md](docs/PROTOCOL.md)** -- Wire protocol, frame types, stream lifecycle
- **[COMPATIBILITY.md](docs/COMPATIBILITY.md)** -- Versioning, forward/backward compatibility
- **[CODEGEN.md](docs/CODEGEN.md)** -- Code generation from proto definitions
- **[PLATFORM-BRIDGES.md](docs/PLATFORM-BRIDGES.md)** -- Transport implementations per platform
- **[TRADEOFFS.md](docs/TRADEOFFS.md)** -- Limitations, future extensions

**Keep docs up to date** when changing design or structure. They are consulted by agents to understand the project.

## Repository Structure

```
packages/                       # Framework code only
  rpc-core/                       Core runtime (frame, client, server, stream)
  codegen/                        Code generator (proto parser + TS/Swift/Kotlin generators)
  rpc-core-swift/                 Swift package: frame codec, server runtime, WKWebView transport
  rpc-core-android/               Android library: frame codec, server runtime, WebView transport
  transport-web/                  Browser transports (MessagePort, postMessage)
  transport-ios/                  iOS WKWebView transport (JS side)
  transport-android/              Android WebView transport (JS side)
  transport-electron/             Electron transports (preload + main)

demos/                          # Demo application code
  proto/truapi/v02/*.proto        TruAPI v0.2 service definitions (11 services)
  proto/generated/                Generated TS messages, client stubs, server interfaces
  playground-app/                 Product UI (React app, embedded in all platform hosts)
    src/setup-client.ts             Creates typed clients and renders the React UI
    src/App.tsx                     Root React component
    src/main.ts                     Web/Electron entry (MessagePort)
    src/bootstrap-ios.ts            iOS entry (WKWebView transport)
    src/bootstrap-android.ts        Android entry (WebView transport)
  hosts/                          Host implementations (RPC servers with mock services)
    src/setup-server.ts             Registers all 11 mock services on an RpcServer
    src/mocks/                      Mock handler implementations per service
    src/host.ts                     Web host (MessagePort to iframe)
    src/host-electron.ts            Electron host (MessageChannelMain)
    src/host-ios.ts                 iOS host (WKWebView)
    src/host-android.ts             Android host (WebView)
    web/                            Static HTML for the web host
    ios/                            Xcode project (Swift, WKWebView)
    android/                        Android Studio project (Gradle, WebView)

proto/rpc/bridge/v1/frame.proto # Core wire protocol definition
tests/                          # Unit and integration tests
e2e/                            # Playwright e2e tests
```

## Build

```bash
npm install
npm run build     # core -> codegen -> generate -> transports -> playground-app -> hosts
```

Build order matters: each step depends on the previous.

## Test

```bash
cd tests && npm run build && npm test   # Unit tests
node node_modules/.bin/playwright test  # E2e tests (web demo)
```

## Key Design Decisions

- **Local IPC only**: Product and host are collocated. No network, no TLS, no reconnection.
- **Proto-first**: Services defined in .proto, code generated for TS/Swift/Kotlin.
- **Platform-native transports**: MessagePort (web/electron), WKWebView handlers (iOS), WebView interface (Android).
- **Forward-compatible wire protocol**: Unknown fields/frame types silently ignored.
