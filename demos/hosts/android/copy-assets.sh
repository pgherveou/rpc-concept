#!/bin/bash
# Copy JS build artifacts into Android assets for WebView loading
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="$SCRIPT_DIR/../dist/android"
ASSETS="$SCRIPT_DIR/app/src/main/assets/web"

mkdir -p "$ASSETS"
cp "$DIST/product.js" "$ASSETS/"
cp "$DIST/index.html" "$ASSETS/"
echo "Assets copied to $ASSETS"
