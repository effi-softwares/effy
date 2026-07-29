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
# Both KMP apps are guarded — customer-mobile (013) and shop-mobile (014). The rules are identical: no
# escape hatch, no secret-shaped config key. (Shop is EMAIL_OTP-only, so it never even writes a password
# — but the escape hatch would still hand out the raw Cognito client, so the ban holds all the same.)
# Run: make mobile-guard   ·   scripts/mobile-guard.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS="apps/customer-mobile apps/shop-mobile"
FAIL=0

for REL in $APPS; do
  APP="$ROOT/$REL"
  [ -d "$APP" ] || continue

  # ── 1. Escape-hatch ban ────────────────────────────────────────────────────────────────────────
  # Forbidden anywhere under the app's Kotlin/Swift sources. Allowlist is intentionally empty.
  ESCAPE_PATTERN='escapeHatch|getEscapeHatch|cognitoidentityprovider|CognitoIdentityProviderClient'
  HITS="$(grep -rInE "$ESCAPE_PATTERN" \
      --include='*.kt' --include='*.swift' \
      --exclude-dir=build --exclude-dir='.gradle' --exclude-dir=DerivedData \
      "$APP" 2>/dev/null || true)"
  if [ -n "$HITS" ]; then
    echo "✗ mobile-guard [$REL]: FORBIDDEN Amplify escape-hatch / raw Cognito SDK reference (FR-024):"
    echo "$HITS" | sed 's/^/    /'
    echo "    Password writes MUST go to the backend. There is no allowed use of the escape hatch."
    FAIL=1
  fi

  # ── 2. No secret-shaped required config key (FR-042/FR-036) ─────────────────────────────────────
  # Extract the `requiredKeys` list from build.gradle.kts and reject any credential-shaped name.
  GRADLE="$APP/build.gradle.kts"
  if [ -f "$GRADLE" ]; then
    # Pull quoted identifiers from the requiredKeys = listOf( … ) block.
    KEYS="$(awk '/val requiredKeys/{f=1} f{print} /\)/{if(f)f=0}' "$GRADLE" \
            | grep -oE '"[A-Z0-9_]+"' | tr -d '"' || true)"
    # STRIPE_PUBLISHABLE_KEY is the ONE allowed `_KEY`-named value: a Stripe publishable key (pk_…) is
    # designed to ship in clients and authorizes nothing (the sk_… secret stays in core-api — 019 R3).
    BAD="$(printf '%s\n' "$KEYS" | grep -iE 'SECRET|_KEY$|^KEY|PASSWORD|TOKEN|CREDENTIAL' \
            | grep -vxE 'STRIPE_PUBLISHABLE_KEY' || true)"
    if [ -n "$BAD" ]; then
      echo "✗ mobile-guard [$REL]: a required build-config key is SECRET-SHAPED (FR-042):"
      printf '%s\n' "$BAD" | sed 's/^/    /'
      echo "    A mobile binary is published; nothing credentialed may ship in it. Pool/client IDs are"
      echo "    NAMES, not keys — but anything matching SECRET/KEY/PASSWORD/TOKEN/CREDENTIAL is refused."
      FAIL=1
    fi
  fi
done

# ── 3. Shop UI reset: retired presentation must not return (018 FR-028/SC-009) ─────────────────────
SHOP_APP="$ROOT/apps/shop-mobile"
RETIRED_SHOP_FILES="
$SHOP_APP/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/catalog/presentation/CatalogListScreens.kt
$SHOP_APP/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/catalog/presentation/ProductDetailScreens.kt
$SHOP_APP/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/catalog/presentation/ProductCreateSheet.kt
"
for RETIRED_FILE in $RETIRED_SHOP_FILES; do
  if [ -e "$RETIRED_FILE" ]; then
    echo "✗ mobile-guard [apps/shop-mobile]: retired UI file returned: ${RETIRED_FILE#"$ROOT/"}"
    FAIL=1
  fi
done

RETIRED_SHOP_PATTERN='CatalogProductRoute|CatalogListScreen|ProductDetailScreen|ProductCreateSheet|ModalBottomSheet|NavGlyph'
RETIRED_SHOP_HITS="$(grep -rInE "$RETIRED_SHOP_PATTERN" \
  --include='*.kt' --include='*.swift' \
  --exclude-dir=build --exclude-dir='.gradle' --exclude-dir=DerivedData \
  "$SHOP_APP/shared/src/commonMain/kotlin" \
  "$SHOP_APP/shared/src/androidMain/kotlin" \
  "$SHOP_APP/shared/src/iosMain/kotlin" \
  "$SHOP_APP/androidApp/src" "$SHOP_APP/iosApp" 2>/dev/null || true)"
