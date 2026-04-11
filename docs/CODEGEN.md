# Code Generation Strategy

This document describes how the RPC Bridge code generator works, what it produces, and how to extend it for new languages.

## Overview

The code generator (`packages/codegen`) reads `.proto` files and produces platform-specific source code for TypeScript, Swift, and Kotlin. The generated code provides:

1. **Message types** with binary protobuf encode/decode methods
2. **Client stubs** that wrap the RPC client with typed methods
3. **Server interfaces** and **dispatchers** that route incoming RPCs to typed handler implementations

## What Gets Generated vs. What's Runtime

| Concern | Generated | Runtime |
|---------|-----------|---------|
| Message structs/classes | Yes | No |
| Message encode/decode | Yes | Uses runtime `ProtoWriter`/`ProtoReader` (TS) or emitted helpers (Swift/Kotlin) |
| Client stub methods | Yes | Delegates to runtime `RpcClient` |
| Server handler interfaces | Yes | No |
| Server dispatcher | Yes | Registers with runtime `RpcServer` |
| Frame encode/decode | No | `@rpc-bridge/core` (frame.ts) |
| Stream management | No | `@rpc-bridge/core` (stream.ts) |
| Flow control | No | `@rpc-bridge/core` (flow-control.ts) |
| Transport | No | Platform adapter packages |

The key insight: generated code handles **serialization and type safety**, while the runtime handles **protocol mechanics** (framing, streaming, flow control, handshake).

## Proto Parser

### Hand-Rolled Minimal Parser

The code generator includes a hand-rolled proto parser (`src/parser.ts`) rather than depending on `protoc` or `protobufjs`. This is intentional:

- **Zero external dependencies**: The codegen tool is self-contained.
- **Sufficient for RPC bridge use**: Parses the subset of proto3 needed for service stub generation (messages, enums, services, fields).
- **Deterministic output**: No dependency on `protoc` version or plugin compatibility.

### Parsed AST

The parser produces a `ProtoFile` AST:

```typescript
interface ProtoFile {
  syntax: string;        // "proto3"
  package: string;       // "demo.hello.v1"
  messages: MessageDef[];
  enums: EnumDef[];
  services: ServiceDef[];
}

interface MessageDef {
  name: string;          // "HelloRequest"
  fields: FieldDef[];    // [{name: "name", type: "string", number: 1, ...}]
  reserved: number[];    // [10, 11, 12, ...]
}

interface ServiceDef {
  name: string;          // "HelloBridgeService"
  methods: MethodDef[];  // [{name: "SayHello", inputType: "HelloRequest", ...}]
}
```

### Supported Proto3 Features

| Feature | Supported |
|---------|-----------|
| `syntax = "proto3"` | Yes |
| `package` | Yes |
| `message` | Yes |
| `enum` | Yes |
| `service` + `rpc` | Yes |
| Scalar types (string, bytes, bool, int32, uint32, int64, uint64, etc.) | Yes |
| `repeated` fields | Yes |
| `optional` fields | Yes |
| `reserved` declarations | Yes (field numbers) |
| `[deprecated = true]` option | Yes |
| `stream` keyword in RPC methods | Yes |
| `import` statements | Skipped (not resolved) |
| `map` fields | Skipped |
| `oneof` | Skipped |
| Nested messages | Skipped |
| Package-qualified type references | Partially (strips package prefix) |

For production use with complex proto schemas, consider replacing the parser with `protoc` + a custom plugin while keeping the same generator output format.

## TypeScript Generation

The TypeScript generator (`src/gen-typescript.ts`) produces three files per proto:

### messages.ts -- Message Types

For each message, generates:

1. An **interface** (`IHelloRequest`) defining the plain-object shape
2. A **class** (`HelloRequest`) implementing the interface with:
   - Fields with proto3 default values
   - Constructor accepting `Partial<IHelloRequest>`
   - Static `encode(msg)` method returning `Uint8Array`
   - Static `decode(data)` method returning the class instance

