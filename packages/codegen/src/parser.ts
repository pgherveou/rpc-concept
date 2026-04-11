/**
 * Minimal protobuf .proto file parser.
 *
 * Parses service definitions, message definitions, and enum definitions
 * from .proto files. This is NOT a full protobuf parser - it handles
 * the subset needed for code generation of service stubs and message types.
 *
 * For production use, consider using protoc or protobufjs for full parsing.
 * This parser is intentionally minimal to avoid external dependencies.
 */

export interface ProtoFile {
  syntax: string;
  package: string;
  messages: MessageDef[];
  enums: EnumDef[];
  services: ServiceDef[];
}

export interface MessageDef {
  name: string;
  fields: FieldDef[];
  reserved: number[];
}

export interface FieldDef {
  name: string;
  type: string;
  number: number;
  repeated: boolean;
  optional: boolean;
  deprecated: boolean;
}

export interface EnumDef {
  name: string;
  values: EnumValueDef[];
}

export interface EnumValueDef {
  name: string;
  number: number;
}

export interface ServiceDef {
  name: string;
  methods: MethodDef[];
}

export interface MethodDef {
  name: string;
  inputType: string;
  outputType: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
}

/** Parse a .proto file content string. */
export function parseProto(content: string): ProtoFile {
  const result: ProtoFile = {
    syntax: 'proto3',
    package: '',
    messages: [],
    enums: [],
    services: [],
  };

  // Remove comments
  const cleaned = removeComments(content);
  const tokens = tokenize(cleaned);
  const parser = new TokenParser(tokens);

  while (parser.hasMore()) {
    const token = parser.peek();
    switch (token) {
      case 'syntax':
        parser.advance(); // 'syntax'
        parser.expect('=');
        result.syntax = parser.readString();
        parser.expect(';');
        break;
      case 'package':
        parser.advance(); // 'package'
        result.package = parser.readQualifiedName();
        parser.expect(';');
        break;
      case 'message':
        result.messages.push(parseMessage(parser));
        break;
      case 'enum':
        result.enums.push(parseEnum(parser));
        break;
      case 'service':
        result.services.push(parseService(parser));
        break;
      case 'import':
      case 'option':
        // Skip import and option statements
        parser.skipUntil(';');
        parser.expect(';');
        break;
      default:
        parser.advance(); // Skip unknown tokens
    }
  }

  return result;
}

function parseMessage(parser: TokenParser): MessageDef {
  parser.expect('message');
  const name = parser.advance();
  parser.expect('{');

  const msg: MessageDef = { name, fields: [], reserved: [] };

  while (parser.peek() !== '}') {
    const token = parser.peek();
    if (token === 'reserved') {
      parser.advance();
      // Parse reserved field numbers
      while (parser.peek() !== ';') {
        const tok = parser.advance();
        const num = parseInt(tok, 10);
        if (!isNaN(num)) {
          msg.reserved.push(num);
          if (parser.peek() === 'to') {
            parser.advance(); // 'to'
            const end = parseInt(parser.advance(), 10);
            for (let i = num + 1; i <= end; i++) {
              msg.reserved.push(i);
            }
          }
        }
        if (parser.peek() === ',') parser.advance();
      }
      parser.expect(';');
    } else if (token === 'message' || token === 'enum') {
      // Nested types - skip for now
      parser.advance();
      parser.advance(); // name
      parser.skipBlock();
    } else if (token === 'oneof') {
      // Skip oneof blocks
      parser.advance();
      parser.advance(); // name
      parser.skipBlock();
    } else if (token === 'map') {
      // Skip map fields for now
      parser.skipUntil(';');
      parser.expect(';');
    } else {
      // Field definition
      const field = parseField(parser);
      if (field) msg.fields.push(field);
    }
  }

  parser.expect('}');
  return msg;
}

function parseField(parser: TokenParser): FieldDef | null {
  let repeated = false;
  let optional = false;

  let type = parser.advance();
  if (type === 'repeated') {
    repeated = true;
    type = parser.advance();
  } else if (type === 'optional') {
    optional = true;
    type = parser.advance();
  }

  const name = parser.advance();
  parser.expect('=');
  const number = parseInt(parser.advance(), 10);

  // Check for field options like [deprecated = true]
  let deprecated = false;
  if (parser.peek() === '[') {
    parser.advance(); // '['
    while (parser.peek() !== ']') {
      const opt = parser.advance();
      if (opt === 'deprecated') {
        parser.expect('=');
        deprecated = parser.advance() === 'true';
      }
      if (parser.peek() === ',') parser.advance();
    }
    parser.expect(']');
  }

  parser.expect(';');

  if (isNaN(number)) return null;

  return { name, type, number, repeated, optional, deprecated };
}

