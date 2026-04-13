#!/usr/bin/env node
/**
 * RPC Bridge Code Generator CLI
 *
 * Usage:
 *   rpc-bridge-codegen --proto <glob> [--ts-out <dir>] [--swift-out <dir>] [--kotlin-out <dir>]
 *
 * The --proto flag accepts a glob pattern (e.g. "demos/proto/*.proto") to
 * process multiple proto files. Types and services from all matched files
 * are merged into a single output.
 */

import { writeFileSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { parseProtoFile, type ProtoFile } from './parser.js';
import { generateMessages, generateClient, generateServer } from './gen-typescript.js';
import { generateSwift } from './gen-swift.js';
import { generateKotlin } from './gen-kotlin.js';

/**
 * Resolve a glob pattern like "path/to/*.proto" into matching file paths.
 * Supports simple wildcards (*) in the filename portion.
 */
function resolveGlob(pattern: string): string[] {
  const dir = resolve(dirname(pattern));
  const filePattern = pattern.substring(pattern.lastIndexOf('/') + 1);

  // Convert glob pattern to regex (only supports * wildcard)
  const regex = new RegExp(
    '^' + filePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
  );

  return readdirSync(dir)
    .filter((f) => regex.test(f))
    .map((f) => join(dir, f))
    .sort();
}

function main(): void {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (!options.proto) {
    console.error('Usage: rpc-bridge-codegen --proto <glob> [--ts-out <dir>] [--swift-out <dir>] [--kotlin-out <dir>]');
    process.exit(1);
  }

  // Resolve glob and parse all matched proto files
  const files = resolveGlob(options.proto);
  if (files.length === 0) {
    console.error(`No files matched: ${options.proto}`);
    process.exit(1);
  }

  const protos: ProtoFile[] = [];
  for (const file of files) {
    const protoPath = resolve(file);
    console.log(`Parsing proto file: ${protoPath}`);
    protos.push(parseProtoFile(protoPath));
  }

  const proto = mergeProtos(protos);

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
    const fileName = swiftNamespaceFromPkg(proto.package);
    writeFile(resolve(swiftDir, `${fileName}.swift`), swift);

    console.log(`Swift generated in: ${swiftDir}`);
  }

  // Generate Kotlin
  if (options.kotlinOut) {
    const kotlinDir = resolve(options.kotlinOut);
    mkdirSync(kotlinDir, { recursive: true });

    const kotlin = generateKotlin(proto);
    const fileName = kotlinNamespaceFromPkg(proto.package);
    writeFile(resolve(kotlinDir, `${fileName}.kt`), kotlin);

    console.log(`Kotlin generated in: ${kotlinDir}`);
  }

  console.log('Code generation complete.');
}

/** Merge multiple parsed proto files into one, combining messages/enums/services. */
function mergeProtos(protos: ProtoFile[]): ProtoFile {
  if (protos.length === 1) return protos[0];

  const merged: ProtoFile = {
    syntax: protos[0].syntax,
    package: protos[0].package,
    messages: [],
    enums: [],
    services: [],
  };

  const seenMessages = new Set<string>();
  const seenEnums = new Set<string>();
  const seenServices = new Set<string>();

  for (const proto of protos) {
    for (const msg of proto.messages) {
      if (seenMessages.has(msg.name)) {
        console.warn(`Warning: duplicate message "${msg.name}", skipping`);
        continue;
      }
      seenMessages.add(msg.name);
      merged.messages.push(msg);
    }
    for (const e of proto.enums) {
      if (seenEnums.has(e.name)) {
        console.warn(`Warning: duplicate enum "${e.name}", skipping`);
        continue;
      }
      seenEnums.add(e.name);
      merged.enums.push(e);
    }
    for (const svc of proto.services) {
      if (seenServices.has(svc.name)) {
        console.warn(`Warning: duplicate service "${svc.name}", skipping`);
        continue;
      }
      seenServices.add(svc.name);
      merged.services.push(svc);
    }
  }

  return merged;
}

function swiftNamespaceFromPkg(pkg: string): string {
  return pkg.split('.').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

function kotlinNamespaceFromPkg(pkg: string): string {
  return pkg.split('.').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
  console.log(`  Wrote: ${path}`);
}

const KNOWN_FLAGS = new Set(['--proto', '--ts-out', '--swift-out', '--kotlin-out']);

function parseArgs(args: string[]): {
  proto?: string;
  tsOut?: string;
  swiftOut?: string;
  kotlinOut?: string;
} {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && !KNOWN_FLAGS.has(arg)) {
      console.warn(`Warning: unknown argument '${arg}'`);
      continue;
    }
    switch (arg) {
      case '--proto':
        if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
          console.error(`Error: --proto requires a value`);
          process.exit(1);
        }
        result.proto = args[++i];
        break;
      case '--ts-out':
        if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
          console.error(`Error: --ts-out requires a value`);
          process.exit(1);
        }
        result.tsOut = args[++i];
        break;
      case '--swift-out':
        if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
          console.error(`Error: --swift-out requires a value`);
          process.exit(1);
        }
        result.swiftOut = args[++i];
        break;
      case '--kotlin-out':
        if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
          console.error(`Error: --kotlin-out requires a value`);
          process.exit(1);
        }
        result.kotlinOut = args[++i];
        break;
    }
  }
  return result;
}

main();
