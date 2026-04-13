import { build } from 'esbuild';
import { cpSync } from 'fs';

// Build Android bootstrap (creates AndroidWebViewTransport and calls __rpcBridgeBoot)
await build({
  entryPoints: ['src/bootstrap.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'app/src/main/assets/web/bootstrap.js',
  sourcemap: true,
  minify: false,
});

// Copy product-app bundle
cpSync('../../product-app/dist/product.js', 'app/src/main/assets/web/product.js');
