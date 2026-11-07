#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "Usage: $0 <signed-supreme.apk>" >&2
  exit 2
fi

APK="$1"
APKSIGNER="${APKSIGNER:-apksigner}"
if ! command -v "$APKSIGNER" >/dev/null 2>&1; then
  echo "apksigner not found. Install Android SDK build-tools or set APKSIGNER." >&2
  exit 127
fi

VERIFY_OUTPUT="$("$APKSIGNER" verify --verbose --print-certs "$APK" 2>&1)" || {
  printf '%s\n' "$VERIFY_OUTPUT" >&2
  echo "APK signature verification failed." >&2
  exit 1
}

printf '%s\n' "$VERIFY_OUTPUT"
DIGEST="$(printf '%s\n' "$VERIFY_OUTPUT" | sed -nE 's/.*Signer #1 certificate SHA-256 digest: ([[:xdigit:]]{64}).*/\1/p' | head -n1)"
if [[ ! "$DIGEST" =~ ^[[:xdigit:]]{64}$ ]]; then
  echo "Could not extract a single signer SHA-256 digest. Inspect apksigner output manually." >&2
  exit 1
fi

printf '\nProduction signer SHA-256 (lowercase, no separators):\n%s\n' "${DIGEST,,}"
echo "Use this value only after confirming this APK was signed with the permanent production upload key."
