Build and start the playground for manual testing on the specified platform.

Usage: /start <platform>
Where platform is: web, electron, or android

Argument: $ARGUMENTS

## Common setup

1. Run `npm run build` from the repo root

## Platform: web

Serve and open in browser:
```
npx serve demos/host-playground/dist -l 3456 &
xdg-open http://localhost:3456
```

## Platform: electron

Launch the app:
```
npx electron demos/host-playground/dist/host-electron.js
```

## Platform: android

Requirements:
- Android SDK at `/opt/android-sdk`
- JDK 17 at `/usr/lib/jvm/java-17-openjdk`
- A running Android emulator with a visible window (not headless)

Before building, check that a device is available (`adb devices`). If the emulator is running headless (check `ps aux | grep emulator` for `-no-window`), kill it and restart with a visible window:
```
kill <pid>
export ANDROID_HOME=/opt/android-sdk
$ANDROID_HOME/emulator/emulator -avd test &
```
Wait for the device to come back online (`adb wait-for-device`).

Build, install, and launch:
```
cd demos/host-playground/android && ./copy-assets.sh
export ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export PATH="$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH"
./gradlew installDebug
adb shell am start -n com.demo.rpcbridge/.MainActivity
```
