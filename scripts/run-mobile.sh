#!/usr/bin/env bash
# Build, install and launch a mobile app on a simulator or emulator you pick from a list.
#
#   scripts/run-mobile.sh <customer|driver> <ios|android>
#   make customer-ios | customer-android | driver-ios | driver-android
#
# The list shows what is running first (an open emulator, a booted simulator, a phone on USB), then what
# can be started. Pick with ↑/↓ (or j/k) and Enter, or press the item's number; q cancels. To skip the
# list, name the device: DEVICE="iPhone 17 Pro" (any part of its name, its udid or its adb serial).
#
# iOS is simulators only — a physical iPhone needs a signing team set in iosApp/Configuration/Config.xcconfig,
# which is Xcode's job. A debug build talks to whatever apps/<app>-mobile/secrets.properties points at.
set -euo pipefail

APP="${1:-}"
PLATFORM="${2:-}"
case "$APP" in customer | driver) ;; *) echo "usage: $0 <customer|driver> <ios|android>" >&2; exit 2 ;; esac
case "$PLATFORM" in ios | android) ;; *) echo "usage: $0 <customer|driver> <ios|android>" >&2; exit 2 ;; esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/apps/$APP-mobile"
APP_ID="com.effyshopping.$APP.mobile"
DEVICE="${DEVICE:-}"

bold() { printf '\033[1m%s\033[0m\n' "$*" >&2; }
info() { printf '\033[36m▸\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$APP_DIR/secrets.properties" ] ||
  fail "apps/$APP-mobile/secrets.properties is missing — copy secrets.properties.example and fill it from 'make output ENV=dev'."

# --- the picker ------------------------------------------------------------------------------------
# LABELS[i] is what is shown, KEYS[i] what DEVICE= may match. Sets CHOICE to the picked index.
LABELS=()
KEYS=()
CHOICE=0

pick() {
  local n=${#LABELS[@]} i
  [ "$n" -gt 0 ] || fail "nothing to run on — see the message above."

  if [ -n "$DEVICE" ]; then
    for i in "${!LABELS[@]}"; do
      case "${KEYS[$i]} ${LABELS[$i]}" in *"$DEVICE"*) CHOICE=$i; info "DEVICE=$DEVICE → ${LABELS[$i]}"; return ;; esac
    done
    fail "no device matches DEVICE=\"$DEVICE\". Run without DEVICE to see the list."
  fi

  if ! { [ -r /dev/tty ] && : </dev/tty; } 2>/dev/null; then
    printf '  %s\n' "${LABELS[@]}" >&2
    fail "no terminal to choose in — pass DEVICE=\"<name>\"."
  fi

  local cur=0 key rest
  draw() {
    for i in "${!LABELS[@]}"; do
      if [ "$i" -eq "$cur" ]; then
        printf '\033[2K  \033[36m❯ %d. %s\033[0m\n' "$((i + 1))" "${LABELS[$i]}" >/dev/tty
      else
        printf '\033[2K    %d. %s\n' "$((i + 1))" "${LABELS[$i]}" >/dev/tty
      fi
    done
  }
  printf '\033[2m  ↑/↓ to move · Enter to run · 1–9 to pick · q to cancel\033[0m\n' >/dev/tty
  tput civis >/dev/tty 2>/dev/null || true
  trap 'tput cnorm >/dev/tty 2>/dev/null || true' EXIT
  draw
  while IFS= read -rsn1 key </dev/tty; do
    case "$key" in
      $'\x1b')
        read -rsn2 -t 1 rest </dev/tty || rest=""
        case "$rest" in '[A') cur=$(((cur - 1 + n) % n)) ;; '[B') cur=$(((cur + 1) % n)) ;; esac ;;
      k) cur=$(((cur - 1 + n) % n)) ;;
      j) cur=$(((cur + 1) % n)) ;;
      [1-9]) if [ "$key" -le "$n" ]; then cur=$((key - 1)); printf '\033[%dA' "$n" >/dev/tty; draw; break; fi ;;
      q | Q) tput cnorm >/dev/tty 2>/dev/null || true; echo >&2; fail "cancelled." ;;
      '') break ;;
    esac
    printf '\033[%dA' "$n" >/dev/tty
    draw
  done
  tput cnorm >/dev/tty 2>/dev/null || true
  CHOICE=$cur
}

