Build and run e2e tests for the specified platform(s).

Usage: /e2e <platform>
Where platform is: web, electron, android, or all

Argument: $ARGUMENTS

## Common setup

1. Run `npm run build` from the repo root

## Platform: web

Requirements: Playwright chromium installed (`npx playwright install chromium`)

Run: `npx playwright test --project=web`

The web tests serve `demos/host-playground/dist/` on port 3456 and test via iframe.

## Platform: electron

Requirements: `electron` devDependency (already in package.json)

Run: `npx playwright test --project=electron`

Tests launch the app via `_electron.launch()` using `demos/host-playground/dist/host-electron.js`.

## Platform: android

Requirements:
- Android SDK at `/opt/android-sdk`
- JDK 17 at `/usr/lib/jvm/java-17-openjdk`
- A running Android emulator (`adb devices` should show a device)

To start the emulator if not running:
```
export ANDROID_HOME=/opt/android-sdk
$ANDROID_HOME/emulator/emulator -avd <avd-name> &
```

Before running tests, build and install the APK:
```
cd demos/host-playground/android && ./copy-assets.sh
export ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export PATH="$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH"
./gradlew installDebug
```

Run: `export ANDROID_HOME=/opt/android-sdk PATH="$ANDROID_HOME/platform-tools:$PATH" && npx playwright test --project=android`

## Platform: all

Follow all platform-specific setup above, then run: `npx playwright test`

Expect 15 tests total (5 web + 5 electron + 5 android).
