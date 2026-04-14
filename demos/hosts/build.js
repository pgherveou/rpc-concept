import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync } from 'fs';

const productDist = '../playground-app/dist';

mkdirSync('dist/electron', { recursive: true });
mkdirSync('dist/android', { recursive: true });
mkdirSync('dist/ios', { recursive: true });

// --- Web (iframe demo, kept at dist root) ---
await build({
<<<<<<< HEAD
  entryPoints: ['src/web/host.ts'],
=======
  entryPoints: ['js/web/host.ts'],
>>>>>>> origin/pg/impl-general-service
  bundle: true,
  format: 'iife',
  outfile: 'dist/host.js',
  sourcemap: true,
});

copyFileSync(`${productDist}/product.js`, 'dist/product.js');
copyFileSync('web/index.html', 'dist/index.html');
copyFileSync('web/iframe.html', 'dist/iframe.html');

// --- Electron (per-platform subdir) ---
await build({
<<<<<<< HEAD
  entryPoints: ['src/electron/host.ts'],
=======
  entryPoints: ['js/electron/host.ts'],
>>>>>>> origin/pg/impl-general-service
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'dist/electron/host-electron.js',
  sourcemap: true,
  external: ['electron'],
});

await build({
<<<<<<< HEAD
  entryPoints: ['src/electron/preload.ts'],
=======
  entryPoints: ['js/electron/preload.ts'],
>>>>>>> origin/pg/impl-general-service
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/electron/preload.js',
  sourcemap: true,
  external: ['electron'],
});

copyFileSync(`${productDist}/product.js`, 'dist/electron/product.js');
writeFileSync('dist/electron/host.js', '// host runs in the electron main process\n');
copyFileSync('index.html', 'dist/electron/index.html');

// --- Native hosts (iOS + Android, only need product bundle) ---
copyFileSync(`${productDist}/product-native.js`, 'dist/android/product.js');
copyFileSync('index.html', 'dist/android/index.html');

copyFileSync(`${productDist}/product-native.js`, 'dist/ios/product.js');
copyFileSync('index.html', 'dist/ios/index.html');
