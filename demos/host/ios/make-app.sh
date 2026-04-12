#!/bin/bash
set -euo pipefail

PRODUCT_DIR="build/Build/Products/Debug-iphonesimulator"
APP_BUNDLE="$PRODUCT_DIR/RPCBridgeDemo.app"
BUNDLE_ID="com.rpc-bridge.demo"

# Create .app bundle structure
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE"

# Copy executable
cp "$PRODUCT_DIR/RPCBridgeDemo" "$APP_BUNDLE/"

# Copy web resources
cp -R RPCBridgeDemo/web "$APP_BUNDLE/web"

# Create Info.plist
cat > "$APP_BUNDLE/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>RPCBridgeDemo</string>
    <key>CFBundleIdentifier</key>
    <string>com.rpc-bridge.demo</string>
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

# Re-sign the app bundle
codesign --force --sign - "$APP_BUNDLE"

echo "App bundle created at $APP_BUNDLE"
