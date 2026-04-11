# Versioning and Backward Compatibility Strategy

This document describes how the RPC Bridge framework handles protocol evolution, service evolution, and backward/forward compatibility between different versions of clients and servers.

## Guiding Principles

1. **Never break existing deployments**: A newer client must be able to talk to an older server, and vice versa.
2. **Additive evolution**: New features are added in ways that older implementations can safely ignore.
3. **Explicit negotiation**: Feature availability is negotiated at connection time, not assumed.
4. **Fail gracefully**: Unknown frame types, fields, methods, and capabilities are handled without crashing.

## Wire Protocol Evolution Rules

### What Requires a Version Bump

The `protocol_version` field in HANDSHAKE frames is only incremented for changes that fundamentally alter the wire format:

- Changing the encoding of existing fields (e.g., switching from varint to fixed-width)
- Changing the semantics of an existing frame type
- Removing a required frame in the connection lifecycle

### What Does NOT Require a Version Bump

Most evolution is handled by the forward-compatibility mechanisms:

| Change | Mechanism |
|--------|-----------|
| Adding new optional fields to RpcFrame | Unknown fields are skipped by decoders |
| Adding new frame types | Unknown frame types are silently ignored |
| Adding new capabilities | Unknown capabilities are filtered during negotiation |
| Adding new error codes | Unknown codes are treated as UNKNOWN |
| Adding new method types | Unknown method types are decodable (varint) |
| Adding new extension keys | Extensions map is opt-in |

### Reserved Field Ranges

The `frame.proto` reserves field number ranges for future use:

```
Fields 1-6:     Core frame fields (type, stream_id, sequence, payload, metadata, flags)
Fields 10-12:   HANDSHAKE
Fields 15-17:   OPEN
Fields 20-22:   ERROR
Field 25:       REQUEST_N
Field 30:       CLOSE
Fields 50-99:   Reserved for future standardized fields
Field 100:      Extensions (experimental features)
Fields 101-199: Reserved for future standardized fields
```

New standardized fields MUST use numbers from the reserved ranges. This prevents collisions between the standard protocol and extensions.

## Service Evolution

### Adding Methods

New RPC methods can be added to a service without breaking existing clients:

- Old clients that do not call the new method are unaffected.
- New clients calling the new method against an old server will receive an `UNIMPLEMENTED` error, which they can handle gracefully.

```protobuf
service HelloBridgeService {
  rpc SayHello(HelloRequest) returns (HelloResponse);        // v1
  rpc WatchGreeting(GreetingStreamRequest) returns (stream GreetingEvent);  // v1
  rpc TranslateHello(TranslateRequest) returns (TranslateResponse);  // v2 (new)
}
```

### Deprecating Methods

Methods should be deprecated gradually:

1. Mark the method as deprecated in the proto file.
2. The server continues to implement the method but may return a deprecation warning in response metadata.
3. After a migration period, the server can return `UNIMPLEMENTED` for the deprecated method.

### Removing Methods

Removed methods SHOULD return `UNIMPLEMENTED` (error code 12) to old clients that still call them. This is preferable to silent failures or crashes.

## Message Evolution

### Proto3 Field Rules

The framework follows standard proto3 evolution rules:

| Rule | Description |
|------|-------------|
| **Never reuse field numbers** | Once a field number is assigned, it must never be reassigned to a different field |
| **Never change field types** | A field's wire type (varint, length-delimited, etc.) must not change |
| **New fields must be optional** | Proto3 fields are optional by default; new fields have zero/empty defaults |
| **Use `reserved`** | Mark removed field numbers and names as reserved to prevent accidental reuse |

Example of safe message evolution:

```protobuf
// v1
message HelloRequest {
  string name = 1;
  reserved 10 to 20;  // Reserved for future use
}

// v2 (compatible)
message HelloRequest {
  string name = 1;
  string language = 2;           // New optional field
  reserved 10 to 20;
}

// v3 (compatible)
message HelloRequest {
  string name = 1;
  string language = 2;
  bool formal = 3;               // Another new field
  reserved 10 to 20;
}
```

### What an Old Decoder Sees

When an old decoder (v1) receives a v3 message:

- Field 1 (`name`): Decoded normally.
- Field 2 (`language`): Unknown field, **silently skipped** by the decoder.
- Field 3 (`formal`): Unknown field, **silently skipped** by the decoder.

The v1 decoder works correctly with the data it understands.

### What a New Decoder Sees

When a v3 decoder receives a v1 message:

- Field 1 (`name`): Decoded normally.
- Field 2 (`language`): Not present in the wire data, defaults to `""` (empty string).
- Field 3 (`formal`): Not present in the wire data, defaults to `false`.

The v3 decoder gets sensible defaults for fields the old sender did not include.

## Unknown Frame Type Tolerance

Receivers MUST silently ignore frame types they do not recognize. This is enforced at multiple levels:

**In `frame.ts` (decoder):**
```typescript
default:
  // Unknown field: skip for forward compatibility
  reader.skipField(wireType);
  break;
```

**In `client.ts` and `server.ts` (frame dispatch):**
```typescript
default:
  // Unknown frame type: ignore for forward compatibility
  this.logger.debug(`Ignoring unknown frame type ${frame.type}`);
  break;
```

This means future frame types (e.g., PING, PONG, GOAWAY) can be added without breaking older implementations. Older implementations simply ignore the new frames.

## Unknown Field Tolerance

Protobuf's wire format inherently supports unknown field tolerance:

- Every field is encoded as a (tag, value) pair.
- The tag contains the wire type, which tells the decoder how many bytes to skip.
- Fields not recognized by the decoder are skipped without error.

The hand-rolled decoder in `frame.ts` explicitly implements this:

