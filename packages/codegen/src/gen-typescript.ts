/**
 * TypeScript code generator for the RPC bridge framework.
 *
 * Takes parsed .proto file data and produces TypeScript source code:
 *   - Message interfaces + standalone JSON codec objects
 *   - Client stub classes that wrap RpcClient (with optional JSON mode)
 *   - Server handler interfaces and dispatcher registrations (with optional JSON mode)
 *
 * Proto files define the contract; no protobuf binary runtime is used.
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
  _knownMessages: Set<string>,
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
      return { tsType: 'number', wireType: 0, protoType, isMessage: false, isEnum: false };
    case 'sint64':
      return { tsType: 'bigint', wireType: 0, protoType, isMessage: false, isEnum: false };
    case 'uint64':
    case 'int64':
      return { tsType: 'bigint', wireType: 0, protoType, isMessage: false, isEnum: false };
    case 'fixed32':
    case 'sfixed32':
      return { tsType: 'number', wireType: 5, protoType, isMessage: false, isEnum: false };
    case 'fixed64':
    case 'sfixed64':
      return { tsType: 'bigint', wireType: 1, protoType, isMessage: false, isEnum: false };
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

/** Set of proto types that map to TypeScript bigint. */
const BIGINT_PROTO_TYPES = new Set([
  'uint64', 'int64', 'sint64', 'fixed64', 'sfixed64',
]);

/** Determine the MethodType enum variant for a given MethodDef. */
function methodTypeEnum(m: MethodDef): string {
  if (!m.clientStreaming && !m.serverStreaming) return 'MethodType.UNARY';
  if (!m.clientStreaming && m.serverStreaming) return 'MethodType.SERVER_STREAMING';
  if (m.clientStreaming && !m.serverStreaming) return 'MethodType.CLIENT_STREAMING';
  return 'MethodType.BIDI_STREAMING';
}


// ---------------------------------------------------------------------------
// generateMessages
// ---------------------------------------------------------------------------

/**
 * Generate TypeScript message interfaces + standalone JSON codec objects,
 * plus enum declarations.
 *
 * Each message produces:
 *   - An interface with all required fields (the plain-object shape)
 *   - A `<Name>JSON` codec object with `encode(msg) -> Record` and `decode(o) -> T` methods
 *     for cross-platform JSON serialization (proto3 JSON mapping)
 *   - A `create<Name>(init?)` factory that returns a default-valued instance
 */
