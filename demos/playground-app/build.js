import { build } from 'esbuild';

// Web + Electron product bundle
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/product.js',
  sourcemap: true,
  jsx: 'automatic',
});

// Native (iOS + Android) product bundle
await build({
  entryPoints: ['src/bootstrap-native.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/product-native.js',
  sourcemap: true,
  jsx: 'automatic',
});
