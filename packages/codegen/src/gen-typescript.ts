/**
 * TypeScript code generator for the RPC bridge framework.
 *
 * Takes parsed .proto file data and produces TypeScript source code:
 *   - Message classes with protobuf-compatible encode/decode
 *   - Client stub classes that wrap RpcClient
 *   - Server handler interfaces and dispatcher registrations
 *
 * The generated code uses ProtoWriter/ProtoReader from @rpc-bridge/core
 * for binary encoding, and is fully typed for end-to-end type safety.
 *
 * This file runs at code-generation time only -- it is not imported at runtime.
 */

import type {
  ProtoFile,
  MessageDef,
  FieldDef,
  EnumDef,
  ServiceDef,
  MethodDef,
} from './parser.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert PascalCase method name to camelCase. */
function toCamelCase(name: string): string {
  if (name.length === 0) return name;
  return name[0].toLowerCase() + name.slice(1);
}

/** Convert snake_case field name to camelCase. */
function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}

// ---------------------------------------------------------------------------
// Proto-type -> TypeScript-type mapping
// ---------------------------------------------------------------------------

/**
 * Protobuf wire types used for encoding.
 *   0 = varint (uint32, uint64, int32, int64, sint32, sint64, bool, enum)
 *   1 = 64-bit fixed (double, fixed64, sfixed64)
 *   2 = length-delimited (string, bytes, embedded messages)
 *   5 = 32-bit fixed (float, fixed32, sfixed32)
 */

interface TypeMapping {
  tsType: string;
  wireType: number;
  /** The original protobuf type name (needed for correct encode/decode method selection). */
  protoType: string;
  /** true when the type is a user-defined message (needs recursive encode/decode) */
  isMessage: boolean;
  /** true when the type is an enum (encoded as varint, represented as number) */
  isEnum: boolean;
}

function resolveType(
  protoType: string,
  knownMessages: Set<string>,
  knownEnums: Set<string>,
): TypeMapping {
  switch (protoType) {
    case 'string':
      return { tsType: 'string', wireType: 2, protoType, isMessage: false, isEnum: false };
    case 'bytes':
      return { tsType: 'Uint8Array', wireType: 2, protoType, isMessage: false, isEnum: false };
    case 'bool':
      return { tsType: 'boolean', wireType: 0, protoType, isMessage: false, isEnum: false };
    case 'uint32':
    case 'int32':
      return { tsType: 'number', wireType: 0, protoType, isMessage: false, isEnum: false };
    case 'sint32':
    case 'sint64':
      return { tsType: 'number', wireType: 0, protoType, isMessage: false, isEnum: false };
    case 'uint64':
    case 'int64':
      return { tsType: 'number', wireType: 0, protoType, isMessage: false, isEnum: false };
    case 'fixed32':
    case 'sfixed32':
      return { tsType: 'number', wireType: 5, protoType, isMessage: false, isEnum: false };
    case 'fixed64':
    case 'sfixed64':
      return { tsType: 'number', wireType: 1, protoType, isMessage: false, isEnum: false };
    case 'float':
      return { tsType: 'number', wireType: 5, protoType, isMessage: false, isEnum: false };
    case 'double':
      return { tsType: 'number', wireType: 1, protoType, isMessage: false, isEnum: false };
    default:
      // User-defined enum or message
      if (knownEnums.has(protoType)) {
        return { tsType: protoType, wireType: 0, protoType, isMessage: false, isEnum: true };
      }
      // Assume it is a message type (length-delimited)
      return { tsType: protoType, wireType: 2, protoType, isMessage: true, isEnum: false };
  }
}

/** Determine the MethodType enum variant for a given MethodDef. */
function methodTypeEnum(m: MethodDef): string {
  if (!m.clientStreaming && !m.serverStreaming) return 'MethodType.UNARY';
  if (!m.clientStreaming && m.serverStreaming) return 'MethodType.SERVER_STREAMING';
  if (m.clientStreaming && !m.serverStreaming) return 'MethodType.CLIENT_STREAMING';
  return 'MethodType.BIDI_STREAMING';
}

