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

// Copy guest-app bundle
cpSync('../../guest-app/dist/guest.js', 'RPCBridgeDemo/web/guest.js');