function parseEnum(parser: TokenParser): EnumDef {
  parser.expect('enum');
  const name = parser.advance();
  parser.expect('{');

  const enumDef: EnumDef = { name, values: [] };

  while (parser.peek() !== '}') {
    if (parser.peek() === 'option' || parser.peek() === 'reserved') {
      parser.skipUntil(';');
      parser.expect(';');
      continue;
    }
    const valueName = parser.advance();
    parser.expect('=');
    const valueNumber = parseInt(parser.advance(), 10);
    // Skip options if present
    if (parser.peek() === '[') {
      parser.skipUntil(']');
      parser.expect(']');
    }
    parser.expect(';');
    enumDef.values.push({ name: valueName, number: valueNumber });
  }

  parser.expect('}');
  return enumDef;
}

function parseService(parser: TokenParser): ServiceDef {
  parser.expect('service');
  const name = parser.advance();
  parser.expect('{');

  const service: ServiceDef = { name, methods: [] };

  while (parser.peek() !== '}') {
    if (parser.peek() === 'option') {
      parser.skipUntil(';');
      parser.expect(';');
      continue;
    }
    if (parser.peek() === 'rpc') {
      service.methods.push(parseMethod(parser));
    } else {
      parser.advance();
    }
  }

  parser.expect('}');
  return service;
}

function parseMethod(parser: TokenParser): MethodDef {
  parser.expect('rpc');
  const name = parser.advance();
  parser.expect('(');

  let clientStreaming = false;
  if (parser.peek() === 'stream') {
    clientStreaming = true;
    parser.advance();
  }
  const inputType = parser.advance();
  parser.expect(')');

  parser.expect('returns');
  parser.expect('(');

  let serverStreaming = false;
  if (parser.peek() === 'stream') {
    serverStreaming = true;
    parser.advance();
  }
  const outputType = parser.advance();
  parser.expect(')');

  // Optional method options block or semicolon
  if (parser.peek() === '{') {
    parser.skipBlock();
  } else {
    parser.expect(';');
  }

  return { name, inputType, outputType, clientStreaming, serverStreaming };
}

// --- Tokenizer ---

function removeComments(content: string): string {
  // Remove // line comments and /* block comments */
  return content
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function tokenize(content: string): string[] {
  const tokens: string[] = [];
  const re = /("(?:[^"\\]|\\.)*")|([{}();=,\[\]])|([a-zA-Z_][a-zA-Z0-9_.]*)|(\d+)/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

class TokenParser {
  private pos = 0;

  constructor(private tokens: string[]) {}

  hasMore(): boolean {
    return this.pos < this.tokens.length;
  }

  peek(): string {
    if (this.pos >= this.tokens.length) throw new Error('Unexpected end of input');
    return this.tokens[this.pos];
  }

  advance(): string {
    if (this.pos >= this.tokens.length) throw new Error('Unexpected end of input');
    return this.tokens[this.pos++];
  }

  expect(token: string): void {
    const actual = this.advance();
    if (actual !== token) {
      throw new Error(`Expected '${token}' but got '${actual}' at position ${this.pos - 1}`);
    }
  }

  readString(): string {
    const raw = this.advance();
    // Remove surrounding quotes
    return raw.replace(/^"(.*)"$/, '$1');
  }

  readQualifiedName(): string {
    let name = this.advance();
    while (this.hasMore() && this.peek() === '.') {
      name += this.advance(); // '.'
      name += this.advance(); // next part
    }
    return name;
  }

  skipUntil(token: string): void {
    while (this.hasMore() && this.peek() !== token) {
      this.advance();
    }
  }

  skipBlock(): void {
    this.expect('{');
    let depth = 1;
    while (depth > 0 && this.hasMore()) {
      const t = this.advance();
      if (t === '{') depth++;
      else if (t === '}') depth--;
    }
  }
}