/** Build the fully-qualified RPC method path: "package.ServiceName/MethodName". */
function fullMethodPath(pkg: string, serviceName: string, methodName: string): string {
  const prefix = pkg ? `${pkg}.${serviceName}` : serviceName;
  return `${prefix}/${methodName}`;
}

// ---------------------------------------------------------------------------
// generateMessages
// ---------------------------------------------------------------------------

/**
 * Generate TypeScript message classes with static `encode` and `decode`
 * methods, plus enum declarations.
 *
 * Encoding follows protobuf binary wire format using ProtoWriter/ProtoReader
 * from `@rpc-bridge/core`.
 */
export function generateMessages(proto: ProtoFile): string {
  const knownMessages = new Set(proto.messages.map((m) => m.name));
  const knownEnums = new Set(proto.enums.map((e) => e.name));

  const lines: string[] = [];

  lines.push('// -----------------------------------------------------------------');
  lines.push('// Auto-generated by @rpc-bridge/codegen -- DO NOT EDIT');
  lines.push('// -----------------------------------------------------------------');
  lines.push('');
  lines.push("import { ProtoWriter, ProtoReader } from '@rpc-bridge/core';");
  lines.push('');

  // --- Enums ---
  for (const enumDef of proto.enums) {
    lines.push(generateEnumCode(enumDef));
    lines.push('');
  }

  // --- Messages ---
  for (const msg of proto.messages) {
    lines.push(generateMessageClass(msg, knownMessages, knownEnums));
    lines.push('');
  }

  return lines.join('\n');
}

function generateEnumCode(enumDef: EnumDef): string {
  const lines: string[] = [];
  lines.push(`/** Enum: ${enumDef.name} */`);
  lines.push(`export enum ${enumDef.name} {`);
  for (const v of enumDef.values) {
    lines.push(`  ${v.name} = ${v.number},`);
  }
  lines.push('}');
  return lines.join('\n');
}

function generateMessageClass(
  msg: MessageDef,
  knownMessages: Set<string>,
  knownEnums: Set<string>,
): string {
  const lines: string[] = [];
  const fields = msg.fields.filter((f) => !f.deprecated);

  // --- Interface for the plain-object shape ---
  lines.push(`/** Message: ${msg.name} */`);
  lines.push(`export interface I${msg.name} {`);
  for (const f of fields) {
    const tm = resolveType(f.type, knownMessages, knownEnums);
    const tsType = f.repeated ? `${tm.tsType}[]` : tm.tsType;
    const opt = f.optional ? '?' : '';
    lines.push(`  ${snakeToCamel(f.name)}${opt}: ${tsType};`);
  }
  lines.push('}');
  lines.push('');

  // --- Class with encode / decode ---
  lines.push(`export class ${msg.name} implements I${msg.name} {`);

  // Fields with defaults
  for (const f of fields) {
    const tm = resolveType(f.type, knownMessages, knownEnums);
    const camel = snakeToCamel(f.name);
    const defaultVal = fieldDefault(f, tm);
    if (f.optional) {
      lines.push(`  ${camel}?: ${f.repeated ? `${tm.tsType}[]` : tm.tsType};`);
    } else {
      const tsType = f.repeated ? `${tm.tsType}[]` : tm.tsType;
      lines.push(`  ${camel}: ${tsType} = ${defaultVal};`);
    }
  }
  lines.push('');

  // Constructor from partial
  lines.push(`  constructor(init?: Partial<I${msg.name}>) {`);
  lines.push('    if (init) {');
  lines.push('      Object.assign(this, init);');
  lines.push('    }');
  lines.push('  }');
  lines.push('');

  // --- encode ---
  lines.push('  /** Encode this message to protobuf binary format. */');
  lines.push('  static encode(msg: I' + msg.name + '): Uint8Array {');
  lines.push('    const w = new ProtoWriter();');
  for (const f of fields) {
    const tm = resolveType(f.type, knownMessages, knownEnums);
    const camel = snakeToCamel(f.name);
    if (f.repeated) {
      lines.push(generateRepeatedEncodeBlock(f, tm, camel));
    } else if (f.optional) {
      lines.push(`    if (msg.${camel} !== undefined && msg.${camel} !== null) {`);
      lines.push('  ' + generateSingleEncodeStatement(f, tm, camel));
      lines.push('    }');
    } else {
      // Proto3 zero-value elision: skip encoding when value equals the default
      const guard = proto3ZeroGuard(f, tm, camel);
      if (guard) {
        lines.push(`    if (${guard}) {`);
        lines.push('  ' + generateSingleEncodeStatement(f, tm, camel));
        lines.push('    }');
      } else {
        lines.push(generateSingleEncodeStatement(f, tm, camel));
      }
    }
  }
  lines.push('    return w.finish();');
  lines.push('  }');
  lines.push('');

  // --- decode ---
  lines.push('  /** Decode a ' + msg.name + ' from protobuf binary format. */');
  lines.push('  static decode(data: Uint8Array): ' + msg.name + ' {');
  lines.push('    const r = new ProtoReader(data);');
  lines.push(`    const msg = new ${msg.name}();`);
  lines.push('    while (r.hasMore()) {');
  lines.push('      const tag = r.readTag();');
  lines.push('      const fieldNumber = tag >>> 3;');
  lines.push('      const wireType = tag & 0x7;');
  lines.push('      switch (fieldNumber) {');
  for (const f of fields) {
    const tm = resolveType(f.type, knownMessages, knownEnums);
    const camel = snakeToCamel(f.name);
    lines.push(`        case ${f.number}: {`);
    lines.push(generateDecodeFieldBody(f, tm, camel));
    lines.push('          break;');
    lines.push('        }');
  }
  lines.push('        default:');
  lines.push('          r.skipField(wireType);');
  lines.push('          break;');
  lines.push('      }');
  lines.push('    }');
  lines.push('    return msg;');
  lines.push('  }');

  lines.push('}');

  return lines.join('\n');
}

