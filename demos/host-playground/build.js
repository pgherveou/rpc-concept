import { build } from 'esbuild';
import { copyFileSync } from 'fs';

// Host page bundle (web)
await build({
  entryPoints: ['src/host.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/host.js',
  sourcemap: true,
  minify: false,
});

// Iframe product bundle
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/product.js',
  sourcemap: true,
  minify: false,
  jsx: 'automatic',
});

// Electron main process
await build({
  entryPoints: ['src/host-electron.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'dist/host-electron.js',
  sourcemap: true,
  minify: false,
  external: ['electron'],
});

// Electron preload (CJS for contextIsolation)
await build({
  entryPoints: ['src/preload.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/preload.js',
  sourcemap: true,
  minify: false,
  external: ['electron'],
});

// Android server (IIFE, runs in WebView)
await build({
  entryPoints: ['src/host-android.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/host-android.js',
  sourcemap: true,
  minify: false,
});

// Android client (IIFE, runs in WebView)
await build({
  entryPoints: ['src/bootstrap-android.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/product-android.js',
  sourcemap: true,
  minify: false,
  jsx: 'automatic',
});

// Copy HTML files
copyFileSync('index.html', 'dist/index.html');
copyFileSync('iframe.html', 'dist/iframe.html');
copyFileSync('electron-index.html', 'dist/electron-index.html');
copyFileSync('android-index.html', 'dist/android-index.html');
