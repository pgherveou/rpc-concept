Build and run Android e2e tests using Playwright.

## Requirements

- Node.js installed, `npm install` completed at repo root
- Android SDK at `/opt/android-sdk` (installed via `yay -S android-sdk-cmdline-tools-latest`)
- SDK packages: `platforms;android-34`, `build-tools;34.0.0`, `platform-tools`, `emulator`, `system-images;android-34;google_apis;x86_64`
- JDK 17 at `/usr/lib/jvm/java-17-openjdk` (installed via `sudo pacman -Sy jdk17-openjdk`)
- A running Android emulator (`adb devices` should show a device)

To start the emulator if not running:

```
export ANDROID_HOME=/opt/android-sdk
$ANDROID_HOME/emulator/emulator -avd <avd-name> &
```

## Steps

1. Run `npm run build` from the repo root
2. Copy JS assets into the Android project:
   ```
   cd demos/host-playground/android && ./copy-assets.sh
   ```
3. Build and install the APK on the emulator:
   ```
   export ANDROID_HOME=/opt/android-sdk
   export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
   export PATH="$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH"
   ./gradlew installDebug
   ```
4. Run tests from the repo root:
   ```
   export ANDROID_HOME=/opt/android-sdk
   export PATH="$ANDROID_HOME/platform-tools:$PATH"
   npx playwright test --project=android
   ```
5. Report the results

The Android tests use Playwright's `_android` API to connect to the emulator, launch the app, and interact with the WebView. The Kotlin `MainActivity` acts as a raw base64 relay between two JS-side `AndroidWebViewTransport` instances (server + client) running in the same WebView.
