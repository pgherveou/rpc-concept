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

## Encoding Strategy

All wire communication uses JSON serialization. Proto definitions are used for code generation only, not runtime encoding.

| Platform | Wire Format | Serialization |
|----------|-------------|---------------|
| TypeScript | JSON (plain objects) | Native `JSON.stringify`/`JSON.parse`, or structured clone on MessagePort |
| Swift | JSON | `Codable` with `JSONEncoder`/`JSONDecoder` |
| Kotlin | JSON | `kotlinx.serialization.json` with `@Serializable` data classes |

This eliminates the need for protobuf binary encoding libraries at runtime. The trade-off is slightly larger payloads compared to binary protobuf, but for local IPC this is negligible.

### Platform Codec Selection

Different platforms have different optimal encodings for the transport layer:

| Platform | Frame Encoding | Why |
|----------|---------------|-----|
| Web (MessagePort) | Structured clone (object) | MessagePort transfers objects natively, no serialization needed |
| Electron (MessagePort) | Structured clone (object) | Same as web |
| iOS (WKWebView) | JSON string | `webkit.messageHandlers` only accepts JSON-compatible types |
| Android (WebView) | JSON string | `@JavascriptInterface` only accepts primitive types and strings |

The encoding is selected per-transport at construction time. On platforms that support structured cloning, frames are passed as plain objects. On platforms requiring string transport, frames are JSON-serialized to strings.

## Performance Considerations

### Frame Encoding Overhead

| Encoding | Overhead | Suitable For |
|----------|----------|-------------|
| Structured clone | Minimal (native browser cloning) | MessagePort, Electron |
| JSON string | Small (JSON key overhead) | WKWebView, Android WebView |

JSON encoding adds key-name overhead compared to binary protobuf, but for local IPC with small-to-medium payloads, the difference is negligible compared to bridge latency.

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
| Future body variants | New `oneof body` alternatives | Additive, forward-compatible |