export function generateMessages(proto: ProtoFile): string {
  const knownMessages = new Set(proto.messages.map((m) => m.name));
  const knownEnums = new Set(proto.enums.map((e) => e.name));

  const lines: string[] = [];

  lines.push('// -----------------------------------------------------------------');
  lines.push('// Auto-generated by @rpc-bridge/codegen -- DO NOT EDIT');
  lines.push('// -----------------------------------------------------------------');
  lines.push('');

  // --- Base64 helpers (for JSON serialization of bytes fields) ---
  const hasBytes = proto.messages.some((m) =>
    m.fields.some((f) => !f.deprecated && f.type === 'bytes'),
  );
  if (hasBytes) {
    lines.push('// Base64 helpers for bytes field JSON serialization');
    lines.push("function _toBase64(bytes: Uint8Array): string {");
    lines.push("  let binary = '';");
    lines.push("  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);");
    lines.push("  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');");
    lines.push('}');
    lines.push('');
    lines.push('function _fromBase64(str: string): Uint8Array {');
    lines.push("  if (typeof atob === 'function') {");
    lines.push('    const binary = atob(str);');
    lines.push('    const bytes = new Uint8Array(binary.length);');
    lines.push('    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);');
    lines.push('    return bytes;');
    lines.push('  }');
    lines.push("  return new Uint8Array(Buffer.from(str, 'base64'));");
    lines.push('}');
    lines.push('');
  }

  // --- Enums ---
  for (const enumDef of proto.enums) {
    lines.push(generateEnumCode(enumDef));
    lines.push('');
  }

  // --- Messages ---
  for (const msg of proto.messages) {
    lines.push(generateMessageCode(msg, knownMessages, knownEnums));
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

function generateMessageCode(
  msg: MessageDef,
  knownMessages: Set<string>,
  knownEnums: Set<string>,
): string {
  const lines: string[] = [];
  const fields = msg.fields.filter((f) => !f.deprecated);

  // --- Interface ---
  lines.push(`/** Message: ${msg.name} */`);
  lines.push(`export interface ${msg.name} {`);
  for (const f of fields) {
    const tm = resolveType(f.type, knownMessages, knownEnums);
    const tsType = f.repeated ? `${tm.tsType}[]` : tm.tsType;
    const opt = f.optional ? '?' : '';
    lines.push(`  ${snakeToCamel(f.name)}${opt}: ${tsType};`);
  }
  lines.push('}');
  lines.push('');

  // --- Factory function ---
  lines.push(`export function create${msg.name}(init?: Partial<${msg.name}>): ${msg.name} {`);
  lines.push('  return {');
  for (const f of fields) {
    const tm = resolveType(f.type, knownMessages, knownEnums);
    const camel = snakeToCamel(f.name);
    if (!f.optional) {
      lines.push(`    ${camel}: ${fieldDefault(f, tm)},`);
    }
  }
  lines.push('    ...init,');
  lines.push('  };');
  lines.push('}');
  lines.push('');

  // --- JSON codec (always generated so client/server can import it) ---
  lines.push(`/** JSON codec for ${msg.name} (proto3 JSON mapping). */`);
  lines.push(`export const ${msg.name}JSON = {`);

  // encode
  lines.push(`  encode(msg: ${msg.name}): Record<string, unknown> {`);
  lines.push('    const o: Record<string, unknown> = {};');
  for (const f of fields) {
    const tm = resolveType(f.type, knownMessages, knownEnums);
    const camel = snakeToCamel(f.name);
    lines.push(generateToJsonField(f, tm, camel));
  }
  lines.push('    return o;');
  lines.push('  },');

  // decode
  lines.push(`  decode(o: Record<string, unknown>): ${msg.name} {`);
  lines.push(`    const msg = create${msg.name}();`);
  for (const f of fields) {
    const tm = resolveType(f.type, knownMessages, knownEnums);
    const camel = snakeToCamel(f.name);
    lines.push(generateFromJsonField(f, tm, camel));
  }
  lines.push('    return msg;');
  lines.push('  },');

  lines.push('};');

  return lines.join('\n');
}

// --- JSON helpers ---

function generateToJsonField(f: FieldDef, tm: TypeMapping, camel: string): string {
  const lines: string[] = [];
  const isBigInt = BIGINT_PROTO_TYPES.has(tm.protoType);
  const isBytes = tm.protoType === 'bytes';

  if (f.repeated) {
    lines.push(`    if (msg.${camel}.length !== 0) {`);
    if (tm.isMessage) {
      lines.push(`      o.${camel} = msg.${camel}.map(v => ${tm.tsType}JSON.encode(v));`);
    } else if (isBigInt) {
      lines.push(`      o.${camel} = msg.${camel}.map(v => v.toString());`);
    } else if (isBytes) {
      lines.push(`      o.${camel} = msg.${camel}.map(v => _toBase64(v));`);
    } else if (tm.isEnum) {
      lines.push(`      o.${camel} = msg.${camel}.map(v => v as number);`);
    } else {
      lines.push(`      o.${camel} = msg.${camel};`);
    }
    lines.push('    }');
  } else if (f.optional) {
    lines.push(`    if (msg.${camel} !== undefined && msg.${camel} !== null) {`);
    if (tm.isMessage) {
      lines.push(`      o.${camel} = ${tm.tsType}JSON.encode(msg.${camel});`);
    } else if (isBigInt) {
      lines.push(`      o.${camel} = msg.${camel}.toString();`);
    } else if (isBytes) {
      lines.push(`      o.${camel} = _toBase64(msg.${camel});`);
    } else if (tm.isEnum) {
      lines.push(`      o.${camel} = msg.${camel} as number;`);
    } else {
      lines.push(`      o.${camel} = msg.${camel};`);
    }
    lines.push('    }');
  } else {
    // non-optional, non-repeated: skip default values
    const guard = proto3ZeroGuard(f, tm, camel);
    if (tm.isMessage) {
      // Always emit message fields
      lines.push(`    o.${camel} = ${tm.tsType}JSON.encode(msg.${camel});`);
    } else if (guard) {
      lines.push(`    if (${guard}) {`);
      if (isBigInt) {
        lines.push(`      o.${camel} = msg.${camel}.toString();`);
      } else if (isBytes) {
        lines.push(`      o.${camel} = _toBase64(msg.${camel});`);
      } else if (tm.isEnum) {
        lines.push(`      o.${camel} = msg.${camel} as number;`);
      } else {
        lines.push(`      o.${camel} = msg.${camel};`);
      }
      lines.push('    }');
    } else {
      lines.push(`    o.${camel} = msg.${camel};`);
    }
  }
  return lines.join('\n');
}

function generateFromJsonField(f: FieldDef, tm: TypeMapping, camel: string): string {
  const lines: string[] = [];
  const isBigInt = BIGINT_PROTO_TYPES.has(tm.protoType);
  const isBytes = tm.protoType === 'bytes';

  if (f.repeated) {
    lines.push(`    if (Array.isArray(o.${camel})) {`);
    if (tm.isMessage) {
      lines.push(`      msg.${camel} = (o.${camel} as Record<string, unknown>[]).map(v => ${tm.tsType}JSON.decode(v));`);
    } else if (isBigInt) {
      lines.push(`      msg.${camel} = (o.${camel} as unknown[]).map(v => {`);
      lines.push(`        if (typeof v === 'string') return BigInt(v);`);
      lines.push(`        if (typeof v === 'number') return BigInt(v);`);
      lines.push(`        if (typeof v === 'bigint') return v;`);
      lines.push(`        return 0n;`);
      lines.push(`      });`);
    } else if (isBytes) {
      lines.push(`      msg.${camel} = (o.${camel} as string[]).map(v => _fromBase64(v));`);
    } else if (tm.isEnum) {
      lines.push(`      msg.${camel} = (o.${camel} as number[]).map(v => v as ${tm.tsType});`);
    } else {
      lines.push(`      msg.${camel} = o.${camel} as ${tm.tsType}[];`);
    }
    lines.push('    }');
  } else if (tm.isMessage) {
    lines.push(`    if (o.${camel} != null) msg.${camel} = ${tm.tsType}JSON.decode(o.${camel} as Record<string, unknown>);`);
  } else if (isBigInt) {
    lines.push(`    { const v = o.${camel}; if (typeof v === 'string') msg.${camel} = BigInt(v); else if (typeof v === 'number') msg.${camel} = BigInt(v); else if (typeof v === 'bigint') msg.${camel} = v; }`);
  } else if (isBytes) {
    lines.push(`    if (typeof o.${camel} === 'string') msg.${camel} = _fromBase64(o.${camel} as string);`);
  } else if (tm.isEnum) {
    lines.push(`    if (typeof o.${camel} === 'number') msg.${camel} = o.${camel} as ${tm.tsType};`);
  } else if (tm.tsType === 'boolean') {
    lines.push(`    if (typeof o.${camel} === 'boolean') msg.${camel} = o.${camel} as boolean;`);
  } else if (tm.tsType === 'number') {
    lines.push(`    if (typeof o.${camel} === 'number') msg.${camel} = o.${camel} as number;`);
  } else if (tm.tsType === 'string') {
    lines.push(`    if (typeof o.${camel} === 'string') msg.${camel} = o.${camel} as string;`);
  } else {
    lines.push(`    if (o.${camel} != null) msg.${camel} = o.${camel} as ${tm.tsType};`);
  }
  return lines.join('\n');
}

function fieldDefault(f: FieldDef, tm: TypeMapping): string {
  if (f.repeated) return '[]';
  if (tm.isMessage) return `create${tm.tsType}()`;
  if (tm.isEnum) return '0';
  switch (tm.tsType) {
    case 'string':
      return "''";
    case 'number':
      return '0';
    case 'bigint':
      return '0n';
    case 'boolean':
      return 'false';
    case 'Uint8Array':
      return 'new Uint8Array(0)';
    default:
      return `create${tm.tsType}()`;
  }
}

/**
 * Return a JS condition expression that is truthy when the field is NOT the
 * proto3 default value, or `null` for message types that are always encoded.
 */
function proto3ZeroGuard(_f: FieldDef, tm: TypeMapping, camel: string): string | null {
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
    case 'float':
    case 'double':
      return `msg.${camel} !== 0`;
    case 'uint64':
    case 'int64':
    case 'sint64':
    case 'fixed64':
    case 'sfixed64':
      return `msg.${camel} !== 0n`;
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
 * accepts an options object with an optional `json` flag. When `json` is
 * true, messages are encoded/decoded via JSON codecs (needed for native
 * bridges). When false (default), plain objects pass through as-is
 * (structured clone).
 */
export function generateClient(proto: ProtoFile): string {
  const lines: string[] = [];

  lines.push('// -----------------------------------------------------------------');
  lines.push('// Auto-generated by @rpc-bridge/codegen -- DO NOT EDIT');
  lines.push('// -----------------------------------------------------------------');
  lines.push('');
  lines.push("import { RpcClient, type CallOptions } from '@rpc-bridge/core';");

  // Import all message/enum types used by services
  const { types, jsonCodecs } = collectClientImports(proto);
  if (types.size > 0 || jsonCodecs.size > 0) {
    const allImports = [...new Set([...types, ...jsonCodecs])].sort();
    lines.push(`import { ${allImports.join(', ')} } from './messages.js';`);
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
  lines.push(` * When \`json\` is true, messages are encoded/decoded via JSON codecs`);
  lines.push(` * (required for native bridges). Defaults to false (structured clone).`);
  lines.push(` */`);
  lines.push(`export class ${className} {`);
  lines.push(`  private readonly client: RpcClient;`);
  lines.push(`  private readonly service: string;`);
  lines.push(`  private readonly json: boolean;`);
  lines.push('');
  lines.push(`  constructor(client: RpcClient, options?: { service?: string; json?: boolean }) {`);
  lines.push(`    this.client = client;`);
  lines.push(`    this.service = options?.service ?? '${servicePath}';`);
  lines.push(`    this.json = options?.json ?? false;`);
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
  const hasReqCodec = hasJsonCodec(reqType);
  const hasRespCodec = hasJsonCodec(respType);

  const lines: string[] = [];

  if (!m.clientStreaming && !m.serverStreaming) {
    // --- Unary ---
    lines.push(`  /** Unary RPC: ${m.name} */`);
    lines.push(`  async ${tsName}(request: ${reqType}, options?: CallOptions): Promise<${respType}> {`);
    if (hasReqCodec) {
      lines.push(`    const data = this.json ? ${reqType}JSON.encode(request) : request;`);
    } else {
      lines.push(`    const data = request;`);
    }
    lines.push(`    const result = await this.client.unary(\`${methodPath}\`, data, options);`);
    if (hasRespCodec) {
      lines.push(`    return (this.json ? ${respType}JSON.decode(result as Record<string, unknown>) : result) as ${respType};`);
    } else {
      lines.push(`    return result as ${respType};`);
    }
    lines.push('  }');
  } else if (!m.clientStreaming && m.serverStreaming) {
    // --- Server streaming ---
    lines.push(`  /** Server-streaming RPC: ${m.name} */`);
    lines.push(`  async *${tsName}(request: ${reqType}, options?: CallOptions): AsyncGenerator<${respType}, void, undefined> {`);
    if (hasReqCodec) {
      lines.push(`    const data = this.json ? ${reqType}JSON.encode(request) : request;`);
    } else {
      lines.push(`    const data = request;`);
    }
    lines.push(`    for await (const item of this.client.serverStream(\`${methodPath}\`, data, options)) {`);
    if (hasRespCodec) {
      lines.push(`      yield (this.json ? ${respType}JSON.decode(item as Record<string, unknown>) : item) as ${respType};`);
    } else {
      lines.push(`      yield item as ${respType};`);
    }
    lines.push('    }');
    lines.push('  }');
  } else if (m.clientStreaming && !m.serverStreaming) {
    // --- Client streaming ---
    lines.push(`  /** Client-streaming RPC: ${m.name} */`);
    lines.push(`  async ${tsName}(requests: AsyncIterable<${reqType}>, options?: CallOptions): Promise<${respType}> {`);
    if (hasReqCodec) {
      lines.push(`    const mapped = this.json ? (async function* () {`);
      lines.push(`      for await (const req of requests) yield ${reqType}JSON.encode(req);`);
      lines.push('    })() : requests;');
    } else {
      lines.push(`    const mapped = requests;`);
    }
    lines.push(`    const result = await this.client.clientStream(\`${methodPath}\`, mapped, options);`);
    if (hasRespCodec) {
      lines.push(`    return (this.json ? ${respType}JSON.decode(result as Record<string, unknown>) : result) as ${respType};`);
    } else {
      lines.push(`    return result as ${respType};`);
    }
    lines.push('  }');
  } else {
    // --- Bidi streaming ---
    lines.push(`  /** Bidirectional-streaming RPC: ${m.name} */`);
    lines.push(`  async *${tsName}(requests: AsyncIterable<${reqType}>, options?: CallOptions): AsyncGenerator<${respType}, void, undefined> {`);
    if (hasReqCodec) {
      lines.push(`    const mapped = this.json ? (async function* () {`);
      lines.push(`      for await (const req of requests) yield ${reqType}JSON.encode(req);`);
      lines.push('    })() : requests;');
    } else {
      lines.push(`    const mapped = requests;`);
    }
    lines.push(`    for await (const item of this.client.bidiStream(\`${methodPath}\`, mapped, options)) {`);
    if (hasRespCodec) {
      lines.push(`      yield (this.json ? ${respType}JSON.decode(item as Record<string, unknown>) : item) as ${respType};`);
    } else {
      lines.push(`      yield item as ${respType};`);
    }
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
 *   - `register<ServiceName>(handler, options?)` function returning `ServiceRegistration`
 *
 * When `json` is true, incoming/outgoing messages are decoded/encoded via
 * JSON codecs. When false (default), objects pass through as-is.
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
  const { types, jsonCodecs } = collectServerImports(proto);
  if (types.size > 0 || jsonCodecs.size > 0) {
    const allImports = [...new Set([...types, ...jsonCodecs])].sort();
    lines.push(`import { ${allImports.join(', ')} } from './messages.js';`);
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
  lines.push(` * When \`json\` is true, incoming/outgoing messages are decoded/encoded`);
  lines.push(` * via JSON codecs (required for native bridges). Defaults to false.`);
  lines.push(` */`);
  lines.push(`export function ${fnName}(handler: ${iface}, options?: { json?: boolean }): ServiceRegistration {`);
  lines.push(`  const json = options?.json ?? false;`);
  lines.push(`  const methods: Record<string, MethodHandler> = {};`);
  lines.push('');

  for (const m of svc.methods) {
    const tsName = toCamelCase(m.name);
    const reqType = m.inputType;
    const respType = m.outputType;
    const methodTypeStr = methodTypeEnum(m);
    const hasReqCodec = hasJsonCodec(reqType);
    const hasRespCodec = hasJsonCodec(respType);

    lines.push(`  // ${m.name}`);

    if (!m.clientStreaming && !m.serverStreaming) {
      // --- Unary ---
      lines.push(`  methods['${m.name}'] = {`);
      lines.push(`    type: ${methodTypeStr},`);
      lines.push(`    handler: async (data: unknown, context: CallContext): Promise<unknown> => {`);
      if (hasReqCodec) {
        lines.push(`      const request = (json ? ${reqType}JSON.decode(data as Record<string, unknown>) : data) as ${reqType};`);
      } else {
        lines.push(`      const request = data as ${reqType};`);
      }
      lines.push(`      const response = await handler.${tsName}(request, context);`);
      if (hasRespCodec) {
        lines.push(`      return json ? ${respType}JSON.encode(response) : response;`);
      } else {
        lines.push(`      return response;`);
      }
      lines.push('    },');
      lines.push('  };');
    } else if (!m.clientStreaming && m.serverStreaming) {
      // --- Server streaming ---
      lines.push(`  methods['${m.name}'] = {`);
      lines.push(`    type: ${methodTypeStr},`);
      lines.push(`    handler: (data: unknown, context: CallContext): AsyncIterable<unknown> => {`);
      if (hasReqCodec) {
        lines.push(`      const request = (json ? ${reqType}JSON.decode(data as Record<string, unknown>) : data) as ${reqType};`);
      } else {
        lines.push(`      const request = data as ${reqType};`);
      }
      lines.push(`      const responses = handler.${tsName}(request, context);`);
      if (hasRespCodec) {
        lines.push('      return (async function* () {');
        lines.push(`        for await (const resp of responses) yield json ? ${respType}JSON.encode(resp) : resp;`);
        lines.push('      })();');
      } else {
        lines.push('      return responses;');
      }
      lines.push('    },');
      lines.push('  };');
    } else if (m.clientStreaming && !m.serverStreaming) {
      // --- Client streaming ---
      lines.push(`  methods['${m.name}'] = {`);
      lines.push(`    type: ${methodTypeStr},`);
      lines.push(`    handler: async (requests: AsyncIterable<unknown>, context: CallContext): Promise<unknown> => {`);
      if (hasReqCodec) {
        lines.push('      const decoded = (async function* () {');
        lines.push(`        for await (const d of requests) yield (json ? ${reqType}JSON.decode(d as Record<string, unknown>) : d) as ${reqType};`);
        lines.push('      })();');
      } else {
        lines.push(`      const decoded = requests as AsyncIterable<${reqType}>;`);
      }
      lines.push(`      const response = await handler.${tsName}(decoded, context);`);
      if (hasRespCodec) {
        lines.push(`      return json ? ${respType}JSON.encode(response) : response;`);
      } else {
        lines.push(`      return response;`);
      }
      lines.push('    },');
      lines.push('  };');
    } else {
      // --- Bidi streaming ---
      lines.push(`  methods['${m.name}'] = {`);
      lines.push(`    type: ${methodTypeStr},`);
      lines.push(`    handler: (requests: AsyncIterable<unknown>, context: CallContext): AsyncIterable<unknown> => {`);
      if (hasReqCodec) {
        lines.push('      const decoded = (async function* () {');
        lines.push(`        for await (const d of requests) yield (json ? ${reqType}JSON.decode(d as Record<string, unknown>) : d) as ${reqType};`);
        lines.push('      })();');
      } else {
        lines.push(`      const decoded = requests as AsyncIterable<${reqType}>;`);
      }
      lines.push(`      const responses = handler.${tsName}(decoded, context);`);
      if (hasRespCodec) {
        lines.push('      return (async function* () {');
        lines.push(`        for await (const resp of responses) yield json ? ${respType}JSON.encode(resp) : resp;`);
        lines.push('      })();');
      } else {
        lines.push('      return responses;');
      }
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
 * Check if a message type needs a JSON codec.
 * We conservatively return true for all types. The import of a non-existent
 * codec would be a compile error, but generateMessageCode only emits a codec
 * for types that actually need it. The simplest approach: always generate a
 * codec for every message, even if trivial. This avoids cross-referencing.
 */
function hasJsonCodec(_name: string): boolean {
  return true;
}

/** Collect types + JSON codec imports for client stubs. */
function collectClientImports(proto: ProtoFile): { types: Set<string>; jsonCodecs: Set<string> } {
  const types = new Set<string>();
  const jsonCodecs = new Set<string>();
  for (const svc of proto.services) {
    for (const m of svc.methods) {
      types.add(m.inputType);
      types.add(m.outputType);
      if (hasJsonCodec(m.inputType)) jsonCodecs.add(`${m.inputType}JSON`);
      if (hasJsonCodec(m.outputType)) jsonCodecs.add(`${m.outputType}JSON`);
    }
  }
  return { types, jsonCodecs };
}

/** Collect types + JSON codec imports for server registration. */
function collectServerImports(proto: ProtoFile): { types: Set<string>; jsonCodecs: Set<string> } {
  const types = new Set<string>();
  const jsonCodecs = new Set<string>();
  for (const svc of proto.services) {
    for (const m of svc.methods) {
      types.add(m.inputType);
      types.add(m.outputType);
      if (hasJsonCodec(m.inputType)) jsonCodecs.add(`${m.inputType}JSON`);
      if (hasJsonCodec(m.outputType)) jsonCodecs.add(`${m.outputType}JSON`);
    }
  }
  return { types, jsonCodecs };
}
