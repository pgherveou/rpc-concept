/**
 * Proto file parser using protobufjs.
 *
 * Parses .proto files via protobufjs reflection and converts the result
 * into the ProtoFile AST consumed by the code generators.
 */

import protobuf from 'protobufjs';
import { accessSync } from 'fs';
import { resolve as resolvePath, dirname } from 'path';

export interface ProtoFile {
  syntax: string;
  package: string;
  messages: MessageDef[];
  enums: EnumDef[];
  services: ServiceDef[];
}

export interface OneOfDef {
  name: string;
  fields: FieldDef[];
}

export interface MessageDef {
  name: string;
  fields: FieldDef[];
  oneofs: OneOfDef[];
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
  /** Error type name from (startup_error) method option, if present. */
  startupErrorType?: string;
}

/** Parse a .proto file from disk. includePaths are searched when resolving imports. */
export function parseProtoFile(filePath: string, includePaths?: string[]): ProtoFile {
  const root = new protobuf.Root();
  if (includePaths && includePaths.length > 0) {
    root.resolvePath = (_origin: string, target: string) => {
      for (const dir of includePaths) {
        const resolved = resolvePath(dir, target);
        try { accessSync(resolved); return resolved; } catch {}
      }
      return resolvePath(dirname(_origin), target);
    };
  }
  root.loadSync(filePath);
  return extractProtoFile(root);
}

/** Parse a .proto file content string. */
export function parseProto(content: string): ProtoFile {
  const root = protobuf.parse(content, { keepCase: true }).root;
  return extractProtoFile(root);
}

function extractProtoFile(root: protobuf.Root): ProtoFile {
  const result: ProtoFile = {
    syntax: 'proto3',
    package: '',
    messages: [],
    enums: [],
    services: [],
  };

  // Find the package by walking nested namespaces
  const pkg = findPackage(root);
  result.package = pkg.fullName.replace(/^\./, '');

  // Collect messages, enums, and services from the package namespace
  collectTypes(pkg, result);

  return result;
}

function findPackage(ns: protobuf.NamespaceBase): protobuf.NamespaceBase {
  // Walk down single-child namespaces to find the deepest package
  for (const nested of ns.nestedArray) {
    if (nested instanceof protobuf.Namespace && !(nested instanceof protobuf.Type) && !(nested instanceof protobuf.Service)) {
      return findPackage(nested);
    }
  }
  return ns;
}

function collectTypes(ns: protobuf.NamespaceBase, result: ProtoFile): void {
  for (const nested of ns.nestedArray) {
    if (nested instanceof protobuf.Service) {
      result.services.push(extractService(nested));
    } else if (nested instanceof protobuf.Type) {
      result.messages.push(extractMessage(nested));
    } else if (nested instanceof protobuf.Enum) {
      result.enums.push(extractEnum(nested));
    } else if (nested instanceof protobuf.Namespace) {
      collectTypes(nested, result);
    }
  }
}

function extractMessage(type: protobuf.Type): MessageDef {
  // Extract oneofs (skip synthetic oneofs from proto3 optional)
  const oneofs: OneOfDef[] = [];
  const oneofFieldNames = new Set<string>();
  for (const oo of type.oneofsArray) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((oo as any).isProto3Optional) continue;
    const ooFields: FieldDef[] = [];
    for (const field of oo.fieldsArray) {
      oneofFieldNames.add(field.name);
      ooFields.push({
        name: field.name,
        type: stripPackagePrefix(field.type),
        number: field.id,
        repeated: field.repeated,
        optional: false,
        deprecated: !!(field.options && field.options['deprecated']),
      });
    }
    oneofs.push({ name: oo.name, fields: ooFields });
  }

  // Extract top-level fields (excluding oneof members)
  const fields: FieldDef[] = [];
  for (const field of type.fieldsArray) {
    if (oneofFieldNames.has(field.name)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isExplicitOptional = (field as any).rule === 'optional';
    fields.push({
      name: field.name,
      type: stripPackagePrefix(field.type),
      number: field.id,
      repeated: field.repeated,
      optional: isExplicitOptional,
      deprecated: !!(field.options && field.options['deprecated']),
    });
  }

  const reserved: number[] = [];
  if (type.reserved) {
    for (const r of type.reserved) {
      if (typeof r === 'number') {
        reserved.push(r);
      } else if (Array.isArray(r) && r.length === 2) {
        for (let i = r[0]; i <= r[1]; i++) {
          reserved.push(i);
        }
      }
    }
  }

  return { name: type.name, fields, oneofs, reserved };
}

function extractEnum(enumType: protobuf.Enum): EnumDef {
  const values: EnumValueDef[] = [];
  for (const [name, number] of Object.entries(enumType.values)) {
    values.push({ name, number });
  }
  return { name: enumType.name, values };
}

function extractService(service: protobuf.Service): ServiceDef {
  const methods: MethodDef[] = [];
  for (const method of service.methodsArray) {
    const def: MethodDef = {
      name: method.name,
      inputType: stripPackagePrefix(method.requestType),
      outputType: stripPackagePrefix(method.responseType),
      clientStreaming: !!method.requestStream,
      serverStreaming: !!method.responseStream,
    };
    const startupError = method.options?.['(startup_error)'];
    if (startupError) {
      def.startupErrorType = stripPackagePrefix(startupError);
    }
    methods.push(def);
  }
  return { name: service.name, methods };
}

/** Strip any leading package/namespace prefix from a type name. */
function stripPackagePrefix(typeName: string): string {
  const parts = typeName.split('.');
  return parts[parts.length - 1];
}
