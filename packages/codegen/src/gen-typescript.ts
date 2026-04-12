/**
 * TypeScript code generator for the RPC bridge framework.
 *
 * Takes parsed .proto file data and produces TypeScript source code:
 *   - Message classes with toJSON/fromJSON for cross-platform serialization
 *   - Client stub classes that wrap RpcClient
 *   - Server handler interfaces and dispatcher registrations
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
 * Encoding follows protobuf binary wire format using BinaryWriter/BinaryReader
 * from `@bufbuild/protobuf/wire`.
 */
export function generateMessages(proto: ProtoFile): string {
  const knownMessages = new Set(proto.messages.map((m) => m.name));
  const knownEnums = new Set(proto.enums.map((e) => e.name));

  const lines: string[] = [];

  lines.push('// -----------------------------------------------------------------');
  lines.push('// Auto-generated by @rpc-bridge/codegen -- DO NOT EDIT');
  lines.push('// -----------------------------------------------------------------');
  lines.push('');
  // No runtime imports needed -- toJSON/fromJSON use only standard JS

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

  // --- toJSON ---
  lines.push(`  /** Serialize to a JSON-compatible plain object (proto3 JSON mapping). */`);
  lines.push(`  static toJSON(msg: I${msg.name}): Record<string, unknown> {`);
  lines.push('    const o: Record<string, unknown> = {};');
  for (const f of fields) {
    const tm = resolveType(f.type, knownMessages, knownEnums);
    const camel = snakeToCamel(f.name);
    lines.push(generateToJsonField(f, tm, camel));
  }
  lines.push('    return o;');
  lines.push('  }');
  lines.push('');

  // --- fromJSON ---
  lines.push(`  /** Deserialize from a JSON-compatible plain object (proto3 JSON mapping). */`);
  lines.push(`  static fromJSON(o: Record<string, unknown>): ${msg.name} {`);
  lines.push(`    const msg = new ${msg.name}();`);
  for (const f of fields) {
    const tm = resolveType(f.type, knownMessages, knownEnums);
    const camel = snakeToCamel(f.name);
    lines.push(generateFromJsonField(f, tm, camel));
  }
  lines.push('    return msg;');
  lines.push('  }');

  lines.push('}');

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
      lines.push(`      o.${camel} = msg.${camel}.map(v => ${tm.tsType}.toJSON(v));`);
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
      lines.push(`      o.${camel} = ${tm.tsType}.toJSON(msg.${camel});`);
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
      lines.push(`    o.${camel} = ${tm.tsType}.toJSON(msg.${camel});`);
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
      lines.push(`      msg.${camel} = (o.${camel} as Record<string, unknown>[]).map(v => ${tm.tsType}.fromJSON(v));`);
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
    lines.push(`    if (o.${camel} != null) msg.${camel} = ${tm.tsType}.fromJSON(o.${camel} as Record<string, unknown>);`);
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

// --- Encode helpers ---

function generateSingleEncodeStatement(
  f: FieldDef,
  tm: TypeMapping,
  camel: string,
): string {
  if (tm.isMessage) {
    return `    w.tag(${f.number}, WireType.LengthDelimited).bytes(${tm.tsType}.encode(msg.${camel}));`;
  }
  if (tm.isEnum) {
    return `    w.tag(${f.number}, WireType.Varint).int32(msg.${camel} as number);`;
  }
  return `    ${writeChain(f.number, tm.protoType, `msg.${camel}`)};`;
}

function generateRepeatedEncodeBlock(
  f: FieldDef,
  tm: TypeMapping,
  camel: string,
): string {
  const lines: string[] = [];
  lines.push(`    for (const item of msg.${camel}) {`);
  if (tm.isMessage) {
    lines.push(`      w.tag(${f.number}, WireType.LengthDelimited).bytes(${tm.tsType}.encode(item));`);
  } else if (tm.isEnum) {
    lines.push(`      w.tag(${f.number}, WireType.Varint).int32(item as number);`);
  } else {
    lines.push(`      ${writeChain(f.number, tm.protoType, 'item')};`);
  }
  lines.push('    }');
  return lines.join('\n');
}

/** Generate a BinaryWriter chained write expression for a scalar proto type. */
function writeChain(fieldNumber: number, protoType: string, expr: string): string {
  switch (protoType) {
    case 'string':
      return `w.tag(${fieldNumber}, WireType.LengthDelimited).string(${expr})`;
    case 'bytes':
      return `w.tag(${fieldNumber}, WireType.LengthDelimited).bytes(${expr})`;
    case 'bool':
      return `w.tag(${fieldNumber}, WireType.Varint).bool(${expr})`;
    case 'uint32':
      return `w.tag(${fieldNumber}, WireType.Varint).uint32(${expr})`;
    case 'int32':
      return `w.tag(${fieldNumber}, WireType.Varint).int32(${expr})`;
    case 'uint64':
      return `w.tag(${fieldNumber}, WireType.Varint).uint64(${expr})`;
    case 'int64':
      return `w.tag(${fieldNumber}, WireType.Varint).int64(${expr})`;
    case 'sint32':
      return `w.tag(${fieldNumber}, WireType.Varint).sint32(${expr})`;
    case 'sint64':
      return `w.tag(${fieldNumber}, WireType.Varint).sint64(${expr})`;
    case 'fixed32':
      return `w.tag(${fieldNumber}, WireType.Bit32).fixed32(${expr})`;
    case 'sfixed32':
      return `w.tag(${fieldNumber}, WireType.Bit32).sfixed32(${expr})`;
    case 'fixed64':
      return `w.tag(${fieldNumber}, WireType.Bit64).fixed64(${expr})`;
    case 'sfixed64':
      return `w.tag(${fieldNumber}, WireType.Bit64).sfixed64(${expr})`;
    case 'float':
      return `w.tag(${fieldNumber}, WireType.Bit32).float(${expr})`;
    case 'double':
      return `w.tag(${fieldNumber}, WireType.Bit64).double(${expr})`;
    default:
      return `w.tag(${fieldNumber}, WireType.LengthDelimited).bytes(${expr})`;
  }
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
    return `${tm.tsType}.decode(r.bytes())`;
  }
  if (tm.isEnum) {
    return `r.int32() as ${tm.tsType}`;
  }
  switch (tm.protoType) {
    case 'string':
      return 'r.string()';
    case 'bytes':
      return 'r.bytes()';
    case 'bool':
      return 'r.bool()';
    case 'float':
      return 'r.float()';
    case 'double':
      return 'r.double()';
    case 'fixed32':
      return 'r.fixed32()';
    case 'sfixed32':
      return 'r.sfixed32()';
    case 'fixed64':
      return 'BigInt(r.fixed64())';
    case 'sfixed64':
      return 'BigInt(r.sfixed64())';
    case 'sint32':
      return 'r.sint32()';
    case 'sint64':
      return 'BigInt(r.sint64())';
    case 'uint32':
      return 'r.uint32()';
    case 'int32':
      return 'r.int32()';
    case 'uint64':
      return 'BigInt(r.uint64())';
    case 'int64':
      return 'BigInt(r.int64())';
    default:
      return `${tm.tsType}.decode(r.bytes())`;
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
    case 'bigint':
      return '0n';
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
    lines.push(`  async ${tsName}(request: I${reqType}, options?: CallOptions): Promise<${respType}> {`);
    lines.push(`    const result = await this.client.unary(\`${methodPath}\`, ${reqType}.toJSON(request), options);`);
    lines.push(`    return ${respType}.fromJSON(result as Record<string, unknown>);`);
    lines.push('  }');
  } else if (!m.clientStreaming && m.serverStreaming) {
    // --- Server streaming ---
    lines.push(`  /** Server-streaming RPC: ${m.name} */`);
    lines.push(`  async *${tsName}(request: I${reqType}, options?: CallOptions): AsyncGenerator<${respType}, void, undefined> {`);
    lines.push(`    for await (const data of this.client.serverStream(\`${methodPath}\`, ${reqType}.toJSON(request), options)) {`);
    lines.push(`      yield ${respType}.fromJSON(data as Record<string, unknown>);`);
    lines.push('    }');
    lines.push('  }');
  } else if (m.clientStreaming && !m.serverStreaming) {
    // --- Client streaming ---
    lines.push(`  /** Client-streaming RPC: ${m.name} */`);
    lines.push(`  async ${tsName}(requests: AsyncIterable<I${reqType}>, options?: CallOptions): Promise<${respType}> {`);
    lines.push(`    const mapped = (async function* () {`);
    lines.push(`      for await (const req of requests) yield ${reqType}.toJSON(req);`);
    lines.push('    })();');
    lines.push(`    const result = await this.client.clientStream(\`${methodPath}\`, mapped, options);`);
    lines.push(`    return ${respType}.fromJSON(result as Record<string, unknown>);`);
    lines.push('  }');
  } else {
    // --- Bidi streaming ---
    lines.push(`  /** Bidirectional-streaming RPC: ${m.name} */`);
    lines.push(`  async *${tsName}(requests: AsyncIterable<I${reqType}>, options?: CallOptions): AsyncGenerator<${respType}, void, undefined> {`);
    lines.push(`    const mapped = (async function* () {`);
    lines.push(`      for await (const req of requests) yield ${reqType}.toJSON(req);`);
    lines.push('    })();');
    lines.push(`    for await (const data of this.client.bidiStream(\`${methodPath}\`, mapped, options)) {`);
    lines.push(`      yield ${respType}.fromJSON(data as Record<string, unknown>);`);
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
      lines.push(`    handler: async (data: unknown, context: CallContext): Promise<unknown> => {`);
      lines.push(`      const request = ${reqType}.fromJSON(data as Record<string, unknown>);`);
      lines.push(`      const response = await handler.${tsName}(request, context);`);
      lines.push(`      return ${respType}.toJSON(response);`);
      lines.push('    },');
      lines.push('  };');
    } else if (!m.clientStreaming && m.serverStreaming) {
      // --- Server streaming ---
      lines.push(`  methods['${m.name}'] = {`);
      lines.push(`    type: ${methodTypeStr},`);
      lines.push(`    handler: (data: unknown, context: CallContext): AsyncIterable<unknown> => {`);
      lines.push(`      const request = ${reqType}.fromJSON(data as Record<string, unknown>);`);
      lines.push(`      const responses = handler.${tsName}(request, context);`);
      lines.push('      return (async function* () {');
      lines.push(`        for await (const resp of responses) yield ${respType}.toJSON(resp);`);
      lines.push('      })();');
      lines.push('    },');
      lines.push('  };');
    } else if (m.clientStreaming && !m.serverStreaming) {
      // --- Client streaming ---
      lines.push(`  methods['${m.name}'] = {`);
      lines.push(`    type: ${methodTypeStr},`);
      lines.push(`    handler: async (requests: AsyncIterable<unknown>, context: CallContext): Promise<unknown> => {`);
      lines.push('      const decoded = (async function* () {');
      lines.push(`        for await (const d of requests) yield ${reqType}.fromJSON(d as Record<string, unknown>);`);
      lines.push('      })();');
      lines.push(`      const response = await handler.${tsName}(decoded, context);`);
      lines.push(`      return ${respType}.toJSON(response);`);
      lines.push('    },');
      lines.push('  };');
    } else {
      // --- Bidi streaming ---
      lines.push(`  methods['${m.name}'] = {`);
      lines.push(`    type: ${methodTypeStr},`);
      lines.push(`    handler: (requests: AsyncIterable<unknown>, context: CallContext): AsyncIterable<unknown> => {`);
      lines.push('      const decoded = (async function* () {');
      lines.push(`        for await (const d of requests) yield ${reqType}.fromJSON(d as Record<string, unknown>);`);
      lines.push('      })();');
      lines.push(`      const responses = handler.${tsName}(decoded, context);`);
      lines.push('      return (async function* () {');
      lines.push(`        for await (const resp of responses) yield ${respType}.toJSON(resp);`);
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
