# Wire Protocol Specification

This document specifies the wire protocol used by the RPC Bridge framework. The protocol is defined in `proto/rpc/bridge/v1/frame.proto` and implemented in `packages/rpc-core/src/frame.ts`.

## Overview

All communication between client and server is expressed as a sequence of **RpcFrame** messages. Each frame is a protobuf-encoded binary blob. The protocol supports multiplexed, bidirectional streams with credit-based flow control.

Key properties:

- **Protobuf-compatible**: Frames are encoded using standard protobuf wire format. Native platforms (Swift, Kotlin) can decode frames using their protobuf libraries; the TypeScript side uses a hand-rolled encoder/decoder for zero-dependency operation.
- **Forward-compatible**: Unknown fields are silently skipped. Unknown frame types are ignored.
- **Stream-oriented**: Multiple concurrent streams share a single transport connection, identified by stream IDs.
- **Credit-based flow control**: Prevents fast producers from overwhelming slow consumers.

## Frame Format

Every frame is an `RpcFrame` protobuf message:

```protobuf
message RpcFrame {
  FrameType type    = 1;   // Frame type discriminator
  uint32 stream_id  = 2;   // Logical stream identifier
  uint32 sequence   = 3;   // Sequence number within stream+direction
  bytes payload     = 4;   // Message payload (for MESSAGE frames)
  map<string, string> metadata = 5;  // Key-value metadata
  uint32 flags      = 6;   // Bitfield flags

  // HANDSHAKE fields (10-12)
  uint32 protocol_version     = 10;
  repeated string capabilities = 11;
  string implementation_id    = 12;

  // OPEN fields (15-17)
  string method       = 15;
  uint64 deadline_ms  = 16;
  MethodType method_type = 17;

  // ERROR fields (20-22)
  uint32 error_code    = 20;
  string error_message = 21;
  bytes error_details  = 22;

  // REQUEST_N fields (25)
  uint32 request_n = 25;

  // CLOSE fields (30)
  map<string, string> trailers = 30;

  // Extension point (100)
  map<string, bytes> extensions = 100;

  // Reserved ranges for future use
  reserved 50 to 99;
  reserved 101 to 199;
}
```

### Binary Wire Format

The frame uses standard protobuf binary encoding:

- Each field is encoded as a **tag** (field number + wire type) followed by the value.
- **Varint fields** (type, stream_id, sequence, flags, protocol_version, deadline_ms, error_code, request_n, method_type): Tag wire type 0.
- **Length-delimited fields** (payload, method, implementation_id, error_message, error_details, capabilities entries): Tag wire type 2.
- **Map fields** (metadata, trailers, extensions): Encoded as repeated length-delimited entries, each containing key (field 1) and value (field 2) sub-fields.

Fields set to their default value (0 for integers, empty string, empty bytes) are omitted per proto3 semantics.

### Flags Bitfield

The `flags` field (field 6) is a bitfield for frame-type-specific options:

| Bit | Name | Description |
|-----|------|-------------|
| 0 | COMPRESSED_PAYLOAD | Payload is compressed (future) |
| 1-7 | Reserved | Reserved for future use |

## Frame Types

### HANDSHAKE (type = 1)

Connection-level handshake. Sent once per direction when a connection is established.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Must be 0 | Handshake is connection-level, not stream-level |
| `protocol_version` | Yes | Protocol version supported by this endpoint |
| `capabilities` | Yes | List of capability strings (may be empty) |
| `implementation_id` | Recommended | Human-readable implementation identifier |

**Negotiation rules:**
- The negotiated protocol version is `min(client_version, server_version)`.
- The negotiated capabilities are the intersection of both sides' capability lists.
- Unknown capabilities are ignored (enables forward capability negotiation).

**Well-known capabilities:**

| Capability | Description |
|------------|-------------|
| `flow_control` | Credit-based flow control (REQUEST_N frames) |
| `deadline` | Deadline/timeout support |
| `cancellation` | Stream cancellation support |
| `metadata_binary` | Binary metadata values (base64-encoded in string map) |
| `compression` | Compressed payloads (future) |

### OPEN (type = 2)

Opens a new logical RPC stream. Sent by the client to initiate an RPC call.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Unique stream identifier (odd for client-initiated) |
| `method` | Yes | Fully qualified method name: `"package.ServiceName/MethodName"` |
| `method_type` | Recommended | Hint about the streaming pattern (UNARY, SERVER_STREAMING, etc.) |
| `metadata` | Optional | Request headers (key-value pairs) |
| `deadline_ms` | Optional | Deadline in milliseconds from now (0 = no deadline) |

### MESSAGE (type = 3)

Carries a protobuf-encoded message payload. Used in both directions.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream this message belongs to |
| `sequence` | Yes | Monotonically increasing within stream+direction |
| `payload` | Yes | Protobuf-encoded message bytes |
| `metadata` | Optional | Per-message metadata (uncommon) |
| `flags` | Optional | Bit 0 indicates compressed payload |

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
| `trailers` | Optional | Trailing metadata (e.g., `grpc-status`) |

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
| `error_details` | Optional | Structured error details (protobuf-encoded) |

### REQUEST_N (type = 8)

Flow control frame: grants the peer N additional messages it may send on the specified stream.

| Field | Required | Description |
|-------|----------|-------------|
| `stream_id` | Yes | Stream to grant credits for |
| `request_n` | Yes | Number of additional messages permitted |