```typescript
skipField(wireType: number): void {
  switch (wireType) {
    case 0: this.readVarint(); break;      // varint: read and discard
    case 1: this.offset += 8; break;       // 64-bit: skip 8 bytes
    case 2: this.readBytes(); break;       // length-delimited: read length, skip
    case 5: this.offset += 4; break;       // 32-bit: skip 4 bytes
    default: throw new Error(`Unknown wire type: ${wireType}`);
  }
}
```

## Feature/Capability Negotiation via HANDSHAKE

The HANDSHAKE frame carries a `capabilities` list that enables feature negotiation:

```
Client sends:  capabilities = ["flow_control", "deadline", "cancellation"]
Server sends:  capabilities = ["flow_control", "cancellation", "compression"]

Negotiated:    capabilities = {"flow_control", "cancellation"}
```

The negotiated capability set is the **intersection** of both sides' lists. Only features both sides support are active for the connection.

### Adding New Capabilities

New capabilities can be introduced without coordination:

1. A new implementation version advertises the new capability (e.g., `"compression"`).
2. When connecting to an older peer that does not advertise `"compression"`, the intersection excludes it.
3. The new implementation detects that compression is not negotiated and falls back to uncompressed operation.

This enables gradual rollout: new clients and servers start advertising a capability, and it becomes active only when both sides support it.

### Using Capabilities at Runtime

After the handshake, implementations should check the negotiated capabilities before using a feature:

```typescript
const result = client.getHandshakeResult();
if (result?.capabilities.has('compression')) {
  // Safe to use compressed payloads
}
```

## Version Negotiation

Protocol version negotiation follows a simple rule:

```
negotiated_version = min(client_version, server_version)
```

This ensures that the connection uses the highest version both sides understand:

| Client Version | Server Version | Negotiated |
|---------------|----------------|------------|
| 1 | 1 | 1 |
| 1 | 2 | 1 (server downgrades) |
| 2 | 1 | 1 (client downgrades) |
| 2 | 2 | 2 |
| 3 | 1 | 1 |

Higher-version implementations MUST support all lower versions to maintain backward compatibility.

## Reserved Extension Points

Several mechanisms exist for experimentation before standardization:

### Extensions Map (field 100)

```protobuf
map<string, bytes> extensions = 100;
```

Use namespaced keys for experimental features:

```
extensions = {
  "x-mycompany-trace-id": <trace ID bytes>,
  "x-mycompany-priority": <priority bytes>,
}
```

Once a feature is proven, it can be promoted to a standardized field number (from the reserved ranges).

### Reserved Frame Types

The `FrameType` enum reserves numbers for future use:

```protobuf
// FRAME_TYPE_PING = 9;
// FRAME_TYPE_PONG = 10;
// FRAME_TYPE_GOAWAY = 11;
// FRAME_TYPE_WINDOW_UPDATE = 12;
```

### Reserved Field Number Ranges

Fields 50-99 and 101-199 are reserved for future protocol fields.

## Graceful Degradation Patterns

### Missing Capability Fallback

If a capability is not negotiated, the implementation falls back:

| Capability | Without It |
|------------|-----------|
| `flow_control` | No backpressure; sender sends freely (risk of overwhelming) |
| `deadline` | No automatic timeout; callers must manage timeouts externally |
| `cancellation` | No stream cancellation; streams run to completion or error |
| `compression` | Payloads sent uncompressed |
| `metadata_binary` | Only string metadata values supported |

### Unknown Method Handling

When a server receives an OPEN frame for an unknown method:

1. Server sends ERROR frame with code `UNIMPLEMENTED` (12).
2. Client receives the error and can report it to the caller.
3. No stream resources are leaked.

### Transport Disconnection

When the transport closes unexpectedly:

1. All active streams are cancelled with reason "Transport closed".
2. Pending promises/iterators are rejected with a `CancelledError`.
3. The client/server can detect the disconnection and attempt reconnection (future feature).

## Testing Strategy for Compatibility

The test suite (`tests/src/compatibility.test.ts`) validates:

### Forward Compatibility Tests

- **Unknown frame types**: Verify that frames with future type values (e.g., type=99) decode without error.
- **Unknown fields**: Append fields from reserved ranges to a valid frame; verify they are silently skipped.
- **Unknown length-delimited fields**: Append unknown length-delimited data; verify correct skip behavior.
- **Unknown method types**: Verify that future method type values (e.g., 99) round-trip correctly.
- **Unknown error codes**: Verify that non-standard error codes (e.g., 999) round-trip correctly.

### Backward Compatibility Tests

- **Missing optional fields**: Decode frames with only required fields; verify sensible defaults.
- **Missing handshake fields**: Decode a minimal handshake (just version, no capabilities or implementation ID).
- **Empty extensions map**: Verify that an empty map is not encoded (proto3 semantics).
- **Old client + new server**: Verify that an old client without new capabilities can still complete RPCs.

### Round-Trip Tests

- **All frame types**: Encode and decode every frame type (HANDSHAKE through REQUEST_N).
- **All field types**: Exercise varint, string, bytes, map, and repeated field encoding.
- **Edge cases**: Empty payloads, large payloads (100KB), unicode metadata, large stream IDs, large sequence numbers.
- **Fully populated frame**: A frame with every possible field set, verifying all survive round-trip.

### Integration Tests

- **Handshake negotiation**: Client and server complete handshake with matching capabilities.
- **All RPC patterns**: Unary, server-streaming, client-streaming, and bidi-streaming with loopback transport.
- **Error propagation**: Server errors (NOT_FOUND, UNIMPLEMENTED) are correctly received by the client.
- **Cancellation**: Client cancellation via AbortSignal, deadline expiration, transport close during active streams.
- **Flow control**: SendFlowController and ReceiveFlowController unit tests for credit management.
