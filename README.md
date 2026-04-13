<div align="center">

# RPC Bridge

*Type-safe, streaming RPC between web content and native hosts, on every platform.*

[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](#testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178c6.svg)](https://www.typescriptlang.org/)

</div>

<!-- TODO: Add hero screenshot or demo GIF showing the web demo in action -->
<!-- Suggested: record a short GIF with `vhs` or `peek` showing SayHello + WatchGreeting + Chat in the web demo -->

---

RPC Bridge connects sandboxed web content (the guest) to native host code through platform-native IPC. Define your API once in `.proto`, generate typed stubs for TypeScript, Swift, and Kotlin, and communicate over iframes, WKWebView, Android WebView, or Electron IPC. 

## Features

- **Proto-first** -- Define services in `.proto` files, generate everything else
- **All four RPC patterns** -- Unary, server-streaming, client-streaming, and bidirectional streaming
- **Cross-platform codegen** -- One proto definition produces TypeScript, Swift, and Kotlin stubs
- **Platform-native transports** -- MessagePort, WKWebView handlers, Android WebView interfaces, Electron IPC
- **Forward-compatible wire protocol** -- Unknown fields and frame types are silently ignored

## Quick Start

<details>
<summary>Prerequisites</summary>

- Node.js 20+
- npm 9+
- For iOS: Xcode with Swift Package Manager
- For Android: Android Studio with Gradle

</details>

```bash
npm install
npm run build
```

The build compiles the core runtime, code generator, transports, and demo apps in the correct order.

### Generate code from proto

```bash
npm run generate
```

This reads your `.proto` service definitions and outputs typed messages, client stubs, and server interfaces for each target language:

```bash
rpc-bridge-codegen \
  --proto demos/proto/hello.proto \
  --ts-out demos/generated \
  --swift-out demos/host/ios/RPCBridgeDemo/generated \
  --kotlin-out demos/host/android/generated
```

## Usage

### Define a service

```protobuf
syntax = "proto3";
package demo.hello.v1;

message HelloRequest {
  string name = 1;
}

message HelloResponse {
  string message = 1;
  uint64 timestamp = 2;
}

service HelloBridgeService {
  rpc SayHello(HelloRequest) returns (HelloResponse);
  rpc WatchGreeting(GreetingStreamRequest) returns (stream GreetingEvent);
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}
```

### Implement the server (host side)

```typescript
import { RpcServer } from '@anthropic/rpc-core';

const server = new RpcServer();
server.addService('demo.hello.v1.HelloBridgeService', {
  async SayHello(request) {
    return { message: `Hello, ${request.name}!`, timestamp: Date.now() };
  },
  async *WatchGreeting(request, signal) {
    for (let i = 0; i < request.maxCount; i++) {
      if (signal.aborted) break;
      yield { message: `Hello #${i + 1}`, seq: i + 1, timestamp: Date.now() };
      await delay(request.intervalMs);
    }
  },
});
```

### Call from the client (guest side)

```typescript
import { HelloBridgeServiceClient } from './generated/hello.client';

const client = new HelloBridgeServiceClient(rpcClient);

// Unary
const response = await client.sayHello({ name: 'World' });

// Server streaming
for await (const event of client.watchGreeting({ name: 'World', maxCount: 5, intervalMs: 1000 })) {
  console.log(event.message);
}

// Bidirectional streaming
const chat = client.chat();
chat.send({ from: 'guest', text: 'Hello!' });
for await (const msg of chat) {
  console.log(`${msg.from}: ${msg.text}`);
}
```

## Running the Demos

### Web (iframe + MessagePort)

```bash
cd demos/host/web && npm run build && npm run serve
# Open http://localhost:3000
```

The host page runs the RPC server; the sandboxed iframe runs the guest client. Communication flows over a MessagePort channel.

### Electron (MessageChannelMain)

```bash
cd demos/host/electron && npm run start
```

### iOS (WKWebView)

Open `demos/host/ios/Package.swift` in Xcode. The Swift host implements `HelloBridgeService` and bridges to the guest via WKWebView script message handlers.

### Android (WebView)

Open `demos/host/android/` in Android Studio. The Kotlin host implements `HelloBridgeService` and bridges to the guest via `@JavascriptInterface`.

## Testing

```bash
# Unit and integration tests
npm test

