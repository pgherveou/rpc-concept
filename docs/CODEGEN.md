# Code Generation Strategy

This document describes how the RPC Bridge code generator works, what it produces, and how to extend it for new languages.

## Overview

The code generator (`packages/codegen`) reads `.proto` files and produces platform-specific source code for TypeScript, Swift, and Kotlin. The generated code provides:

1. **Message types** (TypeScript) or **typealiases** to protoc-generated types (Swift) or **annotated data classes** (Kotlin)
2. **Client stubs** that wrap the RPC client with typed methods
3. **Server interfaces** and **dispatchers** that route incoming RPCs to typed handler implementations

## What Gets Generated vs. What's Runtime

| Concern | Generated | Runtime |
|---------|-----------|---------|
| Message structs/classes | Yes | No |
| Message encode/decode | Yes | `@bufbuild/protobuf` (TS), `SwiftProtobuf` (Swift), `kotlinx-serialization-protobuf` (Kotlin) |
| Client stub methods | Yes | Delegates to runtime `RpcClient` |
| Server handler interfaces | Yes | No |
| Server dispatcher | Yes | Registers with runtime `RpcServer` |
| Frame encode/decode | No | `@rpc-bridge/core` (frame.ts) |
| Stream management | No | `@rpc-bridge/core` (stream.ts) |
| Transport | No | Platform adapter packages |

The key insight: generated code handles **serialization and type safety**, while the runtime handles **protocol mechanics** (framing, streaming, errors).

## Proto Parser

The code generator uses [`protobufjs`](https://github.com/protobufjs/protobuf.js) as a dev dependency solely for parsing `.proto` files. This provides full proto3 support including imports, maps, oneofs, nested messages, and package-qualified type references. `protobufjs` is not used at runtime.

The parser (`src/parser.ts`) wraps protobufjs and converts its reflection API into a `ProtoFile` AST consumed by the generators:

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

The CLI offers two entry points: `parseProtoFile(path)` resolves imports from disk, `parseProto(content)` parses a string directly.

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
    const w = new BinaryWriter();
    if (msg.name.length) w.tag(1, WireType.LengthDelimited).string(msg.name);
    if (msg.language.length) w.tag(2, WireType.LengthDelimited).string(msg.language);
    return w.finish();
  }

  static decode(data: Uint8Array): HelloRequest {
    const r = new BinaryReader(data);
    const msg = new HelloRequest();
    while (r.pos < r.len) {
      const [fieldNumber, wireType] = r.tag();
      switch (fieldNumber) {
        case 1: msg.name = r.string(); break;
        case 2: msg.language = r.string(); break;
        default: r.skip(wireType); break;
      }
    }
    return msg;
  }
}
```

The `encode`/`decode` methods use `BinaryWriter`/`BinaryReader` from `@bufbuild/protobuf/wire`, producing standard protobuf binary output.

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
    const responseBytes = await this.client.unary(`${this.service}/SayHello`, requestBytes, options);
    return HelloResponse.decode(responseBytes);
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
    const responseBytes = await this.client.clientStream(`${this.service}/CollectNames`, encoded, options);
    return CollectNamesResponse.decode(responseBytes);
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

The Swift generator (`src/gen-swift.ts`) produces a single `.swift` file per service. Message encoding is handled entirely by [SwiftProtobuf](https://github.com/apple/swift-protobuf) via `protoc-gen-swift`, so the codegen only generates RPC glue code.

### Namespace Enum with Typealiases

All types are nested inside a namespace enum (e.g., `DemoHelloV1`). Messages are typealiases to the `protoc-gen-swift` generated types:

```swift
public enum DemoHelloV1 {
    public typealias HelloRequest = Demo_Hello_V1_HelloRequest
    public typealias HelloResponse = Demo_Hello_V1_HelloResponse
    // ...
}
```

The `protoc-gen-swift` naming convention maps package `demo.hello.v1` + message `HelloRequest` to `Demo_Hello_V1_HelloRequest`. The typealiases provide shorter names within the namespace.

Message structs are generated by running `protoc --swift_out` on the `.proto` files. These conform to `SwiftProtobuf.Message` and provide `serializedData()` / `init(serializedBytes:)` for encoding.

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
public final class HelloBridgeServiceDispatcher: ServiceDispatcher, @unchecked Sendable {
    private let provider: any HelloBridgeServiceProvider

    public func dispatch(method: String, messages: AsyncStream<Data>)
        async throws -> DispatchResult {
        switch method {
        case "demo.hello.v1.HelloBridgeService/SayHello":
            var requestData: Data?
            for await data in messages { requestData = data; break }
            guard let requestData else { throw DispatchError.missingRequestData }
            let request = try HelloRequest(serializedBytes: requestData)
            let response = try await provider.sayHello(request)
            return .unary(try response.serializedData())
        // ...
        }
    }
}
```

## Kotlin Generation

The Kotlin generator (`src/gen-kotlin.ts`) produces a single `.kt` file containing:

### Data Classes

For each message, generates a Kotlin `data class` annotated with `@Serializable` and `@ProtoNumber` from `kotlinx-serialization-protobuf`:

```kotlin
@Serializable
data class HelloRequest(
    @ProtoNumber(1) val name: String = "",
    @ProtoNumber(2) val language: String = "",
) {
    fun encode(): ByteArray = ProtoBuf.encodeToByteArray(this)

    companion object {
        fun decode(data: ByteArray): HelloRequest =
            ProtoBuf.decodeFromByteArray(data)
    }
}
```

The `@ProtoNumber` annotations map fields to their protobuf field numbers. Encoding and decoding is handled by `kotlinx-serialization-protobuf`, producing standard protobuf binary wire format.

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
  --proto demos/proto/hello.proto \
  --ts-out demos/generated \
  --swift-out demos/host/ios/RPCBridgeDemo/generated \
  --kotlin-out demos/host/android/generated

# Generate TypeScript only
rpc-bridge-codegen \
  --proto demos/proto/hello.proto \
  --ts-out demos/generated
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

This runs the codegen with the demo proto file, outputting to `demos/generated/` (TypeScript), `demos/host/ios/RPCBridgeDemo/generated/` (Swift), and `demos/host/android/generated/` (Kotlin).

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

Use an established protobuf library for the target language. Examples from existing generators:

- **TypeScript**: `BinaryWriter`/`BinaryReader` from `@bufbuild/protobuf/wire`
- **Swift**: `protoc-gen-swift` generates `SwiftProtobuf.Message` conforming types
- **Kotlin**: `@Serializable` + `@ProtoNumber` annotations with `kotlinx-serialization-protobuf`

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
