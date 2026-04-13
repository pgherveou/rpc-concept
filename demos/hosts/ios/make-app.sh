#!/bin/bash
# Wrap the SwiftPM-built executable into a minimal .app bundle for the
# iOS simulator. Mirrors the pattern from the deleted demos/host/ios script.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PRODUCT_DIR="build/Build/Products/Debug-iphonesimulator"
APP_BUNDLE="$PRODUCT_DIR/RPCBridgeDemo.app"
BUNDLE_ID="com.rpc-bridge.demo"

if [ ! -x "$PRODUCT_DIR/RPCBridgeDemo" ]; then
    echo "Error: $PRODUCT_DIR/RPCBridgeDemo not found. Run xcodebuild first." >&2
    exit 1
fi

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE"

cp "$PRODUCT_DIR/RPCBridgeDemo" "$APP_BUNDLE/"

# Copy the SwiftPM-emitted resource bundle alongside the executable.
RESOURCE_BUNDLE="RPCBridgeDemo_RPCBridgeDemo.bundle"
if [ -d "$PRODUCT_DIR/$RESOURCE_BUNDLE" ]; then
    cp -R "$PRODUCT_DIR/$RESOURCE_BUNDLE" "$APP_BUNDLE/"
fi

cat > "$APP_BUNDLE/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>RPCBridgeDemo</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleName</key>
    <string>RPCBridgeDemo</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSupportedPlatforms</key>
    <array>
        <string>iPhoneSimulator</string>
    </array>
    <key>MinimumOSVersion</key>
    <string>16.0</string>
    <key>UIRequiredDeviceCapabilities</key>
    <array>
        <string>arm64</string>
    </array>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
    </array>
    <key>UILaunchScreen</key>
    <dict/>
</dict>
</plist>
PLIST

codesign --force --sign - "$APP_BUNDLE"

echo "App bundle ready at $APP_BUNDLE"