if [ -n "$RETIRED_SHOP_HITS" ]; then
  echo "✗ mobile-guard [apps/shop-mobile]: retired presentation symbol returned (018 FR-028):"
  echo "$RETIRED_SHOP_HITS" | sed 's/^/    /'
  FAIL=1
fi

# ── 025 SC-006: the customer app must never regrow its "unfinished app" tells ───────────────────
#
# Three of the four SC-006 signals are greppable, so they get a permanent guard rather than a one-off
# sweep at sign-off. The fourth (spinner-only first loads) is not reliably detectable by pattern and
# stays a review item.
#
#   NavGlyph / AdaptiveNavShell — the lettered "H/S/O/A" navigation icons. The component is DELETED
#                                 from packages/mobile-kit, so a reference means someone reintroduced it.
#   "← Back"                    — an improvised text-link back control instead of a real header.
#   ♥ / ♡ in a Text(...)        — glyph-as-icon buttons.
CUSTOMER_APP="$ROOT/apps/customer-mobile"
RETIRED_CUSTOMER_PATTERN='NavGlyph|AdaptiveNavShell|Text\("← Back"\)|Text\("♥|Text\("♡'
# ⚠ Comment lines are filtered out. The first version of this guard did not, and it failed on the
# CODE COMMENT that explains why the lettered glyphs were removed — a guard that forbids naming the
# thing it forbids makes the codebase harder to explain, and trains people to delete the explanation
# rather than the defect. Matching only non-comment lines keeps it aimed at usage.
RETIRED_CUSTOMER_HITS="$(grep -rInE "$RETIRED_CUSTOMER_PATTERN" \
  --include='*.kt' --include='*.swift' \
  --exclude-dir=build --exclude-dir='.gradle' --exclude-dir=DerivedData \
  "$CUSTOMER_APP/shared/src" \
  "$CUSTOMER_APP/androidApp/src" "$CUSTOMER_APP/iosApp" 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+: *(//|\*|/\*)' || true)"
if [ -n "$RETIRED_CUSTOMER_HITS" ]; then
  echo "✗ mobile-guard [apps/customer-mobile]: retired presentation returned (025 SC-006):"
  echo "$RETIRED_CUSTOMER_HITS" | sed 's/^/    /'
  FAIL=1
fi

# ── 026 (T044 / contracts S4) — affordances the SOURCE DESIGN has that Effy must NOT ──────────────
#
# The customer app was rebuilt against a fashion-catalogue UI kit. Four of that kit's affordances are
# forbidden here, and each is something a well-meaning "match the mockup" edit would plausibly add
# back. This lives in the guard rather than in a Kotlin test on purpose: `commonTest` has no
# filesystem access on Native, so a multiplatform test could only assert against a hand-maintained
# list of sources — which is a blind spot pretending to be a check. Grepping the real tree catches a
# reintroduction in a screen nobody remembered to add to a list.
#
#   size pickers      — FR-007: the kit is apparel, Effy is groceries.
#   ratings/reviews   — FR-029: no such capability; invented stars would be a lie on every tile.
#   Facebook sign-in  — FR-030a: not an Effy credential route.
#   card-entry fields — FR-030: the payment provider's sheet owns these, and card data must never
#                       land in this app.
EXCLUDED_PATTERN='Choose size|Select size|Text\("Size |out of 5|Write a review|Facebook|Card number|CVV|Cardholder'
EXCLUDED_HITS="$(grep -rInE "$EXCLUDED_PATTERN" \
  --include='*.kt' --include='*.swift' \
  --exclude-dir=build --exclude-dir='.gradle' --exclude-dir=DerivedData \
  "$CUSTOMER_APP/shared/src" \
  "$CUSTOMER_APP/androidApp/src" "$CUSTOMER_APP/iosApp" 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+: *(//|\*|/\*)' || true)"
if [ -n "$EXCLUDED_HITS" ]; then
  echo "✗ mobile-guard [apps/customer-mobile]: an EXCLUDED source-design affordance returned (026 S4):"
  echo "$EXCLUDED_HITS" | sed 's/^/    /'
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "✓ mobile-guard: auth/config clean; retired presentation and excluded affordances both absent."
fi
exit "$FAIL"
