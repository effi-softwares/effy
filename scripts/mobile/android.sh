#!/bin/sh
# Runs the customer or driver app's debug build on an Android emulator or device, with the app's output
# (prints, warnings, errors, crashes) in this terminal until Ctrl+C, which stops the app. It asks which
# connected device or emulator to use; Enter takes a running one (else a Pixel phone emulator), and
# ANDROID_DEVICE skips the question.
#
#   make customer-android                              # or: make driver-android
#   ANDROID_DEVICE=Pixel_7_Pro make customer-android   # an emulator by name, or a device's serial
#
# Needs a JDK, the Android SDK with an emulator image, and the app's secrets.properties. An emulator it
# starts keeps running after Ctrl+C; close its window to stop it.
set -eu

case "${1:-}" in
  customer | driver) app="$1" ;;
  *) echo "usage: $0 <customer|driver>" >&2; exit 1 ;;
esac
cd "$(dirname "$0")/../../apps/$app-mobile"
[ -f secrets.properties ] || { echo "apps/$app-mobile/secrets.properties is missing: copy secrets.properties.example and fill it in." >&2; exit 1; }

if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi
[ -n "${ANDROID_HOME:-}" ] || { echo "Set ANDROID_HOME to the Android SDK." >&2; exit 1; }
adb="$ANDROID_HOME/platform-tools/adb"
emulator="$ANDROID_HOME/emulator/emulator"
package="com.effyshopping.$app.mobile"

# Choices, one "<serial-or-avd> <label>" per line: running devices first, then emulators not
# running yet. A running emulator is listed by its AVD name.
"$adb" start-server > /dev/null
running_avds=""
choices=""
for serial in $("$adb" devices | awk 'NR > 1 && $2 == "device" { print $1 }'); do
  case "$serial" in
    emulator-*)
      avd="$("$adb" -s "$serial" emu avd name 2>/dev/null | head -1 | tr -d '\r')"
      running_avds="$running_avds $avd"
      choices="$choices$serial $avd (running)\n" ;;
    *) choices="$choices$serial $("$adb" -s "$serial" shell getprop ro.product.model | tr -d '\r') (device)\n" ;;
  esac
done
for avd in $("$emulator" -list-avds); do
  case " $running_avds " in *" $avd "*) ;; *) choices="$choices$avd $avd\n" ;; esac
done
choices="$(printf "%b" "$choices" | sed '/^$/d')"
[ -n "$choices" ] || { echo "No emulator or device. Create one in Android Studio (Device Manager)." >&2; exit 1; }

# The default: a running device, else a Pixel phone emulator, else the first choice.
target="$(printf '%s\n' "$choices" | awk '/\((running|device)\)$/ { print $1; exit }')"
[ -n "$target" ] || target="$(printf '%s\n' "$choices" | awk '$2 ~ /^Pixel/ && $2 !~ /Tablet/ { print $1; exit }')"
[ -n "$target" ] || target="$(printf '%s\n' "$choices" | head -1 | cut -d ' ' -f 1)"

if [ -n "${ANDROID_DEVICE:-}" ]; then
  target="$(printf '%s\n' "$choices" | awk -v want="$ANDROID_DEVICE" '$1 == want || $2 == want { print $1; exit }')"
  [ -n "$target" ] || { echo "No emulator or device called $ANDROID_DEVICE." >&2; exit 1; }
elif [ -t 0 ]; then
  echo "Emulators and devices:"
  printf '%s\n' "$choices" | awk -v d="$target" '{ id = $1; sub(/^[^ ]+ /, ""); printf "  %2d) %s%s\n", NR, $0, (id == d ? "  (default)" : "") }'
  printf 'Pick a number, or press Enter for the default: '
  read -r choice
  if [ -n "$choice" ]; then
    case "$choice" in *[!0-9]*) echo "Not a number: $choice" >&2; exit 1 ;; esac
    target="$(printf '%s\n' "$choices" | sed -n "${choice}p" | cut -d ' ' -f 1)"
    [ -n "$target" ] || { echo "There is no choice $choice." >&2; exit 1; }
  fi
fi

# An emulator that is not running yet: start it and wait until it has booted.
case "$("$adb" devices | awk -v t="$target" '$1 == t { print "running" }')" in
  running) serial="$target" ;;
  *)
    echo "Starting the $target emulator"
    nohup "$emulator" -avd "$target" > /dev/null 2>&1 &
    serial=""
    while [ -z "$serial" ]; do
      sleep 2
      for s in $("$adb" devices | awk 'NR > 1 && $1 ~ /^emulator-/ { print $1 }'); do
        [ "$("$adb" -s "$s" emu avd name 2>/dev/null | head -1 | tr -d '\r')" = "$target" ] && serial="$s"
      done
    done
    "$adb" -s "$serial" wait-for-device
    until [ "$("$adb" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done ;;
esac
echo "Device: $serial"

echo "Building and installing"
ANDROID_SERIAL="$serial" ./gradlew --console=plain :androidApp:installDebug

echo "Running the $app app; its output follows. Ctrl+C stops the app."
"$adb" -s "$serial" logcat -c
"$adb" -s "$serial" shell am start -W -S -n "$package/.MainActivity" > /dev/null
pid="$("$adb" -s "$serial" shell pidof "$package" | tr -d '\r')"
[ -n "$pid" ] || { echo "The app did not start; the device log has why: $adb -s $serial logcat -d AndroidRuntime:E '*:S'" >&2; exit 1; }
trap '"$adb" -s "$serial" shell am force-stop "$package"; exit 0' INT TERM
# Only this run's process: its prints (System.out), and every warning, error and crash (AndroidRuntime).
"$adb" -s "$serial" logcat --pid="$pid" -v color,time System.out:I '*:W'