// --- Encode helpers ---

function generateSingleEncodeStatement(
  f: FieldDef,
  tm: TypeMapping,
  camel: string,
): string {
  if (tm.isMessage) {
    return `    w.writeBytesField(${f.number}, ${tm.tsType}.encode(msg.${camel}));`;
  }
  if (tm.isEnum) {
    return `    w.writeVarintField(${f.number}, msg.${camel} as number);`;
  }
  switch (tm.protoType) {
    case 'string':
      return `    w.writeStringField(${f.number}, msg.${camel});`;
    case 'bytes':
      return `    w.writeBytesField(${f.number}, msg.${camel});`;
    case 'bool':
      return `    w.writeVarintField(${f.number}, msg.${camel} ? 1 : 0);`;
    case 'float':
    case 'fixed32':
    case 'sfixed32':
      return `    w.writeFixed32Field(${f.number}, msg.${camel});`;
    case 'double':
    case 'fixed64':
    case 'sfixed64':
      return `    w.writeFixed64Field(${f.number}, msg.${camel});`;
    case 'sint32':
      return `    w.writeSint32Field(${f.number}, msg.${camel});`;
    case 'sint64':
      return `    w.writeSint64Field(${f.number}, msg.${camel});`;
    case 'uint32':
    case 'int32':
    case 'uint64':
    case 'int64':
      return `    w.writeVarintField(${f.number}, msg.${camel});`;
    default:
      return `    w.writeBytesField(${f.number}, ${tm.tsType}.encode(msg.${camel}));`;
  }
}

function generateRepeatedEncodeBlock(
  f: FieldDef,
  tm: TypeMapping,
  camel: string,
): string {
  const lines: string[] = [];
  lines.push(`    for (const item of msg.${camel}) {`);
  if (tm.isMessage) {
    lines.push(`      w.writeBytesField(${f.number}, ${tm.tsType}.encode(item));`);
  } else if (tm.isEnum) {
    lines.push(`      w.writeVarintField(${f.number}, item as number);`);
  } else {
    switch (tm.protoType) {
      case 'string':
        lines.push(`      w.writeStringField(${f.number}, item);`);
        break;
      case 'bytes':
        lines.push(`      w.writeBytesField(${f.number}, item);`);
        break;
      case 'bool':
        lines.push(`      w.writeVarintField(${f.number}, item ? 1 : 0);`);
        break;
      case 'float':
      case 'fixed32':
      case 'sfixed32':
        lines.push(`      w.writeFixed32Field(${f.number}, item);`);
        break;
      case 'double':
      case 'fixed64':
      case 'sfixed64':
        lines.push(`      w.writeFixed64Field(${f.number}, item);`);
        break;
      case 'sint32':
        lines.push(`      w.writeSint32Field(${f.number}, item);`);
        break;
      case 'sint64':
        lines.push(`      w.writeSint64Field(${f.number}, item);`);
        break;
      case 'uint32':
      case 'int32':
      case 'uint64':
      case 'int64':
        lines.push(`      w.writeVarintField(${f.number}, item);`);
        break;
      default:
        lines.push(`      w.writeBytesField(${f.number}, ${tm.tsType}.encode(item));`);
        break;
    }
  }
  lines.push('    }');
  return lines.join('\n');
}