```typescript
export interface IHelloRequest {
  name: string;
  language: string;
}

export class HelloRequest implements IHelloRequest {
  name: string = '';
  language: string = '';

  constructor(init?: Partial<IHelloRequest>) {
    if (init) { Object.assign(this, init); }
  }

  static encode(msg: IHelloRequest): Uint8Array {
    const w = new ProtoWriter();
    w.writeStringField(1, msg.name);
    w.writeStringField(2, msg.language);
    return w.finish();
  }

  static decode(data: Uint8Array): HelloRequest {
    const r = new ProtoReader(data);
    const msg = new HelloRequest();
    while (r.hasMore()) {
      const tag = r.readTag();
      const fieldNumber = tag >>> 3;
      const wireType = tag & 0x7;
      switch (fieldNumber) {
        case 1: msg.name = r.readString(); break;
        case 2: msg.language = r.readString(); break;
        default: r.skipField(wireType); break;
      }
    }
    return msg;
  }
}
```

The `encode`/`decode` methods use `ProtoWriter`/`ProtoReader` from `@rpc-bridge/core`, producing wire-compatible protobuf binary output.

For enums, generates TypeScript `enum` declarations:

```typescript
export enum MethodType {
  METHOD_TYPE_UNSPECIFIED = 0,
  METHOD_TYPE_UNARY = 1,
  // ...
}
```

### client.ts -- Client Stubs

For each service, generates a client class that wraps `RpcClient`:

```typescript
export class HelloBridgeServiceClient {
  private readonly client: RpcClient;
  private readonly service: string;

  constructor(client: RpcClient, service?: string) {
    this.client = client;
    this.service = service ?? 'demo.hello.v1.HelloBridgeService';
  }

  // Unary RPC
  async sayHello(request: HelloRequest, options?: CallOptions): Promise<HelloResponse> {
    const requestBytes = HelloRequest.encode(request);
    const result = await this.client.unary(`${this.service}/SayHello`, requestBytes, options);
    return HelloResponse.decode(result.data);
  }

  // Server-streaming RPC
  async *watchGreeting(request: GreetingStreamRequest, options?: CallOptions):
      AsyncGenerator<GreetingEvent, void, undefined> {
    const requestBytes = GreetingStreamRequest.encode(request);
    const stream = this.client.serverStream(`${this.service}/WatchGreeting`, requestBytes, options);
    for await (const chunk of stream) {
      yield GreetingEvent.decode(chunk);
    }
  }

  // Client-streaming RPC
  async collectNames(requests: AsyncIterable<CollectNamesRequest>, options?: CallOptions):
      Promise<CollectNamesResponse> {
    const encoded = (async function* () {
      for await (const req of requests) { yield CollectNamesRequest.encode(req); }
    })();
    const result = await this.client.clientStream(`${this.service}/CollectNames`, encoded, options);
    return CollectNamesResponse.decode(result.data);
  }

  // Bidi-streaming RPC
  async *chat(requests: AsyncIterable<ChatMessage>, options?: CallOptions):
      AsyncGenerator<ChatMessage, void, undefined> {
    const encoded = (async function* () {
      for await (const req of requests) { yield ChatMessage.encode(req); }
    })();
    const stream = this.client.bidiStream(`${this.service}/Chat`, encoded, options);
    for await (const chunk of stream) {
      yield ChatMessage.decode(chunk);
    }
  }
}
```

### server.ts -- Server Interfaces and Dispatchers

For each service, generates:

1. A **handler interface** (`IHelloBridgeServiceHandler`) with typed method signatures
2. A **registration factory** (`registerHelloBridgeService(handler)`) that returns a `ServiceRegistration`

```typescript
export interface IHelloBridgeServiceHandler {
  sayHello(request: HelloRequest, context: CallContext): Promise<HelloResponse>;
  watchGreeting(request: GreetingStreamRequest, context: CallContext): AsyncIterable<GreetingEvent>;
  collectNames(requests: AsyncIterable<CollectNamesRequest>, context: CallContext): Promise<CollectNamesResponse>;
  chat(requests: AsyncIterable<ChatMessage>, context: CallContext): AsyncIterable<ChatMessage>;
}

export function registerHelloBridgeService(handler: IHelloBridgeServiceHandler): ServiceRegistration {
  const methods: Record<string, MethodHandler> = {};

  methods['SayHello'] = {
    type: MethodType.UNARY,
    handler: async (requestBytes, context) => {
      const request = HelloRequest.decode(requestBytes);
      const response = await handler.sayHello(request, context);
      return HelloResponse.encode(response);
    },
  };
  // ... other methods ...

  return { name: 'demo.hello.v1.HelloBridgeService', methods };
}
```