# E2e tests (web demo, requires Playwright)
npm run test:e2e
```

The test suite covers frame encoding/decoding, stream lifecycle, all four RPC patterns over loopback transport, cancellation (AbortSignal, deadlines, transport close), and forward/backward compatibility.

## Repository Structure

```
proto/rpc/bridge/v1/frame.proto     Wire protocol definition
packages/
  rpc-core/                         Core runtime (frame codec, client, server, streams)
  codegen/                          Proto parser + TS/Swift/Kotlin generators
  rpc-core-swift/                   Swift frame codec + server runtime
  rpc-core-android/                 Android frame codec + server runtime
  transport-web/                    MessagePort + postMessage transports
  transport-ios/                    WKWebView transport (JS side)
  transport-android/                Android WebView transport (JS side)
  transport-electron/               Electron main + preload transports
demos/
  proto/hello.proto                 Demo service definition
  guest-app/                        Shared guest web client (React)
  host/{web,ios,electron,android}/  Platform-specific host implementations
tests/                              Unit and integration tests
e2e/                                Playwright e2e tests
docs/                               Design and architecture docs
```

## How It Works

RPC Bridge uses a simple frame-based protocol over platform-native message passing. Each RPC call gets a unique stream ID, and frames flow in both directions to support streaming patterns.

```
Guest (web content)                    Host (native code)
  │                                     │
  │─── OPEN {service, method} ─────────▶│
  │◀── MESSAGE {response payload} ──────│
  │◀── CLOSE ───────────────────────────│
  │                                     │
```

Frames are JSON-encoded with a `oneof` body discriminator (Open, Message, HalfClose, Close, Cancel, Error). Each platform uses the most efficient channel available: structured clone for web/Electron, JSON strings for iOS/Android.

## Why This Approach

The existing host API surface is implemented independently across 5 codebases (Rust, TypeScript x2, Swift, Kotlin), each with its own transport, codec, subscription pattern, and hand-written method dispatch. This has led to:

- **Protocol drift**: iOS and Android expose different chat APIs, mobile apps lack chainHead v1, platform-specific methods appear without cross-platform equivalents
- **Per-method boilerplate**: Adding one method requires hand-written changes in 4+ files per implementation, with no generation or validation
- **Ad-hoc subscriptions**: Each implementation invents its own subscribe/unsubscribe lifecycle (`_start/_stop/_interrupt` suffixes, manual async stream wiring)
- **No shared schema**: Nothing enforces that all platforms implement the same API surface with the same types

RPC Bridge replaces this with a single `.proto` contract and a codegen pipeline. The hand-written code is limited to service implementations. Everything else (client stubs, server dispatchers, message types, serialization) is generated and guaranteed consistent across TypeScript, Swift, and Kotlin.

The wire format is JSON instead of SCALE binary. On web-to-web (MessagePort, Electron), frames use structured clone with zero serialization overhead. On web-to-native (WKWebView, Android WebView), JSON strings are slightly larger than SCALE but significantly easier to debug, evolve, and reason about.

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** -- System design, layers, component interactions
- **[Wire Protocol](docs/PROTOCOL.md)** -- Frame format, types, stream lifecycle, error codes
- **[Compatibility](docs/COMPATIBILITY.md)** -- Versioning, forward/backward compatibility
- **[Code Generation](docs/CODEGEN.md)** -- Proto parser, generated output per language
- **[Platform Bridges](docs/PLATFORM-BRIDGES.md)** -- Transport implementations, encoding, security
- **[Tradeoffs](docs/TRADEOFFS.md)** -- Limitations, future extensions, performance

