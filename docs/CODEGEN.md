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
| Message encode/decode | Yes | Native JSON (TS), `Codable` (Swift), `kotlinx.serialization.json` (Kotlin) |
| Client stub methods | Yes | Delegates to runtime `RpcClient` |
| Server handler interfaces | Yes | No |
| Server dispatcher | Yes | Registers with runtime `RpcServer` |
| Frame types/guards | No | `@rpc-bridge/core` (frame.ts) |
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
  name: string;          // "HelloService"
  methods: MethodDef[];  // [{name: "SayHello", inputType: "HelloRequest", ...}]
}
```

The CLI offers two entry points: `parseProtoFile(path)` resolves imports from disk, `parseProto(content)` parses a string directly.

## TypeScript Generation

The TypeScript generator (`src/gen-typescript.ts`) produces three files per proto:

### messages.ts -- Message Types

For each message, generates:

1. An **interface** (`HelloRequest`) defining the plain-object shape
2. A **factory function** (`createHelloRequest(init)`) for constructing instances with defaults

```typescript
export interface HelloRequest {
  name: string;
  language: string;
}

export function createHelloRequest(init?: Partial<HelloRequest>): HelloRequest {
  return {
    name: '',
    language: '',
    ...init,
  };
}
```

Messages are plain TypeScript interfaces. For each message, a JSON codec object (e.g., `HelloRequestJSON`) is also generated with `encode` and `decode` methods for use on native bridge transports.

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
export class HelloServiceClient {
  private readonly client: RpcClient;
  private readonly service: string;
  private readonly json: boolean;

  constructor(client: RpcClient, options?: { service?: string; json?: boolean }) {
    this.client = client;
    this.service = options?.service ?? 'demo.hello.v1.HelloService';
    this.json = options?.json ?? false;
  }

  // Unary RPC
  async sayHello(request: HelloRequest, options?: CallOptions): Promise<HelloResponse> {
    const data = this.json ? HelloRequestJSON.encode(request) : request;
    const result = await this.client.unary(`${this.service}/SayHello`, data, options);
    return (this.json ? HelloResponseJSON.decode(result) : result) as HelloResponse;
  }

  // Server-streaming RPC
  async *watchGreeting(request: GreetingStreamRequest, options?: CallOptions):
      AsyncGenerator<GreetingEvent, void, undefined> {
    const data = this.json ? GreetingStreamRequestJSON.encode(request) : request;
    for await (const item of this.client.serverStream(`${this.service}/WatchGreeting`, data, options)) {
      yield (this.json ? GreetingEventJSON.decode(item) : item) as GreetingEvent;
    }
  }

  // Client-streaming RPC
  async collectNames(requests: AsyncIterable<CollectNamesRequest>, options?: CallOptions):
      Promise<CollectNamesResponse> {
    return await this.client.clientStream(`${this.service}/CollectNames`, requests, options);
  }

  // Bidi-streaming RPC
  async *chat(requests: AsyncIterable<ChatMessage>, options?: CallOptions):
      AsyncGenerator<ChatMessage, void, undefined> {
    for await (const item of this.client.bidiStream(`${this.service}/Chat`, requests, options)) {
      yield item as ChatMessage;
    }
  }
}
```

### server.ts -- Server Interfaces and Dispatchers

For each service, generates:

1. A **handler interface** (`IHelloServiceHandler`) with typed method signatures
2. A **registration factory** (`registerHelloService(handler)`) that returns a `ServiceRegistration`

```typescript
export interface IHelloServiceHandler {
  sayHello(request: HelloRequest, context: CallContext): Promise<HelloResponse>;
  watchGreeting(request: GreetingStreamRequest, context: CallContext): AsyncIterable<GreetingEvent>;
  collectNames(requests: AsyncIterable<CollectNamesRequest>, context: CallContext): Promise<CollectNamesResponse>;
  chat(requests: AsyncIterable<ChatMessage>, context: CallContext): AsyncIterable<ChatMessage>;
}

export function registerHelloService(
  handler: IHelloServiceHandler,
  options?: { json?: boolean },
): ServiceRegistration {
  const methods: Record<string, MethodHandler> = {};

  methods['SayHello'] = {
    type: MethodType.UNARY,
    handler: async (data, context) => {
      const request = (json ? HelloRequestJSON.decode(data) : data) as HelloRequest;
      const response = await handler.sayHello(request, context);
      return json ? HelloResponseJSON.encode(response) : response;
    },
  };
  // ... other methods ...

  return { name: 'demo.hello.v1.HelloService', methods };
}
```

When `json` is true (required for native bridges like iOS/Android), the dispatcher uses generated JSON codecs to decode incoming payloads and encode outgoing responses. When `json` is false (default, for structured clone transports), payloads are cast directly to their typed interfaces.

## Swift Generation

The Swift generator (`src/gen-swift.ts`) produces a single `.swift` file per service containing message structs, service protocols, and dispatchers.

### Message Structs

For each message, generates a `Codable` struct with `CodingKeys` for JSON serialization:

```swift
public struct HelloRequest: Codable, Sendable {
    public var name: String
    public var language: String

    public init(name: String = "", language: String = "") {
        self.name = name
        self.language = language
    }

    enum CodingKeys: String, CodingKey {
        case name, language
    }
}
```

All types are nested inside a namespace enum (e.g., `DemoHelloV1`) for organization.

### Service Protocol