See the Flow Control section below for details.

## Stream Lifecycle

### Stream ID Allocation

- Stream ID **0** is reserved for connection-level frames (HANDSHAKE).
- **Odd** stream IDs (1, 3, 5, ...) are client-initiated (standard RPC calls).
- **Even** stream IDs (2, 4, 6, ...) are reserved for future server-initiated streams.

The client allocates stream IDs by incrementing by 2 from 1 (1, 3, 5, ...). The server side allocates from 2 (2, 4, 6, ...) if/when server-initiated streams are supported.

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

**State transitions:**

| From | Event | To |
|------|-------|----|
| IDLE | OPEN sent/received | OPEN |
| OPEN | Local HALF_CLOSE | HALF_CLOSED_LOCAL |
| OPEN | Remote HALF_CLOSE | HALF_CLOSED_REMOTE |
| HALF_CLOSED_LOCAL | Remote HALF_CLOSE | HALF_CLOSED_BOTH |
| HALF_CLOSED_REMOTE | Local HALF_CLOSE | HALF_CLOSED_BOTH |
| HALF_CLOSED_LOCAL / HALF_CLOSED_BOTH | CLOSE | CLOSED |
| OPEN / HALF_CLOSED_* | CANCEL | CANCELLED |
| OPEN / HALF_CLOSED_* | ERROR | ERROR |

### Sequence Numbering

Within a single stream and direction, MESSAGE frames carry a monotonically increasing sequence number starting from 1. This enables:

- **Ordering validation**: The receiver can detect out-of-order messages.
- **Duplicate detection**: The receiver can detect retransmitted messages.
- **Debugging**: Log messages can correlate frames by stream ID + sequence.

Non-MESSAGE frames (OPEN, HALF_CLOSE, CLOSE, CANCEL, ERROR, REQUEST_N) carry sequence 0.

## Flow Control

The protocol uses credit-based backpressure to prevent fast producers from overwhelming slow consumers.

### How It Works

1. When a stream opens, the receiver sends a **REQUEST_N** frame granting the sender N initial credits (default: 16).
2. The sender can send up to N MESSAGE frames.
3. With each MESSAGE sent, the sender decrements its credit count.
4. When credits reach 0, the sender MUST pause and wait for more credits.
5. As the receiver consumes messages, it periodically sends REQUEST_N to replenish credits.

### Credit Replenishment Strategy

The receiver uses a low-watermark approach:

- When remaining credits drop to 25% of the initial window (e.g., 4 out of 16), the receiver sends a REQUEST_N frame to replenish.
- The replenishment amount equals the initial window size (default: 16).
- This keeps the pipeline full while preventing unbounded buffering.

```
Credits (receiver view):

  Initial:  16  [################]
  After 12: 4   [####............]  <-- low watermark hit
  Replenish:+16 [####################]
```

## Metadata Handling

Metadata is carried as `map<string, string>` in frames:

- **Request metadata**: Sent in the OPEN frame's `metadata` field. Analogous to HTTP headers.
- **Response metadata**: Can be sent in MESSAGE frames' `metadata` field (uncommon).
- **Trailing metadata**: Sent in the CLOSE frame's `trailers` field. Analogous to HTTP trailers.

All metadata keys and values are strings. Binary values can be base64-encoded if the `metadata_binary` capability is negotiated.

## Error Codes

Error codes are modeled after gRPC status codes for familiarity. The numeric values match gRPC where applicable:

| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Not an error; returned on success |
| 1 | CANCELLED | Operation was cancelled |
| 2 | UNKNOWN | Unknown error |
| 3 | INVALID_ARGUMENT | Client sent an invalid argument |
| 4 | DEADLINE_EXCEEDED | Deadline expired before completion |
| 5 | NOT_FOUND | Requested entity not found |
| 6 | ALREADY_EXISTS | Entity already exists |
| 7 | PERMISSION_DENIED | Caller lacks permission |
| 8 | RESOURCE_EXHAUSTED | Resource quota exceeded |
| 9 | FAILED_PRECONDITION | Operation rejected due to system state |
| 10 | ABORTED | Operation was aborted |
| 11 | OUT_OF_RANGE | Operation attempted past valid range |
| 12 | UNIMPLEMENTED | Method not implemented |
| 13 | INTERNAL | Internal error |
| 14 | UNAVAILABLE | Service currently unavailable |
| 15 | DATA_LOSS | Unrecoverable data loss |
| 16 | UNAUTHENTICATED | Request not authenticated |

Receivers SHOULD handle unknown error codes gracefully by treating them as UNKNOWN (code 2).

## Protocol Version

The protocol version is exchanged in the HANDSHAKE frame:

- **Current version**: 1
- **Negotiation**: Both sides send their supported version. The effective version is the minimum of both.
- **Version increment**: The version number is incremented only for breaking wire-level changes.
- **Non-breaking changes** (adding new optional fields, new frame types, new capabilities) do NOT require a version bump because they are handled by the forward compatibility rules.

## Extension Points

The `extensions` field (field 100) provides an escape hatch for experimental features:

```protobuf
map<string, bytes> extensions = 100;
```

Keys should be namespaced to avoid collisions (e.g., `x-mycompany-feature`). Values are opaque bytes.

Reserved field number ranges (`50-99`, `101-199`) provide space for future standardized fields without conflicting with existing ones.
