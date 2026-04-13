import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/product.js',
  sourcemap: true,
  minify: false,
  jsx: 'automatic',
});
