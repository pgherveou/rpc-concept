#!/bin/bash
# Copy JS build artifacts into the iOS Swift Package resource bundle.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="$SCRIPT_DIR/../dist/ios"
WEB="$SCRIPT_DIR/RPCBridgeDemo/web"

mkdir -p "$WEB"
cp "$DIST/index.html" "$WEB/"
cp "$DIST/host.js" "$WEB/"
cp "$DIST/product.js" "$WEB/"
[ -f "$DIST/host.js.map" ] && cp "$DIST/host.js.map" "$WEB/" || true
[ -f "$DIST/product.js.map" ] && cp "$DIST/product.js.map" "$WEB/" || true
echo "Assets copied to $WEB"
