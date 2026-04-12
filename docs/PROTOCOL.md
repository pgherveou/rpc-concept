# Wire Protocol Specification

This document specifies the wire protocol used by the RPC Bridge framework. The protocol is defined in `proto/rpc/bridge/v1/frame.proto` and implemented in `packages/rpc-core/src/frame.ts`.

## Overview

All communication between client and server is expressed as a sequence of **RpcFrame** messages. Each frame is a protobuf-encoded binary blob. The protocol supports multiplexed, bidirectional streams over a single transport connection.

Key properties:

- **Protobuf-compatible**: Frames use standard protobuf wire format. Native platforms (Swift, Kotlin) can decode frames using their protobuf libraries; TypeScript uses a hand-rolled encoder/decoder for zero-dependency operation.
- **Forward-compatible**: Unknown fields are silently skipped. Unknown frame types are ignored.
- **Stream-oriented**: Multiple concurrent streams share a single transport, identified by stream IDs.
- **Local IPC only**: Designed for collocated guest/host communication. No handshake, no version negotiation, no network-oriented complexity.

## Frame Format

Every frame is an `RpcFrame` protobuf message:

```protobuf
message RpcFrame {
  FrameType type    = 1;   // Frame type discriminator
  uint32 stream_id  = 2;   // Logical stream identifier
  bytes payload     = 4;   // Message payload (MESSAGE frames)
  string method     = 15;  // Fully qualified method name (OPEN frames)
  uint32 error_code = 20;  // Error code (ERROR frames)
  string error_message = 21; // Error description (ERROR frames)
}
```

### Binary Wire Format

The frame uses standard protobuf binary encoding:

- Each field is encoded as a **tag** (field number + wire type) followed by the value.
- **Varint fields** (type, stream_id, error_code): Tag wire type 0.
- **Length-delimited fields** (payload, method, error_message): Tag wire type 2.

Fields set to their default value (0 for integers, empty string, empty bytes) are omitted per proto3 semantics.

## Frame Types

### OPEN (type = 2)

Opens a new logical RPC stream. Sent by the client to initiate an RPC call.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Unique stream identifier (odd for client-initiated) |
| `method` | Yes | Fully qualified method name: `"package.ServiceName/MethodName"` |

### MESSAGE (type = 3)

Carries a protobuf-encoded message payload. Used in both directions.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream this message belongs to |
| `payload` | Yes | Protobuf-encoded message bytes |

### HALF_CLOSE (type = 4)

Signals that the sender will not send any more MESSAGE frames on this stream.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream being half-closed |

Usage by pattern:
- **Unary**: Client sends HALF_CLOSE immediately after the single request MESSAGE.
- **Server-streaming**: Client sends HALF_CLOSE after the single request MESSAGE.
- **Client-streaming**: Client sends HALF_CLOSE after the last request MESSAGE.
- **Bidi-streaming**: Either side sends HALF_CLOSE when done sending messages.

### CLOSE (type = 5)

Signals successful completion of the stream. Sent by the server after all response messages have been sent.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream being closed |

After CLOSE is sent, no more frames should be sent on this stream by either side.

### CANCEL (type = 6)

Requests cancellation of an active stream. Can be sent by either side.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream to cancel |

The recipient SHOULD stop processing and clean up resources for the stream. No response is expected.

### ERROR (type = 7)

Signals an error on the stream. Terminates the stream immediately.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream that errored |
| `error_code` | Yes | Error code (see Error Codes below) |
| `error_message` | Recommended | Human-readable error description |

## Stream Lifecycle

### Stream ID Allocation

- Stream ID **0** is reserved (unused).
- **Odd** stream IDs (1, 3, 5, ...) are client-initiated (standard RPC calls).
- **Even** stream IDs (2, 4, 6, ...) are reserved for future server-initiated streams.

The client allocates stream IDs by incrementing by 2 from 1 (1, 3, 5, ...).

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

Since this is a local IPC protocol between collocated guest and host (same device, same process), the following network-oriented features are intentionally omitted:

- **Handshake/version negotiation**: Guest and host are built and deployed together.
- **Sequence numbers**: Message ordering is guaranteed by the single-threaded JS event loop and the underlying transport.
- **Metadata/trailers**: No HTTP headers analogue needed for local IPC.
- **Flow control**: The host manages backpressure to backend services.
- **Deadlines on wire**: Deadlines are a client-local concern handled via `CallOptions.deadlineMs` and `AbortSignal`.
