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

// iOS product bundle
await build({
  entryPoints: ['src/bootstrap-ios.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/product-ios.js',
  sourcemap: true,
  jsx: 'automatic',
});

// Android product bundle
await build({
  entryPoints: ['src/bootstrap-android.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/product-android.js',
  sourcemap: true,
  jsx: 'automatic',
});
