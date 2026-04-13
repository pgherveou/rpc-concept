/**
 * @rpc-bridge/codegen
 *
 * Code generation tools for the RPC bridge framework.
 * Reads protobuf service definitions and generates:
 * - TypeScript client stubs, server interfaces, and message types
 * - Swift service protocols and dispatchers
 * - Kotlin service interfaces and dispatchers
 */

export { parseProto, parseProtoFile, type ProtoFile, type ServiceDef, type MethodDef, type MessageDef, type OneOfDef, type FieldDef } from './parser.js';
export { generateMessages, generateClient, generateServer } from './gen-typescript.js';
export { generateSwift } from './gen-swift.js';
export { generateKotlin } from './gen-kotlin.js';
