#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/android/supreme-app"
APK="$APP_DIR/app/build/outputs/apk/release/app-release.apk"

: "${SUPREME_PRIVATE_PATH:?Set SUPREME_PRIVATE_PATH to /control- followed by 48 hex characters.}"
: "${SUPREME_KEYSTORE_PATH:?Set SUPREME_KEYSTORE_PATH to your production keystore outside the repository.}"
: "${SUPREME_KEYSTORE_PASSWORD:?Set SUPREME_KEYSTORE_PASSWORD in the environment.}"
: "${SUPREME_KEY_ALIAS:?Set SUPREME_KEY_ALIAS in the environment.}"
: "${SUPREME_KEY_PASSWORD:?Set SUPREME_KEY_PASSWORD in the environment.}"

if [[ ! "$SUPREME_PRIVATE_PATH" =~ ^/control-[A-Fa-f0-9]{48}$ ]]; then
  echo "SUPREME_PRIVATE_PATH must match /control-<48 hex characters>." >&2
  exit 2
fi

KEYSTORE="$(realpath "$SUPREME_KEYSTORE_PATH")"
case "$KEYSTORE" in
  "$REPO_ROOT"/*)
    echo "Production keystore must be stored outside the repository." >&2
    exit 2
    ;;
esac
if [[ ! -f "$KEYSTORE" ]]; then
  echo "Production keystore file does not exist." >&2
  exit 2
fi

if ! command -v gradle >/dev/null 2>&1; then
  echo "Gradle 8.9+ is required. Install it or run the equivalent :app:assembleRelease task in Android Studio." >&2
  exit 127
fi

export SUPREME_KEYSTORE_PATH="$KEYSTORE"
(
  cd "$APP_DIR"
  gradle --no-daemon :app:assembleRelease
)

if [[ ! -f "$APK" ]]; then
  echo "Release APK was not produced at the expected path." >&2
  exit 1
fi

bash "$REPO_ROOT/scripts/security/print-android-signing-cert.sh" "$APK"
echo
echo "Signed release APK: $APK"
echo "Do not configure the server signer allowlist until this fingerprint is independently confirmed as the permanent production key."
