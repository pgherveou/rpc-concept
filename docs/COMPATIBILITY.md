# Compatibility Strategy

This document describes how the RPC Bridge framework handles protocol evolution and forward/backward compatibility.

## Guiding Principles

1. **Additive evolution**: New features are added in ways that older implementations can safely ignore.
2. **Fail gracefully**: Unknown body variants, fields, methods, and error codes are handled without crashing.
3. **No negotiation needed**: Guest and host are built and deployed together, so version negotiation is unnecessary.

## Wire Protocol Evolution

### Forward Compatibility

The protocol is designed so that older implementations can safely handle messages from newer ones:

| Change | Mechanism |
|--------|-----------|
| Adding new `oneof` body variants | Unknown keys are ignored; frame is skipped |
| Adding new fields to body messages | Extra JSON keys are silently ignored by decoders (e.g., `details` on `ErrorBody`) |
| Adding new error codes | Unknown codes are treated as INTERNAL |

### Unknown Body Variant Tolerance

The frame type is determined by which `oneof body` key is present in the JSON object. Receivers MUST silently ignore frames where no recognized body key is found:

```typescript
// No recognized body key -> skip for forward compatibility
this.logger.debug(`Ignoring frame with unknown body type`);
```

Future body variants (e.g., `ping`, `goaway`) can be added as new `oneof` alternatives without breaking older implementations.

### Unknown Field Tolerance

Since frames are JSON-encoded, unknown fields within body messages are naturally ignored by decoders that only destructure known properties. Extra keys in the JSON object are silently skipped.

### Proto Field Numbering

The `frame.proto` uses these field numbers:

```
Field 1:          stream_id
Field 2:          open (OpenBody)
Field 3:          message (MessageBody)
Field 4:          half_close (HalfCloseBody)
Field 5:          close (CloseBody)
Field 6:          cancel (CancelBody)
Field 7:          error (ErrorBody)
```

## Service Evolution

### Adding Methods

New RPC methods can be added to a service without breaking existing clients:

- Old clients that do not call the new method are unaffected.
- New clients calling the new method against an old server receive an `UNIMPLEMENTED` error.

### Removing Methods

Removed methods SHOULD return `UNIMPLEMENTED` (error code 12) to old clients that still call them.

## Message Evolution

### Proto Field Evolution Rules

The framework follows standard proto3 evolution rules for schema definitions:

| Rule | Description |
|------|-------------|
| **Never reuse field names** | Once assigned, a field name must not be reassigned to a different type |
| **Never change field types** | A field's type must not change |
| **New fields must be optional** | New fields should have sensible defaults when absent |

### What an Old Decoder Sees

When an old decoder (v1) receives a v2 message with new fields, unknown JSON keys are silently ignored. The old decoder works correctly with the data it understands.

### What a New Decoder Sees

When a new decoder receives an old message missing new fields, those fields take their defaults (0, empty string, false, null). The new decoder gets sensible defaults.

## ErrorBody `details` Field

The `details` field on `ErrorBody` is a forward-compatible addition. It carries typed startup error payloads for streaming RPCs with the `startup_error` method option.

- **Old client, new server**: the client ignores the unknown `details` key in the JSON and surfaces a generic `RpcError`. The typed payload is lost, but no crash occurs.
- **New client, old server**: the server never sets `details`, so the client sees `undefined` and throws the RpcError as a transport error (the `Subscription` path requires `details` to resolve `{ ok: false }`).

## Transport Disconnection

When the transport closes unexpectedly:

1. All active streams are cancelled with reason "Transport closed".
2. Pending promises/iterators are rejected with a `CancelledError`.

## Testing Strategy

The test suite (`tests/src/compatibility.test.ts`) validates:

- **Unknown body variants**: Frames with unrecognized body keys decode without error and are silently ignored.
- **Unknown fields**: Extra fields within body messages are silently skipped.
- **Unknown error codes**: Non-standard error codes round-trip correctly.
- **All body variants**: Encode and decode every frame type, verifying round-trip fidelity.
- **Edge cases**: Empty payloads, large payloads (100KB), unicode strings, large stream IDs.