# --- Android ---------------------------------------------------------------------------------------
run_android() {
  local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
  local emulator="$sdk/emulator/emulator"
  local adb
  adb="$(command -v adb || true)"
  [ -n "$adb" ] || adb="$sdk/platform-tools/adb"
  [ -x "$adb" ] || fail "adb not found — install the Android SDK platform-tools (or set ANDROID_HOME)."
  "$adb" start-server >/dev/null 2>&1 || true

  local serials=() running_avds="" serial name state
  # What is already connected: running emulators (by their AVD name) and phones (by model).
  while read -r serial state _; do
    [ "$state" = "device" ] || continue
    if [ "${serial#emulator-}" != "$serial" ]; then
      name="$("$adb" -s "$serial" emu avd name 2>/dev/null | head -1 | tr -d '\r')"
      running_avds="$running_avds|$name|"
      LABELS+=("● $name — running ($serial)")
    else
      name="$("$adb" -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
      LABELS+=("● ${name:-Android phone} — connected by USB ($serial)")
    fi
    KEYS+=("$serial $name")
    serials+=("$serial")
  done < <("$adb" devices | tail -n +2)

  # What can be started.
  if [ -x "$emulator" ]; then
    while read -r name; do
      [ -n "$name" ] || continue
      case "$running_avds" in *"|$name|"*) continue ;; esac
      LABELS+=("○ $name — start this emulator")
      KEYS+=("$name")
      serials+=("avd:$name")
    done < <("$emulator" -list-avds 2>/dev/null)
  fi
  [ ${#LABELS[@]} -gt 0 ] || fail "no emulator and no phone — create one in Android Studio › Device Manager."

  bold "Run the $APP app on which Android device?"
  pick
  serial="${serials[$CHOICE]}"

  if [ "${serial#avd:}" != "$serial" ]; then
    name="${serial#avd:}"
    info "starting the $name emulator…"
    local before
    before="$("$adb" devices | awk 'NR>1 && /^emulator-/{print $1}' | sort)"
    nohup "$emulator" -avd "$name" >/dev/null 2>&1 &
    serial=""
    for _ in $(seq 1 90); do
      sleep 2
      serial="$(comm -13 <(echo "$before") <("$adb" devices | awk 'NR>1 && /^emulator-/{print $1}' | sort) | head -1)"
      [ -n "$serial" ] && break
    done
    [ -n "$serial" ] || fail "the emulator did not appear within 3 minutes."
    info "waiting for $name to finish booting ($serial)…"
    "$adb" -s "$serial" wait-for-device
    until [ "$("$adb" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
  fi

  info "building and installing the debug build on $serial…"
  (cd "$APP_DIR" && ANDROID_SERIAL="$serial" ./gradlew :androidApp:installDebug)
  info "launching $APP_ID…"
  "$adb" -s "$serial" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null
  bold "✓ the $APP app is running on $serial"
}

# --- iOS -------------------------------------------------------------------------------------------
# xcodebuild prints thousands of lines; show one line per stage, the Gradle tasks that build the Kotlin
# framework (the slow part), a running count of compiled files, and every error or warning that stops it.
ios_progress() {
  awk '
    function stage(s) { if (s != last) { if (n >= 50) { printf "\n" > "/dev/stderr" }; n = 0; printf "  \033[2m%s\033[0m\n", s > "/dev/stderr"; last = s; fflush("/dev/stderr") } }
    /^Resolve Package Graph/                 { stage("resolving Swift packages…") ; next }
    /^Fetching from|^Cloning |Fetching /     { stage("downloading Swift packages (first build only)…") ; next }
    /^Computing version|^Creating working copy|^Checking out/ { stage("checking out Swift packages…") ; next }
    /^> Task :shared:/                        { sub(/^> Task :shared:/, ""); printf "  \033[2mKotlin: %s\033[0m\n", $0 > "/dev/stderr"; fflush("/dev/stderr"); next }
    /^PhaseScriptExecution .*Kotlin/ { stage("compiling the Kotlin framework (slowest step)…") ; next }
    /^(CompileSwift|SwiftCompile|CompileC) / { stage("compiling Swift and C sources…"); n++; if (n % 50 == 0) { printf "\r  \033[2m  %d files\033[0m", n > "/dev/stderr"; fflush("/dev/stderr") } ; next }
    /^Ld |^Link /                            { stage("linking…") ; next }
    /^CodeSign /                             { stage("signing…") ; next }
    /error:|^e: |FAILURE:|BUILD FAILED/      { print > "/dev/stderr"; fflush("/dev/stderr"); next }
    /\*\* BUILD SUCCEEDED/                    { stage("build succeeded") ; next }
  '
}

run_ios() {
  command -v xcrun >/dev/null || fail "Xcode is not installed (xcrun not found)."

  local udids=() udid name runtime state
  # Booted simulators first, then the rest; iOS runtimes only.
  while IFS='|' read -r udid name runtime state; do
    [ -n "$udid" ] || continue
    if [ "$state" = "Booted" ]; then LABELS+=("● $name — $runtime, open"); else LABELS+=("○ $name — $runtime"); fi
    KEYS+=("$udid $name")
    udids+=("$udid")
  done < <(xcrun simctl list devices available -j | /usr/bin/python3 -c '
import json, sys
rows = []
for runtime, devices in json.load(sys.stdin)["devices"].items():
    if ".iOS-" not in runtime:
        continue
    version = runtime.rsplit(".", 1)[-1].replace("iOS-", "iOS ").replace("-", ".")
    for d in devices:
        rows.append((d["state"] != "Booted", d["name"].startswith("iPad"), d["name"], d["udid"], version, d["state"]))
for _, _, name, udid, version, state in sorted(rows):
    print("|".join([udid, name, version, state]))
')
  [ ${#LABELS[@]} -gt 0 ] || fail "no iOS simulators — add one in Xcode › Window › Devices and Simulators."

  bold "Run the $APP app on which simulator?"
  pick
  udid="${udids[$CHOICE]}"

  info "opening the simulator…"
  xcrun simctl boot "$udid" 2>/dev/null || true
  open -a Simulator --args -CurrentDeviceUDID "$udid"
  xcrun simctl bootstatus "$udid" -b >/dev/null

  # Xcode's own DerivedData, so a build already made in Xcode (its Swift packages, its Kotlin framework) is reused.
  local project="$APP_DIR/iosApp/iosApp.xcodeproj"
  local dest="platform=iOS Simulator,id=$udid"
  local log="$APP_DIR/build/ios-build.log"
  mkdir -p "$(dirname "$log")"
  info "building the iOS app — the first build fetches the Swift packages and compiles the Kotlin framework (10+ minutes); later ones are quick."
  info "full log: ${log#$ROOT/}"
  local start=$SECONDS
  if ! xcodebuild \
    -project "$project" -scheme iosApp -configuration Debug -destination "$dest" \
    build 2>&1 | tee "$log" | ios_progress; then
    echo >&2
    grep -E "error:|\*\* BUILD FAILED|FAILURE:|> Task .*FAILED|e: " "$log" | head -20 >&2 || true
    fail "the iOS build failed — the lines above, or the full log at ${log#$ROOT/}."
  fi
  info "built in $(((SECONDS - start) / 60))m $(((SECONDS - start) % 60))s"

  local products app
  products="$(xcodebuild -project "$project" -scheme iosApp -configuration Debug -destination "$dest" \
    -showBuildSettings 2>/dev/null | awk -F' = ' '
      /^Build settings for action build and target / { mine = ($0 ~ /target iosApp:$/) }
      mine && / TARGET_BUILD_DIR = / { d = $2 }
      mine && / FULL_PRODUCT_NAME = / { n = $2 }
      END { print d "/" n }')"
  app="$products"
  [ -d "$app" ] || fail "the build finished but no app was found at $app."
  local bundle
  bundle="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")"

  info "installing $(basename "$app")…"
  xcrun simctl install "$udid" "$app"
  info "launching $bundle…"
  xcrun simctl launch "$udid" "$bundle" >/dev/null
  bold "✓ the $APP app is running on the simulator"
}

"run_$PLATFORM"
