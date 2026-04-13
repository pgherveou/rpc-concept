import { build } from 'esbuild';
import { cpSync } from 'fs';

// Build iOS bootstrap (creates WKWebViewTransport and calls __rpcBridgeBoot)
await build({
  entryPoints: ['src/bootstrap.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'RPCBridgeDemo/web/bootstrap.js',
  sourcemap: true,
  minify: false,
});

// Copy product-app bundle
cpSync('../../product-app/dist/product.js', 'RPCBridgeDemo/web/product.js');