// --- Decode helpers ---

function generateDecodeFieldBody(
  f: FieldDef,
  tm: TypeMapping,
  camel: string,
): string {
  const readExpr = generateReadExpression(tm);
  if (f.repeated) {
    return `          msg.${camel}.push(${readExpr});`;
  }
  return `          msg.${camel} = ${readExpr};`;
}

function generateReadExpression(tm: TypeMapping): string {
  if (tm.isMessage) {
    return `${tm.tsType}.decode(r.readBytes())`;
  }
  if (tm.isEnum) {
    return `r.readVarint() as ${tm.tsType}`;
  }
  switch (tm.protoType) {
    case 'string':
      return 'r.readString()';
    case 'bytes':
      return 'r.readBytes()';
    case 'bool':
      return 'r.readVarint() !== 0';
    case 'float':
      return 'r.readFloat()';
    case 'double':
      return 'r.readDouble()';
    case 'fixed32':
      return 'r.readFixed32()';
    case 'sfixed32':
      return 'r.readSfixed32()';
    case 'fixed64':
      return 'r.readFixed64()';
    case 'sfixed64':
      return 'r.readSfixed64()';
    case 'sint32':
      return 'r.readSint32()';
    case 'sint64':
      return 'r.readSint64()';
    case 'uint32':
    case 'int32':
    case 'uint64':
    case 'int64':
      return 'r.readVarint()';
    default:
      return `${tm.tsType}.decode(r.readBytes())`;
  }
}

function fieldDefault(f: FieldDef, tm: TypeMapping): string {
  if (f.repeated) return '[]';
  if (tm.isMessage) return `new ${tm.tsType}()`;
  if (tm.isEnum) return '0';
  switch (tm.tsType) {
    case 'string':
      return "''";
    case 'number':
      return '0';
    case 'boolean':
      return 'false';
    case 'Uint8Array':
      return 'new Uint8Array(0)';
    default:
      return `new ${tm.tsType}()`;
  }
}

/**
 * Return a JS condition expression that is truthy when the field is NOT the
 * proto3 default value, or `null` for message types that are always encoded.
 */
