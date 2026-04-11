# Tradeoffs and Future Extensions

This document captures the design tradeoffs made in the current implementation and outlines potential future enhancements.

## Current Limitations

### No Full Protobuf Runtime

The hand-rolled proto parser only handles a subset of proto3:

- No `import` resolution -- each proto file is parsed in isolation.
- No `map` field codegen -- map types in messages are skipped.
- No `oneof` codegen -- oneof groups are skipped.
- No nested message codegen -- nested message definitions are skipped.
- No package-qualified cross-file type references.

**Why**: The goal was zero external dependencies for the codegen tool. For production use with complex proto schemas, consider integrating with `protoc` via a custom plugin while keeping the same output format.

### No HTTP/2 Framing

Unlike gRPC, this protocol does not use HTTP/2 framing:

- No HPACK header compression.
- No HTTP/2 stream prioritization.
- No HTTP/2 GOAWAY for graceful shutdown.
- No HTTP/2 PING for keepalive.

**Why**: The transport layer is not HTTP. Frames are passed through platform-specific bridge APIs (MessagePort, WKWebView, WebView, Electron IPC) that have their own framing. Adding HTTP/2 framing would add overhead with no benefit in these environments.

### No TLS/Authentication

The protocol does not include TLS, mTLS, or any authentication mechanism.

**Why**: Security is handled by the platform:

| Platform | Security Mechanism |
|----------|-------------------|
| Web (iframe) | Same-origin policy, CSP, sandbox attribute |
| iOS WKWebView | App sandbox, WKWebView process isolation |
| Android WebView | App sandbox, WebView security policies |
| Electron | Context isolation, sandbox, preload-only API surface |

In all cases, the communication channel is **within the same device** (or same process boundary). There is no network involved, so TLS is not applicable. Authentication of the web content is handled by the platform's content loading mechanism (e.g., loading from app bundle, loading from a trusted URL).

### Single Connection per Transport

Each transport instance represents a single logical connection. There is no connection pooling or multiplexing of multiple transport instances.

**Why**: Each WebView or iframe typically has exactly one bridge to its host. Connection pooling is unnecessary in this architecture.

### No Reconnection

If the transport closes (e.g., the WebView is destroyed), all streams are cancelled. There is no automatic reconnection or stream resumption.

**Why**: Transport lifecycle is managed by the platform. When a WebView is destroyed, reconnection means creating a new WebView instance, which is an application-level concern.

## JSON vs. Protobuf for Demo Message Encoding

The demo applications use a JSON-in-Uint8Array encoding for message payloads:

```typescript
function encodeMessage(obj: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}
```

This is intentionally simple for the demos but is **not production-quality**. Production applications should use the generated protobuf encode/decode functions:

```typescript
// Demo (JSON):
const result = await rpcClient.unary(method, encodeMessage({ name: 'World' }));
const response = decodeMessage(result.data);

// Production (generated protobuf):
const result = await client.sayHello(new HelloRequest({ name: 'World' }));
// result is already a typed HelloResponse
```

**Why JSON in demos**: The demos were designed to work before the generated code was available, and to illustrate the raw `RpcClient`/`RpcServer` API without introducing the codegen dependency into the demo flow.

## Protobuf Encoding Without a Runtime

The TypeScript frame encoder/decoder (`frame.ts`) is hand-rolled rather than using a protobuf library:

**Advantages:**
- Zero runtime dependencies (no `protobufjs`, no `google-protobuf`)
- Smaller bundle size (~300 lines vs. 50KB+ for a protobuf runtime)
- Full control over encoding/decoding behavior
- No code generation step for the frame protocol itself

**Disadvantages:**
- Must be kept in sync with `frame.proto` manually
- Does not support the full protobuf spec (no groups, no extensions in the proto2 sense)
- More code to maintain and test

The generated message classes (`messages.ts`) also use hand-rolled protobuf encoding via the shared `ProtoWriter`/`ProtoReader` classes exported from `@rpc-bridge/core`.

## Performance Considerations

### Frame Encoding Overhead

