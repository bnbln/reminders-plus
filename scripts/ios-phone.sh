#!/usr/bin/env bash
set -euo pipefail

# Allow overriding from shell for multi-device setups.
DEVICE_ID="${IOS_DEVICE_ID:-}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_PATH="${PROJECT_ROOT}/ios/reminds.xcworkspace"
PROJECT_FILE_PATH="${PROJECT_ROOT}/ios/reminds.xcodeproj/project.pbxproj"
SCHEME_NAME="${IOS_SCHEME:-reminds}"
CONFIGURATION_NAME="${IOS_CONFIGURATION:-Debug}"
TEAM_ID="${IOS_TEAM_ID:-}"
LOG_PATH="${PROJECT_ROOT}/.expo/xcodebuild.log"
ERROR_LOG_PATH="${PROJECT_ROOT}/.expo/xcodebuild-error.log"

if [[ -z "${DEVICE_ID}" ]]; then
  DEVICE_ID="$(
    xcrun xcdevice list 2>/dev/null \
      | /usr/bin/python3 -c '
import json, sys
try:
    devices = json.load(sys.stdin)
except Exception:
    print("", end="")
    raise SystemExit(0)
for d in devices:
    if d.get("simulator"):
        continue
    if not d.get("available", False):
        continue
    platform = str(d.get("platform", ""))
    if "iphoneos" not in platform and "ios" not in platform:
        continue
    ident = d.get("identifier", "")
    if ident:
        print(ident, end="")
        break
'
  )"
fi

if [[ -z "${DEVICE_ID}" ]]; then
  # Fallback for environments where xcdevice JSON is unavailable.
  DEVICE_ID="$(
    xcrun xctrace list devices 2>/dev/null \
      | awk -F '[()]' '/(iPhone|iPad)/ && $0 !~ /Simulator/ && $0 !~ /Mac/ { print $NF; exit }'
  )"
fi

if [[ -z "${DEVICE_ID}" ]]; then
  echo "Kein physisches iOS-Gerät gefunden. Bitte iPhone/iPad verbinden und entsperren."
  echo "Optional: IOS_DEVICE_ID setzen, z.B. IOS_DEVICE_ID=<UDID> npm run phone"
  exit 1
fi

if [[ ! -d "${WORKSPACE_PATH}" ]]; then
  echo "Workspace nicht gefunden: ${WORKSPACE_PATH}"
  echo "Führe zuerst einmal 'npx expo prebuild -p ios' aus."
  exit 1
fi

AVAILABLE_TEAMS="$(
  security find-identity -v -p codesigning 2>/dev/null \
    | /usr/bin/python3 -c '
import re, sys
teams = []
for line in sys.stdin:
    match = re.search(r"\(([A-Z0-9]{10})\)\s*$", line.strip())
    if not match:
        continue
    team = match.group(1)
    if team not in teams:
        teams.append(team)
print("\n".join(teams), end="")
'
)"

if [[ -z "${TEAM_ID}" ]]; then
  TEAM_COUNT="$(printf '%s\n' "${AVAILABLE_TEAMS}" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "${TEAM_COUNT}" == "1" ]]; then
    TEAM_ID="$(printf '%s\n' "${AVAILABLE_TEAMS}" | sed -n '1p')"
  elif [[ "${TEAM_COUNT}" -gt 1 ]]; then
    echo "Mehrere Apple-Teams gefunden:"
    printf '%s\n' "${AVAILABLE_TEAMS}" | sed '/^$/d' | sed 's/^/  - /'
    echo "Bitte Team wählen:"
    echo "  IOS_TEAM_ID=<DEIN_TEAM_ID> npm run phone"
    exit 1
  fi
fi

if [[ -z "${TEAM_ID}" && -f "${PROJECT_FILE_PATH}" ]]; then
  TEAM_ID="$(
    awk -F' = ' '/DEVELOPMENT_TEAM = / {gsub(/;$/, "", $2); print $2; exit}' "${PROJECT_FILE_PATH}"
  )"