function proto3ZeroGuard(f: FieldDef, tm: TypeMapping, camel: string): string | null {
  if (tm.isMessage) return null; // messages are always encoded
  if (tm.isEnum) return `msg.${camel} !== 0`;
  switch (tm.protoType) {
    case 'string':
      return `msg.${camel} !== ''`;
    case 'bytes':
      return `msg.${camel}.length !== 0`;
    case 'bool':
      return `msg.${camel}`;
    case 'uint32':
    case 'int32':
    case 'sint32':
    case 'fixed32':
    case 'sfixed32':
    case 'uint64':
    case 'int64':
    case 'sint64':
    case 'fixed64':
    case 'sfixed64':
    case 'float':
    case 'double':
      return `msg.${camel} !== 0`;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// generateClient
// ---------------------------------------------------------------------------

/**
 * Generate typed client stub classes that delegate to RpcClient methods.
 *
 * Each service produces a `<ServiceName>Client` class. The constructor
 * takes an `RpcClient` instance and an optional service path override.
 */
export function generateClient(proto: ProtoFile): string {
  const lines: string[] = [];

  lines.push('// -----------------------------------------------------------------');
  lines.push('// Auto-generated by @rpc-bridge/codegen -- DO NOT EDIT');
  lines.push('// -----------------------------------------------------------------');
  lines.push('');
  lines.push("import { RpcClient, type CallOptions } from '@rpc-bridge/core';");

  // Import all message/enum types used by services
  const messageTypes = collectServiceTypes(proto);
  if (messageTypes.size > 0) {
    lines.push(`import { ${[...messageTypes].sort().join(', ')} } from './messages.js';`);
  }
  lines.push('');

  for (const svc of proto.services) {
    lines.push(generateClientClass(proto.package, svc));
    lines.push('');
  }

  return lines.join('\n');
}

function generateClientClass(pkg: string, svc: ServiceDef): string {
  const className = `${svc.name}Client`;
  const servicePath = pkg ? `${pkg}.${svc.name}` : svc.name;

  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Client stub for ${svc.name}.`);
  lines.push(` *`);
  lines.push(` * Wraps RpcClient to provide typed methods for each RPC.`);
  lines.push(` * All encoding/decoding is handled automatically.`);
  lines.push(` */`);
  lines.push(`export class ${className} {`);
  lines.push(`  private readonly client: RpcClient;`);
  lines.push(`  private readonly service: string;`);
  lines.push('');
  lines.push(`  constructor(client: RpcClient, service?: string) {`);
  lines.push(`    this.client = client;`);
  lines.push(`    this.service = service ?? '${servicePath}';`);
  lines.push('  }');

  for (const m of svc.methods) {
    lines.push('');
    lines.push(generateClientMethod(m));
  }

  lines.push('}');

  return lines.join('\n');
}

function generateClientMethod(m: MethodDef): string {
  const tsName = toCamelCase(m.name);
  const reqType = m.inputType;
  const respType = m.outputType;
  const methodPath = `\${this.service}/${m.name}`;

  const lines: string[] = [];

  if (!m.clientStreaming && !m.serverStreaming) {
    // --- Unary ---
    lines.push(`  /** Unary RPC: ${m.name} */`);
    lines.push(`  async ${tsName}(request: ${reqType}, options?: CallOptions): Promise<${respType}> {`);
    lines.push(`    const requestBytes = ${reqType}.encode(request);`);
    lines.push('    const result = await this.client.unary(');
    lines.push(`      \`${methodPath}\`,`);
    lines.push('      requestBytes,');
    lines.push('      options,');
    lines.push('    );');
    lines.push(`    return ${respType}.decode(result.data);`);
    lines.push('  }');
  } else if (!m.clientStreaming && m.serverStreaming) {
    // --- Server streaming ---
    lines.push(`  /** Server-streaming RPC: ${m.name} */`);
    lines.push(`  async *${tsName}(request: ${reqType}, options?: CallOptions): AsyncGenerator<${respType}, void, undefined> {`);
    lines.push(`    const requestBytes = ${reqType}.encode(request);`);
    lines.push(`    const stream = this.client.serverStream(`);
    lines.push(`      \`${methodPath}\`,`);
    lines.push('      requestBytes,');
    lines.push('      options,');
    lines.push('    );');
    lines.push(`    for await (const chunk of stream) {`);
    lines.push(`      yield ${respType}.decode(chunk);`);
    lines.push('    }');
    lines.push('  }');
  } else if (m.clientStreaming && !m.serverStreaming) {
    // --- Client streaming ---
    lines.push(`  /** Client-streaming RPC: ${m.name} */`);
    lines.push(`  async ${tsName}(requests: AsyncIterable<${reqType}>, options?: CallOptions): Promise<${respType}> {`);
    lines.push('    // Encode each request message lazily');
    lines.push(`    const encoded = (async function* () {`);
    lines.push('      for await (const req of requests) {');
    lines.push(`        yield ${reqType}.encode(req);`);
    lines.push('      }');
    lines.push('    })();');
    lines.push('    const result = await this.client.clientStream(');
    lines.push(`      \`${methodPath}\`,`);
    lines.push('      encoded,');
    lines.push('      options,');
    lines.push('    );');
    lines.push(`    return ${respType}.decode(result.data);`);
    lines.push('  }');
  } else {
    // --- Bidi streaming ---
    lines.push(`  /** Bidirectional-streaming RPC: ${m.name} */`);
    lines.push(`  async *${tsName}(requests: AsyncIterable<${reqType}>, options?: CallOptions): AsyncGenerator<${respType}, void, undefined> {`);
    lines.push('    // Encode each request message lazily');
    lines.push(`    const encoded = (async function* () {`);
    lines.push('      for await (const req of requests) {');
    lines.push(`        yield ${reqType}.encode(req);`);
    lines.push('      }');
    lines.push('    })();');
    lines.push(`    const stream = this.client.bidiStream(`);
    lines.push(`      \`${methodPath}\`,`);
    lines.push('      encoded,');
    lines.push('      options,');
    lines.push('    );');
    lines.push('    for await (const chunk of stream) {');
    lines.push(`      yield ${respType}.decode(chunk);`);
    lines.push('    }');
    lines.push('  }');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// generateServer
// ---------------------------------------------------------------------------

/**
 * Generate server-side handler interfaces and dispatcher factory functions.
 *
 * Each service produces:
 *   - `I<ServiceName>Handler` interface with typed handler methods
 *   - `register<ServiceName>(handler)` function returning `ServiceRegistration`
 */
export function generateServer(proto: ProtoFile): string {
  const lines: string[] = [];

  lines.push('// -----------------------------------------------------------------');
  lines.push('// Auto-generated by @rpc-bridge/codegen -- DO NOT EDIT');
  lines.push('// -----------------------------------------------------------------');
  lines.push('');
  lines.push('import {');
  lines.push('  MethodType,');
  lines.push('  type CallContext,');
  lines.push('  type ServiceRegistration,');
  lines.push('  type MethodHandler,');
  lines.push("} from '@rpc-bridge/core';");

  // Import all message/enum types used by services
  const messageTypes = collectServiceTypes(proto);
  if (messageTypes.size > 0) {
    lines.push(`import { ${[...messageTypes].sort().join(', ')} } from './messages.js';`);
  }
  lines.push('');

  for (const svc of proto.services) {
    lines.push(generateServerInterface(svc));
    lines.push('');
    lines.push(generateServerDispatcher(proto.package, svc));
    lines.push('');
  }

  return lines.join('\n');
}

function generateServerInterface(svc: ServiceDef): string {
  const iface = `I${svc.name}Handler`;
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Server-side handler interface for ${svc.name}.`);
  lines.push(` *`);
  lines.push(` * Implement this interface to handle RPCs for this service.`);
  lines.push(` * All methods receive decoded typed messages and return typed responses.`);
  lines.push(` */`);
  lines.push(`export interface ${iface} {`);

  for (const m of svc.methods) {
    const tsName = toCamelCase(m.name);
    const reqType = m.inputType;
    const respType = m.outputType;

    if (!m.clientStreaming && !m.serverStreaming) {
      lines.push(`  /** Unary: ${m.name} */`);
      lines.push(`  ${tsName}(request: ${reqType}, context: CallContext): Promise<${respType}>;`);
    } else if (!m.clientStreaming && m.serverStreaming) {
      lines.push(`  /** Server-streaming: ${m.name} */`);
      lines.push(`  ${tsName}(request: ${reqType}, context: CallContext): AsyncIterable<${respType}>;`);
    } else if (m.clientStreaming && !m.serverStreaming) {
      lines.push(`  /** Client-streaming: ${m.name} */`);
      lines.push(`  ${tsName}(requests: AsyncIterable<${reqType}>, context: CallContext): Promise<${respType}>;`);
    } else {
      lines.push(`  /** Bidi-streaming: ${m.name} */`);
      lines.push(`  ${tsName}(requests: AsyncIterable<${reqType}>, context: CallContext): AsyncIterable<${respType}>;`);
    }
  }

  lines.push('}');

  return lines.join('\n');
}

function generateServerDispatcher(pkg: string, svc: ServiceDef): string {
  const iface = `I${svc.name}Handler`;
  const servicePath = pkg ? `${pkg}.${svc.name}` : svc.name;
  const fnName = `register${svc.name}`;

  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Create a ServiceRegistration for ${svc.name}.`);
  lines.push(` *`);
  lines.push(` * The returned registration decodes incoming request bytes,`);
  lines.push(` * delegates to the typed handler, and encodes response bytes.`);
  lines.push(` * Pass the result to \`RpcServer.registerService()\`.`);
  lines.push(` */`);
  lines.push(`export function ${fnName}(handler: ${iface}): ServiceRegistration {`);
  lines.push(`  const methods: Record<string, MethodHandler> = {};`);
  lines.push('');

  for (const m of svc.methods) {
    const tsName = toCamelCase(m.name);
    const reqType = m.inputType;
    const respType = m.outputType;
    const methodTypeStr = methodTypeEnum(m);

    lines.push(`  // ${m.name}`);

    if (!m.clientStreaming && !m.serverStreaming) {
      // --- Unary ---
      lines.push(`  methods['${m.name}'] = {`);
      lines.push(`    type: ${methodTypeStr},`);
      lines.push('    handler: async (requestBytes: Uint8Array, context: CallContext): Promise<Uint8Array> => {');
      lines.push(`      const request = ${reqType}.decode(requestBytes);`);
      lines.push(`      const response = await handler.${tsName}(request, context);`);
      lines.push(`      return ${respType}.encode(response);`);
      lines.push('    },');
      lines.push('  };');
    } else if (!m.clientStreaming && m.serverStreaming) {
      // --- Server streaming ---
      lines.push(`  methods['${m.name}'] = {`);
      lines.push(`    type: ${methodTypeStr},`);
      lines.push('    handler: (requestBytes: Uint8Array, context: CallContext): AsyncIterable<Uint8Array> => {');
      lines.push(`      const request = ${reqType}.decode(requestBytes);`);
      lines.push(`      const responses = handler.${tsName}(request, context);`);
      lines.push('      return (async function* () {');
      lines.push('        for await (const resp of responses) {');
      lines.push(`          yield ${respType}.encode(resp);`);
      lines.push('        }');
      lines.push('      })();');
      lines.push('    },');
      lines.push('  };');
    } else if (m.clientStreaming && !m.serverStreaming) {
      // --- Client streaming ---
      lines.push(`  methods['${m.name}'] = {`);
      lines.push(`    type: ${methodTypeStr},`);
      lines.push('    handler: async (requests: AsyncIterable<Uint8Array>, context: CallContext): Promise<Uint8Array> => {');
      lines.push('      // Decode each incoming request message');
      lines.push('      const decoded = (async function* () {');
      lines.push('        for await (const bytes of requests) {');
      lines.push(`          yield ${reqType}.decode(bytes);`);
      lines.push('        }');
      lines.push('      })();');
      lines.push(`      const response = await handler.${tsName}(decoded, context);`);
      lines.push(`      return ${respType}.encode(response);`);
      lines.push('    },');
      lines.push('  };');
    } else {
      // --- Bidi streaming ---
      lines.push(`  methods['${m.name}'] = {`);
      lines.push(`    type: ${methodTypeStr},`);
      lines.push('    handler: (requests: AsyncIterable<Uint8Array>, context: CallContext): AsyncIterable<Uint8Array> => {');
      lines.push('      // Decode each incoming request message');
      lines.push('      const decoded = (async function* () {');
      lines.push('        for await (const bytes of requests) {');
      lines.push(`          yield ${reqType}.decode(bytes);`);
      lines.push('        }');
      lines.push('      })();');
      lines.push(`      const responses = handler.${tsName}(decoded, context);`);
      lines.push('      return (async function* () {');
      lines.push('        for await (const resp of responses) {');
      lines.push(`          yield ${respType}.encode(resp);`);
      lines.push('        }');
      lines.push('      })();');
      lines.push('    },');
      lines.push('  };');
    }

    lines.push('');
  }

  lines.push('  return {');
  lines.push(`    name: '${servicePath}',`);
  lines.push('    methods,');
  lines.push('  };');
  lines.push('}');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Collect all message/enum type names referenced by services
 * (as input or output types) for import generation.
 */
function collectServiceTypes(proto: ProtoFile): Set<string> {
  const types = new Set<string>();
  for (const svc of proto.services) {
    for (const m of svc.methods) {
      types.add(m.inputType);
      types.add(m.outputType);
    }
  }
  return types;
}
