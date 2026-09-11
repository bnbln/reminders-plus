#!/usr/bin/env bash
set -euo pipefail

# Boots the Android emulator (self-healing against corrupted quick-boot
# snapshots, which crash netsimd on boot) and optionally runs the app.
#
#   npm run android            -> boot emulator (if needed) + expo run:android
#   npm run android:emulator   -> boot emulator (if needed) only
#
# Overrides:
#   ANDROID_AVD=<name>         AVD to boot (default: Pixel_10_Pro)
#   ANDROID_HOME=<path>        Android SDK location
#   JAVA_HOME=<path>           JDK for Gradle (default: brew openjdk@17)
#   REACT_NATIVE_ARCHITECTURES arm64-v8a by default, to skip building the
#                               other three ABIs on every local build

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

BOOT_ONLY=0
ARGS=()
for arg in "$@"; do
  if [[ "${arg}" == "--boot-only" ]]; then
    BOOT_ONLY=1
  else
    ARGS+=("${arg}")
  fi
done

# --- Android SDK -----------------------------------------------------------

ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
if [[ ! -d "${ANDROID_HOME}" ]]; then
  echo "Android SDK nicht gefunden unter: ${ANDROID_HOME}"
  echo "Setze ANDROID_HOME oder installiere den SDK über Android Studio."
  exit 1
fi
export ANDROID_HOME
export ANDROID_SDK_ROOT="${ANDROID_HOME}"

EMULATOR_BIN="${ANDROID_HOME}/emulator/emulator"
ADB="${ANDROID_HOME}/platform-tools/adb"

if [[ ! -x "${EMULATOR_BIN}" || ! -x "${ADB}" ]]; then
  echo "emulator/adb nicht gefunden unter ${ANDROID_HOME}."
  echo "Installiere 'Android Emulator' und 'Platform-Tools' über den SDK Manager."
  exit 1
fi

# --- JDK (Android Studio's bundled JBR is JDK 25, unsupported by the ---
# --- Gradle 9.0 wrapper this project's Expo SDK template writes) -----------

if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME}/bin/java" ]]; then
  if [[ -x "/opt/homebrew/opt/openjdk@17/bin/java" ]]; then
    JAVA_HOME="/opt/homebrew/opt/openjdk@17"
  else
    echo "Kein passendes JDK gefunden (Android Studios JBR ist JDK 25, Gradle 9.0 braucht <= 24)."
    echo "Installiere JDK 17: brew install openjdk@17"
    exit 1
  fi
fi
export JAVA_HOME
export PATH="${JAVA_HOME}/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${PATH}"
export ORG_GRADLE_PROJECT_reactNativeArchitectures="${REACT_NATIVE_ARCHITECTURES:-arm64-v8a}"

# --- AVD ---------------------------------------------------------------

AVD_NAME="${ANDROID_AVD:-Pixel_10_Pro}"
if ! "${EMULATOR_BIN}" -list-avds | grep -qx "${AVD_NAME}"; then
  echo "AVD '${AVD_NAME}' nicht gefunden. Verfügbare AVDs:"
  "${EMULATOR_BIN}" -list-avds
  echo "Setze ANDROID_AVD=<Name>, um ein anderes AVD zu verwenden."
  exit 1
fi

mkdir -p "${PROJECT_ROOT}/.expo"
LOG_FILE="${PROJECT_ROOT}/.expo/emulator.log"

is_emulator_up() {
  "${ADB}" devices | grep -q "^emulator-.*device$"
}

wait_boot_completed() {
  local timeout="$1" waited=0
  while (( waited < timeout )); do
    if [[ "$("${ADB}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; then
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  return 1
}

boot_emulator() {
  echo "Starte Emulator '${AVD_NAME}'${1:+ ($1)}..."
  # shellcheck disable=SC2086
  nohup "${EMULATOR_BIN}" -avd "${AVD_NAME}" -netdelay none -netspeed full ${EXTRA_BOOT_ARGS:-} \
    > "${LOG_FILE}" 2>&1 &
  EMU_PID=$!
  disown
}

if is_emulator_up; then
  echo "Emulator läuft bereits ($(${ADB} devices | awk '/^emulator-/{print $1; exit}'))."
else
  EXTRA_BOOT_ARGS="" boot_emulator "quick boot"

  BOOTED=0
  for _ in $(seq 1 45); do
    if ! kill -0 "${EMU_PID}" 2>/dev/null; then
      echo "Emulator-Prozess ist beim Booten abgestürzt (vermutlich ein beschädigter Quick-Boot-Snapshot)."
      break
    fi
    if is_emulator_up; then
      BOOTED=1
      break
    fi
    sleep 2
  done

  if [[ "${BOOTED}" != "1" ]]; then
    echo "Falle zurück auf einen sauberen Cold-Boot (Daten werden zurückgesetzt)..."
    EXTRA_BOOT_ARGS="-no-snapshot -wipe-data" boot_emulator "cold boot, wipe-data"

    for _ in $(seq 1 60); do
      if is_emulator_up; then
        BOOTED=1
        break
      fi
      if ! kill -0 "${EMU_PID}" 2>/dev/null; then
        echo "Emulator ist auch beim Cold-Boot abgestürzt. Log: ${LOG_FILE}"
        exit 1
      fi
      sleep 2
    done

    if [[ "${BOOTED}" != "1" ]]; then
      echo "Timeout beim Warten auf den Emulator. Log: ${LOG_FILE}"
      exit 1
    fi
  fi

  wait_boot_completed 90 || echo "Warnung: adb sieht das Gerät, sys.boot_completed wurde aber nicht bestätigt."
fi

if [[ "${BOOT_ONLY}" == "1" ]]; then
  echo "Emulator bereit."
  exit 0
fi

exec npx expo run:android ${ARGS[@]+"${ARGS[@]}"}
