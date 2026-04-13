Build and run all e2e tests (web, electron, android) using Playwright.

## Requirements

All requirements from the individual e2e commands apply:
- Node.js, `npm install` at repo root, Playwright chromium (`npx playwright install chromium`)
- `electron` devDependency (already in package.json)
- Android SDK at `/opt/android-sdk`, JDK 17 at `/usr/lib/jvm/java-17-openjdk`
- A running Android emulator

## Steps

1. Run `npm run build` from the repo root
2. Copy Android assets and install APK:
   ```
   cd demos/host-playground/android && ./copy-assets.sh
   export ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-17-openjdk
   export PATH="$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH"
   ./gradlew installDebug
   ```
3. Run all tests from the repo root:
   ```
   export ANDROID_HOME=/opt/android-sdk PATH="$ANDROID_HOME/platform-tools:$PATH"
   npx playwright test
   ```
4. Report the results (15 tests total: 5 web + 5 electron + 5 android)
