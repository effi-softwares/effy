#!/usr/bin/env bash
# 013 mobile guard — the KMP equivalent of 011's Amplify quarantine (research D8).
#
# Two build-failing checks for apps/customer-mobile:
#
#   1. THE ESCAPE-HATCH BAN (FR-024). Amplify's `escapeHatch` / `getEscapeHatch` hands out the raw
#      CognitoIdentityProviderClient, from which `ChangePassword` can be called WITHOUT a previous
#      password — the account-takeover primitive the whole slice exists to close, and one IAM cannot
#      stop. Password writes go to the BACKEND (which verifies an emailed step-up in the same
#      request). So touching the escape hatch — or importing the raw Cognito SDK — is a BUILD FAILURE,
#      not a code-review catch. The allowlist is empty on purpose.
#
#   2. THE NO-SECRET-KEY CHECK (FR-042). A user-pool id / app-client id is a NAME, not a key — it
#      authorizes nothing. But a mobile binary is a published artifact: anything credentialed in it is
#      a leaked credential. So no BuildKonfig required-key name may look like a secret.
#
# Proven by DELIBERATELY breaking it (the 011 lesson: break a guard the way it will actually break).
# Run: make mobile-guard   ·   scripts/mobile-guard.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/apps/customer-mobile"
FAIL=0

# ── 1. Escape-hatch ban ──────────────────────────────────────────────────────────────────────────
# Forbidden anywhere under the app's Kotlin/Swift sources. Allowlist is intentionally empty.
ESCAPE_PATTERN='escapeHatch|getEscapeHatch|cognitoidentityprovider|CognitoIdentityProviderClient'
if [ -d "$APP" ]; then
  # Search Kotlin + Swift source; ignore build output and this guard's own fixtures.
  HITS="$(grep -rInE "$ESCAPE_PATTERN" \
      --include='*.kt' --include='*.swift' \
      --exclude-dir=build --exclude-dir='.gradle' --exclude-dir=DerivedData \
      "$APP" 2>/dev/null || true)"
  if [ -n "$HITS" ]; then
    echo "✗ mobile-guard: FORBIDDEN Amplify escape-hatch / raw Cognito SDK reference (FR-024):"
    echo "$HITS" | sed 's/^/    /'
    echo "    Password writes MUST go to the backend. There is no allowed use of the escape hatch."
    FAIL=1
  fi
fi

# ── 2. No secret-shaped required config key (FR-042) ───────────────────────────────────────────────
# Extract the `requiredKeys` list from build.gradle.kts and reject any credential-shaped name.
GRADLE="$APP/build.gradle.kts"
if [ -f "$GRADLE" ]; then
  # Pull quoted identifiers from the requiredKeys = listOf( … ) block.
  KEYS="$(awk '/val requiredKeys/{f=1} f{print} /\)/{if(f)f=0}' "$GRADLE" \
          | grep -oE '"[A-Z0-9_]+"' | tr -d '"' || true)"
  BAD="$(printf '%s\n' "$KEYS" | grep -iE 'SECRET|_KEY$|^KEY|PASSWORD|TOKEN|CREDENTIAL' || true)"
  if [ -n "$BAD" ]; then
    echo "✗ mobile-guard: a required build-config key is SECRET-SHAPED (FR-042):"
    printf '%s\n' "$BAD" | sed 's/^/    /'
    echo "    A mobile binary is published; nothing credentialed may ship in it. Pool/client IDs are"
    echo "    NAMES, not keys — but anything matching SECRET/KEY/PASSWORD/TOKEN/CREDENTIAL is refused."
    FAIL=1
  fi
fi

if [ "$FAIL" -eq 0 ]; then
  echo "✓ mobile-guard: escape-hatch ban clean; no secret-shaped config keys."
fi
exit "$FAIL"
