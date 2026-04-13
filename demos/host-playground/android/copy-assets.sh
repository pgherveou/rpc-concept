#!/bin/bash
# Copy JS build artifacts into Android assets for WebView loading
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="$SCRIPT_DIR/../dist"
ASSETS="$SCRIPT_DIR/app/src/main/assets/web"

mkdir -p "$ASSETS"
cp "$DIST/host-android.js" "$ASSETS/"
cp "$DIST/product-android.js" "$ASSETS/"
cp "$DIST/android-index.html" "$ASSETS/"
echo "Assets copied to $ASSETS"