The dispatcher handles the serialization boundary: it decodes incoming bytes into typed messages, calls the handler, and encodes the response back to bytes.

## Swift Generation

The Swift generator (`src/gen-swift.ts`) produces a single `.swift` file containing:

### Protobuf Helpers

Each generated file includes `ProtoWriter` and `ProtoReader` structs that are wire-compatible with the TypeScript implementation. These are emitted inline to avoid a separate dependency.

### Namespace Enum

All types are nested inside a namespace enum (e.g., `DemoHelloV1`) to avoid polluting the global scope:

```swift
public enum DemoHelloV1 {
    // Messages, enums, protocols, dispatchers...
}
```

### Message Structs

For each message, generates a `Codable`, `Sendable`, `Equatable` struct with:

- Typed properties with default values
- Memberwise initializer
- `encode() -> Data` method
- `static func decode(from data: Data) -> Self` method

```swift
public struct HelloRequest: Codable, Sendable, Equatable {
    public var name: String
    public var language: String

    public init(name: String = "", language: String = "") {
        self.name = name
        self.language = language
    }

    public func encode() -> Data {
        var writer = ProtoWriter()
        if !name.isEmpty { writer.writeStringField(fieldNumber: 1, value: name) }
        if !language.isEmpty { writer.writeStringField(fieldNumber: 2, value: language) }
        return writer.finish()
    }

    public static func decode(from data: Data) -> Self {
        var reader = ProtoReader(data: data)
        var name: String = ""
        var language: String = ""
        while reader.hasMore() {
            let tag = reader.readTag()
            let fieldNumber = tag >> 3
            let wireType = tag & 0x7
            switch fieldNumber {
            case 1: name = reader.readString()
            case 2: language = reader.readString()
            default: reader.skipField(wireType: wireType)
            }
        }
        return Self(name: name, language: language)
    }
}
```

### Service Protocol

For each service, generates a Swift protocol using `async`/`await` and `AsyncStream`/`AsyncThrowingStream`:

```swift
public protocol HelloBridgeServiceProvider: Sendable {
    func sayHello(_ request: HelloRequest) async throws -> HelloResponse
    func watchGreeting(_ request: GreetingStreamRequest) -> AsyncThrowingStream<GreetingEvent, Error>
    func collectNames(_ requests: AsyncStream<CollectNamesRequest>) async throws -> CollectNamesResponse
    func chat(_ requests: AsyncStream<ChatMessage>) -> AsyncThrowingStream<ChatMessage, Error>
}
```

### Dispatcher Class

A `Dispatcher` class that routes raw bytes to the typed protocol methods:

```swift
public final class HelloBridgeServiceDispatcher: @unchecked Sendable {
    private let provider: any HelloBridgeServiceProvider

    public func dispatch(method: String, requestData: Data?, requestStream: AsyncStream<Data>?)
        async throws -> DispatchResult {
        switch method {
        case "demo.hello.v1.HelloBridgeService/SayHello":
            let request = HelloRequest.decode(from: requestData!)
            let response = try await provider.sayHello(request)
            return .unary(response.encode())
        // ...
        }
    }
}
```

## Kotlin Generation

The Kotlin generator (`src/gen-kotlin.ts`) produces a single `.kt` file containing:

### Data Classes

For each message, generates a Kotlin `data class` with:

- Properties with default values
- `encode(): ByteArray` method
- `companion object { fun decode(data: ByteArray): ClassName }` method

```kotlin
data class HelloRequest(
    val name: String = "",
    val language: String = "",
) {
    fun encode(): ByteArray {
        val w = ProtoWriter()
        if (name.isNotEmpty()) w.writeStringField(1, name)
        if (language.isNotEmpty()) w.writeStringField(2, language)
        return w.finish()
    }

    companion object {
        fun decode(data: ByteArray): HelloRequest {
            val r = ProtoReader(data)
            var name = ""
            var language = ""
            while (r.hasMore()) {
                val tag = r.readTag()
                when (tag shr 3) {
                    1 -> name = r.readString()
                    2 -> language = r.readString()
                    else -> r.skipField(tag and 0x7)
                }
            }
            return HelloRequest(name = name, language = language)
        }
    }
}
```

