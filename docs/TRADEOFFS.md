# Tradeoffs and Future Extensions

This document captures the design tradeoffs made in the current implementation and outlines potential future enhancements.

## Local IPC Only

This framework is designed exclusively for local IPC between a guest app (web content) and its host (native code), both collocated inside the same app on the same device. Several network-oriented concerns are intentionally out of scope:

- **No HTTP/2 framing**: Frames are passed through platform-native bridge APIs (MessagePort, WKWebView, WebView, Electron IPC) that provide their own framing and delivery guarantees.
- **No TLS/authentication**: The communication channel is within the same process boundary. Security is handled by platform sandboxing (same-origin policy, WKWebView process isolation, app sandbox, Electron context isolation).
- **No reconnection**: Transport lifecycle is managed by the platform. When a WebView is destroyed, creating a new one is an application-level concern.
- **Single connection per transport**: Each WebView or iframe has exactly one bridge to its host. Connection pooling is unnecessary.
- **No handshake/negotiation**: Guest and host are built and deployed together, so version/capability negotiation is unnecessary.
- **No flow control**: The host manages backpressure to backend services. The guest is UI-driven and does not produce unbounded message streams.

## Current Limitations

### Protobuf Parser

The code generator uses `protobufjs` as a dev dependency solely for parsing `.proto` files. This handles the full proto3 spec including imports, maps, oneofs, and nested messages. `protobufjs` is not used at runtime.

## Protobuf Encoding Strategy

All protobuf encoding and decoding uses established libraries rather than hand-rolled implementations:

| Platform | Library | Usage |
|----------|---------|-------|
| TypeScript | [`@bufbuild/protobuf`](https://github.com/bufbuild/protobuf-es) | `BinaryWriter`/`BinaryReader` from `@bufbuild/protobuf/wire` for both frame encoding and generated message code |
| Swift | [`SwiftProtobuf`](https://github.com/apple/swift-protobuf) | `protoc-gen-swift` generates message types, `serializedData()`/`init(serializedBytes:)` for encoding |
| Kotlin | [`kotlinx-serialization-protobuf`](https://github.com/Kotlin/kotlinx.serialization) | `@Serializable` + `@ProtoNumber` annotations, `ProtoBuf.encodeToByteArray()`/`decodeFromByteArray()` |

This gives us reliable, battle-tested protobuf encoding with zero hand-rolled wire format code. The trade-off is a runtime dependency on each platform, but these are small, well-maintained libraries.

### Platform Codec Selection

Different platforms have different optimal encodings for the transport layer:

| Platform | Frame Encoding | Why |
|----------|---------------|-----|
| Web (MessagePort) | Structured cloning | MessagePort transfers objects natively, no serialization needed |
| Electron (MessagePort) | Structured cloning | Same as web |
| iOS (WKWebView) | Base64 protobuf | `webkit.messageHandlers` only accepts JSON-compatible types |
| Android (WebView) | Base64 protobuf | `@JavascriptInterface` only accepts primitive types and strings |

The codec is selected per-transport at construction time. On platforms that support structured cloning, frames are passed as plain objects, avoiding encode/decode overhead entirely. On platforms requiring string transport, frames are protobuf-encoded then base64-encoded.

## Performance Considerations

### Frame Encoding Overhead

| Encoding | Overhead | Suitable For |
|----------|----------|-------------|
| Binary protobuf | Minimal (~5-10 bytes header per frame) | MessagePort, Electron |
| Base64 protobuf | ~33% size increase | WKWebView, Android WebView |

For a typical unary RPC with a 100-byte request and 200-byte response, the total overhead is approximately:

- **Binary**: 3 client frames (OPEN + MESSAGE + HALF_CLOSE) + 2 server frames (MESSAGE + CLOSE) = ~30 bytes overhead
- **Base64**: Same frame count, but each frame is 33% larger

### Async Message Delivery

The loopback transport (used in testing) delivers frames via `queueMicrotask()`. Platform transports deliver frames through their native async mechanisms (event handlers, callbacks). This means:

- Frame delivery is always asynchronous (even for in-process communication)
- Frames are delivered in order within a single transport
- There is at least one microtask/event-loop turn of latency per frame

## Future Extensions

### Multiplexing Multiple Services

The current architecture has one transport per client-server pair. Future enhancement:

- Support multiple services registered on a single server (already supported in `RpcServer`).
- Support multiple independent client stubs sharing a single transport/connection.

### Server-Initiated Streams

The protocol reserves even stream IDs for server-initiated streams. This would enable:

- Server push notifications.
- Server-initiated RPCs (reversing the call direction).
- Event subscriptions without client polling.

Implementation would require:
- `RpcServer` allocating even-numbered stream IDs.
- `RpcClient` having a handler registration mechanism (like the server's service registration).
- Defining the OPEN flow for server-initiated streams.

### Reflection / Introspection

Add a built-in reflection service that returns:

- List of registered services and methods.
- Method input/output types and streaming patterns.
- Server capabilities and version information.

This could be implemented as a well-known service (e.g., `rpc.bridge.v1.Reflection`) registered automatically by the server.

## Summary of Reserved Protocol Capacity

| Feature | Mechanism | Status |
|---------|-----------|--------|
| Server-initiated streams | Even stream IDs | Reserved |
| Future standard fields | Field numbers 50-99 | Reserved |
