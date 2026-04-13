import { build } from 'esbuild';
import { cpSync } from 'fs';

// Bundle main process (imports from demos/generated/)
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'dist/main.js',
  sourcemap: true,
  external: ['electron'],
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});

// Bundle preload (forwards MessagePort from main to renderer)
await build({
  entryPoints: ['src/preload.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/preload.js',
  sourcemap: true,
  external: ['electron'],
});

// Bundle boot script (creates RpcClient from MessagePort, injects into product)
await build({
  entryPoints: ['src/boot.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/boot.js',
  sourcemap: true,
});

// Copy HTML and product app bundle
cpSync('src/index.html', 'dist/index.html');
cpSync('../../product-app/dist/product.js', 'dist/product.js');
