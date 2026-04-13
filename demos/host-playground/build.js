import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync } from 'fs';

mkdirSync('dist/electron', { recursive: true });
mkdirSync('dist/android', { recursive: true });
mkdirSync('dist/ios', { recursive: true });

// --- Web (iframe demo, kept at dist root) ---
await build({
  entryPoints: ['src/host.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/host.js',
  sourcemap: true,
});

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/product.js',
  sourcemap: true,
  jsx: 'automatic',
});

copyFileSync('web/index.html', 'dist/index.html');
copyFileSync('web/iframe.html', 'dist/iframe.html');

// --- Electron (per-platform subdir) ---
await build({
  entryPoints: ['src/host-electron.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'dist/electron/host-electron.js',
  sourcemap: true,
  external: ['electron'],
});

await build({
  entryPoints: ['src/preload.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/electron/preload.js',
  sourcemap: true,
  external: ['electron'],
});

// Renderer reuses the shared product entry; host runs in main, so emit a no-op.
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/electron/product.js',
  sourcemap: true,
  jsx: 'automatic',
});

writeFileSync('dist/electron/host.js', '// host runs in the electron main process\n');
copyFileSync('index.html', 'dist/electron/index.html');

// --- Android (relay, per-platform subdir) ---
await build({
  entryPoints: ['src/host-android.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/android/host.js',
  sourcemap: true,
});

await build({
  entryPoints: ['src/bootstrap-android.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/android/product.js',
  sourcemap: true,
  jsx: 'automatic',
});

copyFileSync('index.html', 'dist/android/index.html');

// --- iOS (relay, per-platform subdir) ---
await build({
  entryPoints: ['src/host-ios.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/ios/host.js',
  sourcemap: true,
});

await build({
  entryPoints: ['src/bootstrap-ios.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/ios/product.js',
  sourcemap: true,
  jsx: 'automatic',
});

copyFileSync('index.html', 'dist/ios/index.html');