fi

if [[ -z "${TEAM_ID}" ]]; then
  echo "Kein Apple-Team gefunden."
  echo "Setze dein Team explizit und versuche erneut:"
  echo "  IOS_TEAM_ID=<DEIN_TEAM_ID> npm run phone"
  echo "Falls nötig: Xcode > Settings > Accounts anmelden und Zertifikate aktualisieren."
  exit 1
fi

IDENTITY_COUNT="$(security find-identity -v -p codesigning 2>/dev/null | awk '/valid identities found/ {print $1}')"
if [[ -z "${IDENTITY_COUNT}" ]]; then
  IDENTITY_COUNT="0"
fi
if [[ "${IDENTITY_COUNT}" == "0" ]]; then
  echo "Warnung: Keine lokale Code-Signing-Identität gefunden."
  echo "Xcode kann sie bei aktivem Account meist automatisch anlegen."
fi

mkdir -p "${PROJECT_ROOT}/.expo"
rm -f "${LOG_PATH}" "${ERROR_LOG_PATH}"

echo "Using iOS device: ${DEVICE_ID}"
echo "Using team: ${TEAM_ID}"
echo "Building ${SCHEME_NAME} (${CONFIGURATION_NAME}) ..."

set +e
xcodebuild \
  -workspace "${WORKSPACE_PATH}" \
  -configuration "${CONFIGURATION_NAME}" \
  -scheme "${SCHEME_NAME}" \
  -destination "id=${DEVICE_ID}" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  -quiet \
  DEVELOPMENT_TEAM="${TEAM_ID}" \
  1> >(tee "${LOG_PATH}") \
  2> >(tee "${ERROR_LOG_PATH}" >&2)
BUILD_EXIT_CODE=$?
set -e

if [[ ${BUILD_EXIT_CODE} -ne 0 ]]; then
  echo ""
  echo "Build fehlgeschlagen (Exit ${BUILD_EXIT_CODE})."
  echo "Logs:"
  echo "  ${LOG_PATH}"
  echo "  ${ERROR_LOG_PATH}"
  exit ${BUILD_EXIT_CODE}
fi

BUILD_SETTINGS="$(
  xcodebuild \
    -workspace "${WORKSPACE_PATH}" \
    -configuration "${CONFIGURATION_NAME}" \
    -scheme "${SCHEME_NAME}" \
    -destination "id=${DEVICE_ID}" \
    -showBuildSettings 2>/dev/null
)"
TARGET_BUILD_DIR="$(printf '%s\n' "${BUILD_SETTINGS}" | awk -F' = ' '/ TARGET_BUILD_DIR = / {print $2; exit}')"
FULL_PRODUCT_NAME="$(printf '%s\n' "${BUILD_SETTINGS}" | awk -F' = ' '/ FULL_PRODUCT_NAME = / {print $2; exit}')"
PRODUCT_BUNDLE_IDENTIFIER="$(printf '%s\n' "${BUILD_SETTINGS}" | awk -F' = ' '/ PRODUCT_BUNDLE_IDENTIFIER = / {print $2; exit}')"
APP_PATH="${TARGET_BUILD_DIR}/${FULL_PRODUCT_NAME}"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "Build war erfolgreich, aber App-Bundle nicht gefunden: ${APP_PATH}"
  exit 1
fi

echo "Installing ${APP_PATH} ..."
xcrun devicectl device install app --device "${DEVICE_ID}" "${APP_PATH}"

if [[ -n "${PRODUCT_BUNDLE_IDENTIFIER}" ]]; then
  echo "Launching ${PRODUCT_BUNDLE_IDENTIFIER} ..."
  xcrun devicectl device process launch --device "${DEVICE_ID}" --terminate-existing "${PRODUCT_BUNDLE_IDENTIFIER}" || true
fi

echo "Done."
