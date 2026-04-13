# Wire Protocol Specification

This document specifies the wire protocol used by the RPC Bridge framework. The protocol is defined in `proto/rpc/bridge/v1/frame.proto` and implemented in `packages/rpc-core/src/frame.ts`.

## Overview

All communication between client and server is expressed as a sequence of **RpcFrame** messages. Each frame is a JSON-encoded object. The protocol supports multiplexed, bidirectional streams over a single transport connection.

Key properties:

- **Protobuf-defined, JSON-encoded**: Frame structure is defined in `frame.proto` using a `oneof body` discriminator. On the wire, frames are serialized as JSON with structured clone semantics.
- **Forward-compatible**: Unknown body variants are silently skipped. If no recognized key is present, the frame is ignored.
- **Stream-oriented**: Multiple concurrent streams share a single transport, identified by stream IDs.
- **Local IPC only**: Designed for collocated product/host communication. No handshake, no version negotiation, no network-oriented complexity.

## Frame Format

Every frame is an `RpcFrame` protobuf message with a `oneof body` that determines the frame type:

```protobuf
message OpenBody      { string method = 1; }
message MessageBody   { bytes payload = 1; }
message HalfCloseBody {}
message CloseBody     {}
message CancelBody    {}
message ErrorBody     { uint32 error_code = 1; string error_message = 2; bytes details = 3; }

message RpcFrame {
  uint32 stream_id = 1;
  oneof body {
    OpenBody      open       = 2;
    MessageBody   message    = 3;
    HalfCloseBody half_close = 4;
    CloseBody     close      = 5;
    CancelBody    cancel     = 6;
    ErrorBody     error      = 7;
  }
}
```

The frame type is determined by which `oneof` variant is set. There is no separate enum discriminator.

### JSON Wire Format

Frames are serialized as JSON objects. The `oneof` variant appears as a key alongside `streamId`:

```json
{"streamId":1, "open":{"method":"pkg.Svc/Method"}}
{"streamId":1, "message":{"payload":{"name":"alice"}}}
{"streamId":1, "halfClose":{}}
{"streamId":1, "close":{}}
{"streamId":1, "cancel":{}}
{"streamId":1, "error":{"errorCode":13,"errorMessage":"fail"}}
{"streamId":1, "error":{"errorCode":3,"errorMessage":"Startup error","details":{"reason":"expired"}}}
```

For `message` frames, the `payload` field carries the application message as a nested JSON object (not raw bytes), since the wire encoding uses JSON/structured clone rather than protobuf binary.

### Platform Type Mappings

Each platform maps the `oneof body` to its native discriminated-union idiom:

- **TypeScript**: Discriminated union with type guard functions (`isOpenFrame`, `isMessageFrame`, etc.)
- **Swift**: `RpcFrameBody` enum with associated values (`.open(OpenBody)`, `.message(MessageBody)`, etc.)
- **Kotlin**: `FrameBody` sealed class with data-class variants

## Frame Types

### OPEN

Opens a new logical RPC stream. Sent by the client to initiate an RPC call.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Unique stream identifier (odd for client-initiated) |
| `open.method` | Yes | Fully qualified method name: `"package.ServiceName/MethodName"` |

### MESSAGE

Carries a message payload. Used in both directions.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream this message belongs to |
| `message.payload` | Yes | Application message (JSON object) |

### HALF_CLOSE

Signals that the sender will not send any more MESSAGE frames on this stream. The body is an empty object (`halfClose: {}`).

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream being half-closed |

Usage by pattern:
- **Unary**: Client sends HALF_CLOSE immediately after the single request MESSAGE.
- **Server-streaming**: Client sends HALF_CLOSE after the single request MESSAGE.
- **Client-streaming**: Client sends HALF_CLOSE after the last request MESSAGE.
- **Bidi-streaming**: Either side sends HALF_CLOSE when done sending messages.

### CLOSE

Signals successful completion of the stream. Sent by the server after all response messages have been sent. The body is an empty object (`close: {}`).

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream being closed |

After CLOSE is sent, no more frames should be sent on this stream by either side.

### CANCEL

Requests cancellation of an active stream. Can be sent by either side. The body is an empty object (`cancel: {}`).

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream to cancel |

The recipient SHOULD stop processing and clean up resources for the stream. No response is expected.

### ERROR

Signals an error on the stream. Terminates the stream immediately.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream that errored |
| `error.error_code` | Yes | Error code (see Error Codes below) |
| `error.error_message` | Recommended | Human-readable error description |
| `error.details` | Optional | Typed error payload (JSON object). Used by streaming RPCs with `startup_error` to carry a typed error before the first message. Old clients ignore this field. |

## Stream Lifecycle

### Stream ID Allocation

- Stream ID **0** is reserved (unused).
- All streams are **client-initiated**. The client allocates odd stream IDs by incrementing by 2 from 1 (1, 3, 5, ...).

Server push, subscriptions, and reverse-request patterns are all handled through client-initiated streams (server-streaming or bidi-streaming). The client opens the stream to signal readiness, and the server pushes messages on that stream.

### State Machine

Each stream goes through the following states:

```
                          +-------+
                          | IDLE  |
                          +---+---+
                              |
                         OPEN sent/received
                              |
                          +---v---+
            +------------>| OPEN  |<-----------+
            |             +---+---+            |
            |                 |                |
     (local HALF_CLOSE)       |        (remote HALF_CLOSE)
            |                 |                |
    +-------v--------+       |       +--------v-------+
    | HALF_CLOSED    |       |       | HALF_CLOSED    |
    |   LOCAL        |       |       |   REMOTE       |
    +-------+--------+       |       +--------+-------+
            |                |                |
            |     (remote HALF_CLOSE)         |
            |         or                      |
            |     (local HALF_CLOSE)          |
            |                |                |
            +-------v--------v-------+--------+
                    | HALF_CLOSED    |
                    |   BOTH         |
                    +-------+--------+
                            |
                       CLOSE received
                            |
                    +-------v--------+
                    |    CLOSED      |
                    +----------------+

  Any state except CLOSED --CANCEL--> CANCELLED
  Any state except CLOSED --ERROR---> ERROR
```

## Error Codes

A minimal set of error codes for local IPC. Numeric values match gRPC where applicable:

| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Not an error; returned on success |
| 1 | CANCELLED | Operation was cancelled |
| 3 | INVALID_ARGUMENT | Client sent an invalid argument |
| 4 | DEADLINE_EXCEEDED | Deadline expired before completion |
| 12 | UNIMPLEMENTED | Method not implemented |
| 13 | INTERNAL | Internal error |

Receivers SHOULD handle unknown error codes gracefully by treating them as INTERNAL (code 13).

## What's Not in the Protocol

Since this is a local IPC protocol between collocated product and host (same device, same process), the following network-oriented features are intentionally omitted:

- **Handshake/version negotiation**: Guest and host are built and deployed together.
- **Sequence numbers**: Message ordering is guaranteed by the single-threaded JS event loop and the underlying transport.
- **Metadata/trailers**: No HTTP headers analogue needed for local IPC.
- **Flow control**: The host manages backpressure to backend services.
- **Deadlines on wire**: Deadlines are a client-local concern handled via `CallOptions.deadlineMs` and `AbortSignal`.
