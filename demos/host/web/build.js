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

// Bundle boot script (creates RpcClient from MessagePort, injects into guest)
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

// Copy guest-app bundle
cpSync('../../guest-app/dist/guest.js', 'dist/iframe.js');
if (existsSync('../../guest-app/dist/guest.js.map')) {
  cpSync('../../guest-app/dist/guest.js.map', 'dist/iframe.js.map');
}
