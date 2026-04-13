import { build } from 'esbuild';
import { cpSync, existsSync } from 'fs';

// Bundle host entry point
await build({
  entryPoints: ['src/host.ts'],
  bundle: true,
  format: 'esm',
  outdir: 'dist',
  sourcemap: true,
});

// Bundle boot script (creates RpcClient from MessagePort, injects into product)
await build({
  entryPoints: ['src/boot.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/boot.js',
  sourcemap: true,
});

// Copy HTML files to dist
cpSync('src/host.html', 'dist/host.html');
cpSync('src/iframe.html', 'dist/iframe.html');

// Copy product-app bundle
cpSync('../../product-app/dist/product.js', 'dist/iframe.js');
if (existsSync('../../product-app/dist/product.js.map')) {
  cpSync('../../product-app/dist/product.js.map', 'dist/iframe.js.map');
}
