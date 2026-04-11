#!/usr/bin/env node
/**
 * RPC Bridge Code Generator CLI
 *
 * Usage:
 *   rpc-bridge-codegen --proto <file> [--ts-out <dir>] [--swift-out <dir>] [--kotlin-out <dir>]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { parseProto } from './parser.js';
import { generateMessages, generateClient, generateServer } from './gen-typescript.js';
import { generateSwift } from './gen-swift.js';
import { generateKotlin } from './gen-kotlin.js';

function main(): void {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (!options.proto) {
    console.error('Usage: rpc-bridge-codegen --proto <file> [--ts-out <dir>] [--swift-out <dir>] [--kotlin-out <dir>]');
    process.exit(1);
  }

  // Parse the proto file
  const protoPath = resolve(options.proto);
  console.log(`Parsing proto file: ${protoPath}`);
  const content = readFileSync(protoPath, 'utf-8');
  const proto = parseProto(content);

  console.log(`Package: ${proto.package}`);
  console.log(`Messages: ${proto.messages.map(m => m.name).join(', ')}`);
  console.log(`Services: ${proto.services.map(s => s.name).join(', ')}`);

  // Generate TypeScript
  if (options.tsOut) {
    const tsDir = resolve(options.tsOut);
    mkdirSync(tsDir, { recursive: true });

    const messages = generateMessages(proto);
    writeFile(resolve(tsDir, 'messages.ts'), messages);

    const client = generateClient(proto);
    writeFile(resolve(tsDir, 'client.ts'), client);

    const server = generateServer(proto);
    writeFile(resolve(tsDir, 'server.ts'), server);

    // Generate barrel export
    const index = [
      '// Auto-generated barrel export',
      `// Source: ${proto.package}`,
      '',
      'export * from \'./messages.js\';',
      'export * from \'./client.js\';',
      'export * from \'./server.js\';',
      '',
    ].join('\n');
    writeFile(resolve(tsDir, 'index.ts'), index);

    console.log(`TypeScript generated in: ${tsDir}`);
  }

  // Generate Swift
  if (options.swiftOut) {
    const swiftDir = resolve(options.swiftOut);
    mkdirSync(swiftDir, { recursive: true });

    const swift = generateSwift(proto);
    const fileName = proto.services[0]?.name ?? 'Service';
    writeFile(resolve(swiftDir, `${fileName}.swift`), swift);

    console.log(`Swift generated in: ${swiftDir}`);
  }

  // Generate Kotlin
  if (options.kotlinOut) {
    const kotlinDir = resolve(options.kotlinOut);
    mkdirSync(kotlinDir, { recursive: true });

    const kotlin = generateKotlin(proto);
    const fileName = proto.services[0]?.name ?? 'Service';
    writeFile(resolve(kotlinDir, `${fileName}.kt`), kotlin);

    console.log(`Kotlin generated in: ${kotlinDir}`);
  }

  console.log('Code generation complete.');
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
  console.log(`  Wrote: ${path}`);
}

function parseArgs(args: string[]): {
  proto?: string;
  tsOut?: string;
  swiftOut?: string;
  kotlinOut?: string;
} {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--proto':
        result.proto = args[++i];
        break;
      case '--ts-out':
        result.tsOut = args[++i];
        break;
      case '--swift-out':
        result.swiftOut = args[++i];
        break;
      case '--kotlin-out':
        result.kotlinOut = args[++i];
        break;
    }
  }
  return result;
}

main();