For each service, generates a Swift protocol using `async`/`await` and `AsyncStream`/`AsyncThrowingStream`:

```swift
public protocol HelloServiceProvider: Sendable {
    func sayHello(_ request: HelloRequest) async throws -> HelloResponse
    func watchGreeting(_ request: GreetingStreamRequest) -> AsyncThrowingStream<GreetingEvent, Error>
    func collectNames(_ requests: AsyncStream<CollectNamesRequest>) async throws -> CollectNamesResponse
    func chat(_ requests: AsyncStream<ChatMessage>) -> AsyncThrowingStream<ChatMessage, Error>
}
```

### Dispatcher Class

A `Dispatcher` class that routes JSON payloads to the typed protocol methods:

```swift
public final class HelloServiceDispatcher: ServiceDispatcher, @unchecked Sendable {
    private let provider: any HelloServiceProvider

    public func dispatch(method: String, messages: AsyncStream<Any>)
        async throws -> DispatchResult {
        switch method {
        case "demo.hello.v1.HelloService/SayHello":
            var requestData: Any?
            for await data in messages { requestData = data; break }
            guard let requestData else { throw DispatchError.missingRequestData }
            let jsonData = try JSONSerialization.data(withJSONObject: requestData)
            let request = try JSONDecoder().decode(HelloRequest.self, from: jsonData)
            let response = try await provider.sayHello(request)
            return .unary(response)
        // ...
        }
    }
}
```

## Kotlin Generation

The Kotlin generator (`src/gen-kotlin.ts`) produces a single `.kt` file containing:

### Data Classes

For each message, generates a Kotlin `data class` annotated with `@Serializable` from `kotlinx.serialization`:

```kotlin
@Serializable
data class HelloRequest(
    val name: String = "",
    val language: String = "",
)
```

Encoding and decoding is handled by `kotlinx.serialization.json`, producing standard JSON.

### Service Interface

For each service, generates a Kotlin `interface` using `suspend` functions and `Flow`:

```kotlin
interface HelloServiceHandler {
    suspend fun sayHello(request: HelloRequest): HelloResponse
    fun watchGreeting(request: GreetingStreamRequest): Flow<GreetingEvent>
    suspend fun collectNames(requests: Flow<CollectNamesRequest>): CollectNamesResponse
    fun chat(requests: Flow<ChatMessage>): Flow<ChatMessage>
}
```

### Dispatcher Class

A dispatcher class routing JSON payloads to typed interface methods, analogous to the Swift dispatcher.

## Method Options

### `startup_error`

The `startup_error` method option is supported on server-streaming RPCs. It declares a typed error that the handler may throw before yielding the first message.

```proto
service PaymentService {
  rpc StatusSubscribe(PaymentStatusRequest) returns (stream PaymentStatusEvent) {
    option (startup_error) = "PaymentStatusError";
  }
}
```

The value must name a message type in the same proto package. The parser reads it from `method.options['(startup_error)']` and stores it as `MethodDef.startupErrorType`.

**Generated client method:**

```typescript
async statusSubscribe(
  request: PaymentStatusRequest,
  options?: CallOptions,
): Promise<Subscription<PaymentStatusEvent, PaymentStatusError>>
```

The `Subscription<T, E>` type (from `@rpc-bridge/core`) is either `{ ok: true; events: AsyncGenerator<T> }` or `{ ok: false; error: E }`. The client calls `serverStreamWithStartupError` which waits for the first frame to discriminate.

**Server handler interface:** unchanged. The handler returns `AsyncIterable<T>` and throws `StartupError<E>` before the first yield to signal a typed startup error.

**Server dispatcher:** when `json: true`, encodes the `StartupError.details` using the error type's JSON codec before the runtime sends it on the ERROR frame.

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
  --ts-out demos/proto/generated \
  --swift-out demos/host/ios/RPCBridgeDemo/generated \
  --kotlin-out demos/host/android/generated

# Generate TypeScript only
rpc-bridge-codegen \
  --proto demos/proto/hello.proto \
  --ts-out demos/proto/generated
```

### Output Files

For a proto file with package `demo.hello.v1` and service `HelloService`:

| Flag | Files Generated |
|------|----------------|
| `--ts-out <dir>` | `messages.ts`, `client.ts`, `server.ts`, `index.ts` |
| `--swift-out <dir>` | `HelloService.swift` |
| `--kotlin-out <dir>` | `HelloService.kt` |

### Using the npm Script

From the monorepo root:

```bash
npm run generate
```

This runs the codegen with the demo proto file, outputting to `demos/proto/generated/` (TypeScript), `demos/host/ios/RPCBridgeDemo/generated/` (Swift), and `demos/host/android/generated/` (Kotlin).

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

### 3. Generate Message Types

Generate message structs/classes that support JSON serialization. Examples from existing generators:

- **TypeScript**: Plain interfaces (JSON-compatible by default)
- **Swift**: `Codable` structs with `CodingKeys`
- **Kotlin**: `@Serializable` data classes with `kotlinx.serialization.json`

### 4. Generate Service Stubs

Follow the pattern:
- **Client**: Typed methods that call the RPC client with typed request/response objects.
- **Server interface**: Typed method signatures that implementors fulfill.
- **Dispatcher**: Routes incoming JSON payloads to typed handler methods.

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

All generated message types MUST produce and consume the same JSON format. This is what enables cross-language interoperability. The field names and JSON structure must exactly match across all target languages.
