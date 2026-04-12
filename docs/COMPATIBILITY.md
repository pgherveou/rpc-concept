# Compatibility Strategy

This document describes how the RPC Bridge framework handles protocol evolution and forward/backward compatibility.

## Guiding Principles

1. **Additive evolution**: New features are added in ways that older implementations can safely ignore.
2. **Fail gracefully**: Unknown frame types, fields, methods, and error codes are handled without crashing.
3. **No negotiation needed**: Guest and host are built and deployed together, so version negotiation is unnecessary.

## Wire Protocol Evolution

### Forward Compatibility

The protocol is designed so that older implementations can safely handle messages from newer ones:

| Change | Mechanism |
|--------|-----------|
| Adding new optional fields to RpcFrame | Unknown fields are skipped by decoders |
| Adding new frame types | Unknown frame types are silently ignored |
| Adding new error codes | Unknown codes are treated as INTERNAL |

### Unknown Frame Type Tolerance

Receivers MUST silently ignore frame types they do not recognize:

```typescript
default:
  // Unknown frame type: ignore for forward compatibility
  this.logger.debug(`Ignoring unknown frame type ${frame.type}`);
  break;
```

Future frame types (e.g., PING, GOAWAY) can be added without breaking older implementations.

### Unknown Field Tolerance

Protobuf's wire format inherently supports unknown field tolerance:

- Every field is encoded as a (tag, value) pair.
- The tag contains the wire type, which tells the decoder how many bytes to skip.
- Fields not recognized by the decoder are skipped without error.

The hand-rolled decoder in `frame.ts` implements this:

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

### Field Numbering

The `frame.proto` uses these field numbers:

```
Field 1:          type (FrameType)
Field 2:          stream_id
Field 4:          payload
Field 15:         method
Fields 20-21:     error_code, error_message
```

## Service Evolution

### Adding Methods

New RPC methods can be added to a service without breaking existing clients:

- Old clients that do not call the new method are unaffected.
- New clients calling the new method against an old server receive an `UNIMPLEMENTED` error.

### Removing Methods

Removed methods SHOULD return `UNIMPLEMENTED` (error code 12) to old clients that still call them.

## Message Evolution

### Proto3 Field Rules

The framework follows standard proto3 evolution rules:

| Rule | Description |
|------|-------------|
| **Never reuse field numbers** | Once assigned, a field number must never be reassigned |
| **Never change field types** | A field's wire type must not change |
| **New fields must be optional** | Proto3 fields are optional by default |

### What an Old Decoder Sees

When an old decoder (v1) receives a v2 message with new fields, unknown fields are silently skipped. The old decoder works correctly with the data it understands.

### What a New Decoder Sees

When a new decoder receives an old message missing new fields, those fields take their proto3 defaults (0, empty string, false). The new decoder gets sensible defaults.

## Transport Disconnection

When the transport closes unexpectedly:

1. All active streams are cancelled with reason "Transport closed".
2. Pending promises/iterators are rejected with a `CancelledError`.

## Testing Strategy

The test suite (`tests/src/compatibility.test.ts`) validates:

- **Unknown frame types**: Frames with future type values decode without error and are silently ignored.
- **Unknown fields**: Extra fields appended to valid frames are silently skipped.
- **Unknown error codes**: Non-standard error codes round-trip correctly.
- **All frame types**: Encode and decode every frame type, verifying round-trip fidelity.
- **Edge cases**: Empty payloads, large payloads (100KB), unicode strings, large stream IDs.