### Service Interface

For each service, generates a Kotlin `interface` using `suspend` functions and `Flow`:

```kotlin
interface HelloBridgeServiceHandler {
    suspend fun sayHello(request: HelloRequest): HelloResponse
    fun watchGreeting(request: GreetingStreamRequest): Flow<GreetingEvent>
    suspend fun collectNames(requests: Flow<CollectNamesRequest>): CollectNamesResponse
    fun chat(requests: Flow<ChatMessage>): Flow<ChatMessage>
}
```

### Dispatcher Class

A dispatcher class routing raw bytes to typed interface methods, analogous to the Swift dispatcher.

## CLI Usage

The code generator is invoked via the CLI:

```bash
rpc-bridge-codegen \
  --proto <path-to-proto-file> \
  --ts-out <typescript-output-dir> \
  --swift-out <swift-output-dir> \
  --kotlin-out <kotlin-output-dir>
```

All output flags are optional. Only languages with a specified output directory are generated.

### Example

```bash
# Generate all three languages
rpc-bridge-codegen \
  --proto proto/demo/hello/v1/hello.proto \
  --ts-out generated/ts/demo/hello/v1 \
  --swift-out generated/swift \
  --kotlin-out generated/kotlin

# Generate TypeScript only
rpc-bridge-codegen \
  --proto proto/demo/hello/v1/hello.proto \
  --ts-out generated/ts/demo/hello/v1
```

### Output Files

For a proto file with package `demo.hello.v1` and service `HelloBridgeService`:

| Flag | Files Generated |
|------|----------------|
| `--ts-out <dir>` | `messages.ts`, `client.ts`, `server.ts`, `index.ts` |
| `--swift-out <dir>` | `HelloBridgeService.swift` |
| `--kotlin-out <dir>` | `HelloBridgeService.kt` |

### Using the npm Script

From the monorepo root:

```bash
npm run generate
```

This runs the codegen with the demo proto file, outputting to `generated/`.

## Extending the Codegen for New Languages

To add code generation for a new language (e.g., Dart, C#, Python):

### 1. Create a Generator Module

Add `src/gen-<language>.ts` following the pattern of the existing generators. The module should export a single function:

```typescript
export function generateDart(proto: ProtoFile): string {
  // Return the complete generated source as a string
}
```

### 2. Handle Type Mapping

Map proto types to the target language:

```typescript
const PROTO_TO_DART: Record<string, string> = {
  'string': 'String',
  'bool': 'bool',
  'uint32': 'int',
  'uint64': 'int',
  'bytes': 'Uint8List',
  // ...
};
```

### 3. Generate Message Encode/Decode

Two options:

**a) Emit inline helpers** (like Swift): Include `ProtoWriter`/`ProtoReader` implementations in the generated code. Simpler but results in larger output.

**b) Use a runtime library** (like TypeScript): Import `ProtoWriter`/`ProtoReader` from a companion runtime package. Cleaner but requires a separate package.

### 4. Generate Service Stubs

Follow the pattern:
- **Client**: Typed methods that encode requests, call the raw RPC client, and decode responses.
- **Server interface**: Typed method signatures that implementors fulfill.
- **Dispatcher**: Bridges raw bytes to typed methods and back.

### 5. Wire into the CLI

Add the new language to `src/cli.ts`:

```typescript
case '--dart-out':
  result.dartOut = args[++i];
  break;
```

And invoke the generator:

```typescript
if (options.dartOut) {
  const dart = generateDart(proto);
  writeFile(resolve(options.dartOut, 'service.dart'), dart);
}
```

### 6. Export from index

Add to `src/index.ts`:

```typescript
export { generateDart } from './gen-dart.js';
```

### Key Invariant

All generated encode/decode code MUST produce and consume the same protobuf binary wire format. This is what enables cross-language interoperability. The field numbers, wire types, and encoding rules must exactly match `frame.proto` and the message definitions.