| Encoding | Overhead | Suitable For |
|----------|----------|-------------|
| Binary protobuf | Minimal (~5-10 bytes header per frame) | MessagePort, Electron |
| Base64 protobuf | ~33% size increase | WKWebView, Android WebView |

For a typical unary RPC with a 100-byte request and 200-byte response, the total overhead is approximately:

- **Binary**: 4 frames (OPEN + MESSAGE + HALF_CLOSE + REQUEST_N) + 3 frames (MESSAGE + CLOSE + handshake) = ~50 bytes overhead
- **Base64**: Same frame count, but each frame is 33% larger

### Flow Control Tuning

The default flow control window is 16 messages with replenishment at 25% remaining:

```
Initial window: 16 messages
Low watermark:  4 messages (25% of 16)
Replenish:      16 messages
```

This is suitable for most RPC workloads. For high-throughput streaming, consider:

- Increasing `initialCredits` to reduce REQUEST_N frame frequency
- Adjusting `replenishAmount` for smoother throughput

### Async Message Delivery

The loopback transport (used in testing) delivers frames via `queueMicrotask()`. Platform transports deliver frames through their native async mechanisms (event handlers, callbacks). This means:

- Frame delivery is always asynchronous (even for in-process communication)
- Frames are delivered in order within a single transport
- There is at least one microtask/event-loop turn of latency per frame

## Future Extensions

### Compression

Add payload compression for large messages:

1. Negotiate the `compression` capability during handshake.
2. Set the `COMPRESSED_PAYLOAD` flag (bit 0 of `flags` field) on MESSAGE frames.
3. Use a lightweight compression algorithm (e.g., deflate, lz4) on the payload bytes.
4. The flag field and the compression capability are already defined in the protocol.

### Binary Metadata

Currently, metadata is `map<string, string>`. For binary metadata values:

1. Negotiate the `metadata_binary` capability.
2. Base64-encode binary values with a `-bin` suffix convention on the key (like gRPC).
3. Or use a separate `map<string, bytes>` field for binary metadata.

### Multiplexing Multiple Services

The current architecture has one transport per client-server pair. Future enhancement:

- Support multiple services registered on a single server (already supported in `RpcServer`).
- Support multiple independent client stubs sharing a single transport/connection.

### Reconnection and Stream Resumption

When a transport is re-established:

1. Perform a new handshake.
2. Re-open streams that were active at the time of disconnection.
3. Resume from the last acknowledged sequence number.

This requires:
- Persistent stream state on both sides.
- Sequence number tracking for resume points.
- An application-level retry policy.

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

### Deadline Propagation

Currently, deadlines are specified in `deadline_ms` as a relative duration. Future enhancement:

- Propagate remaining deadline through chained RPCs.
- Server-side deadline enforcement (currently only client-side).
- Deadline-aware flow control (prioritize streams near their deadline).

### Connection-Level Flow Control

The current flow control is per-stream. Future enhancement:

- Add connection-level flow control using a WINDOW_UPDATE frame (reserved as type 12).
- Prevent a single stream from monopolizing the transport.

### Ping/Pong Keepalive

Reserved frame types PING (9) and PONG (10) for:

- Detecting dead connections.
- Measuring round-trip latency.
- Keeping idle connections alive through intermediaries.

### Graceful Shutdown (GOAWAY)

Reserved frame type GOAWAY (11) for:

- Telling the peer to stop creating new streams.
- Allowing in-flight streams to complete.
- Clean server restart without dropping active RPCs.

## Summary of Reserved Protocol Capacity

| Feature | Mechanism | Status |
|---------|-----------|--------|
| Payload compression | `flags` bit 0, `compression` capability | Defined, not implemented |
| Binary metadata | `metadata_binary` capability | Defined, not implemented |
| Ping/Pong | Frame types 9, 10 | Reserved |
| GOAWAY | Frame type 11 | Reserved |
| Window update | Frame type 12 | Reserved |
| Server-initiated streams | Even stream IDs | Reserved |
| Protocol extensions | `extensions` field (100) | Available |
| Future standard fields | Field numbers 50-99, 101-199 | Reserved |
