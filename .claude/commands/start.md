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
- A running Android emulator

Build, install, and launch:
```
cd demos/host-playground/android && ./copy-assets.sh
export ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export PATH="$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH"
./gradlew installDebug
adb shell am start -n com.demo.rpcbridge/.MainActivity
```
