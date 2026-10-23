#!/usr/bin/env bash
# Mobile guard: build-failing checks for apps/customer-mobile.
#
# 1. No escape hatch: Amplify's `escapeHatch` / `getEscapeHatch` hands out the raw Cognito client, whose
# `ChangePassword` works without a previous password (an account-takeover primitive IAM cannot stop).
# Password writes go to the backend. Touching it, or importing the raw Cognito SDK, fails the build; the
# allowlist is empty on purpose.
# 2. No secret-shaped config key: a mobile binary is published, so no BuildKonfig required-key name may look
# like a secret.
#
# Run: make mobile-guard · scripts/mobile-guard.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS="apps/customer-mobile"
FAIL=0

for REL in $APPS; do
  APP="$ROOT/$REL"
  [ -d "$APP" ] || continue

  # ── 1. Escape-hatch ban ────────────────────────────────────────────────────────────────────────
  # forbidden anywhere under the app's Kotlin/Swift sources. Allowlist is intentionally empty.
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

  # ── 2. No secret-shaped required config key ─────────────────────────────────────
  # Extract the `requiredKeys` list from build.gradle.kts and reject any credential-shaped name.
  GRADLE="$APP/build.gradle.kts"
  if [ -f "$GRADLE" ]; then
    # Pull quoted identifiers from the requiredKeys = listOf( … ) block.
    KEYS="$(awk '/val requiredKeys/{f=1} f{print} /\)/{if(f)f=0}' "$GRADLE" \
            | grep -oE '"[A-Z0-9_]+"' | tr -d '"' || true)"
    # STRIPE_PUBLISHABLE_KEY is the one allowed `_KEY`-named value: a Stripe publishable key (pk_…) is
    # designed to ship in clients and authorizes nothing (the sk_… secret stays in the backend — 019 R3).
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

# The customer app never regrows these "unfinished app" tells:
# NavGlyph / AdaptiveNavShell — the lettered "H/S/O/A" navigation icons (deleted from mobile-kit)
# "← Back" — an improvised text-link back control instead of a real header
# ♥ / ♡ in a Text(...) — glyph-as-icon buttons
CUSTOMER_APP="$ROOT/apps/customer-mobile"
RETIRED_CUSTOMER_PATTERN='NavGlyph|AdaptiveNavShell|Text\("← Back"\)|Text\("♥|Text\("♡'
# Comment lines are filtered out. The first version of this guard did not, and it failed on the
# code comment that explains why the lettered glyphs were removed — a guard that forbids naming the
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

# Affordances the source UI kit has that Effy must not. A grep over the real tree, because `commonTest` has
# no filesystem on Native and could only check a hand-kept list.
# size pickers — the kit's fixed S/M/L row; sizes and flavours are the product's own variants
# (`VariantChips`)
# ratings/reviews — no such capability; invented stars would be a lie on every tile
# Facebook sign-in — not an Effy credential route
# card-entry fields — the payment provider's element owns these; card data never lands in this app
EXCLUDED_PATTERN='out of 5|Write a review|Facebook|Card number|CVV|Cardholder'
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

# Every declared destination must be reachable: something outside the navigation package names it (a route
# with an entry that nothing navigates to compiles and passes every test; the cart once was).
NAV_DIR="$CUSTOMER_APP/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/nav"
NAV_KEY_FILE="$NAV_DIR/CustomerNavKey.kt"
UNREACHABLE=""
if [ -f "$NAV_KEY_FILE" ]; then
  # Route names are the `data object Foo` / `data class Foo(` declarations inside CustomerNavKey.
  ROUTES="$(grep -oE '@Serializable *(data )?(object|class) [A-Za-z]+' "$NAV_KEY_FILE" \
    | awk '{print $NF}' | sort -u)"
  for route in $ROUTES; do
    # Reachable = named outside core/nav (a push, a resetTo, a tab list, an entry<> is not enough
    # entries are the destination, not the way in — so entry declarations are excluded below).
    HITS="$(grep -rIn "CustomerNavKey\.$route\b" \
      --include='*.kt' \
      --exclude-dir=build --exclude-dir='.gradle' \
      "$CUSTOMER_APP/shared/src/commonMain" 2>/dev/null \
      | grep -v "^$NAV_DIR/" \
      | grep -vE 'entry<CustomerNavKey\.[A-Za-z]+>' \
      | grep -vE '^[^:]+:[0-9]+: *(//|\*|/\*)' || true)"
    if [ -z "$HITS" ]; then
      UNREACHABLE="$UNREACHABLE$route
"
    fi
  done
fi
if [ -n "$UNREACHABLE" ]; then
  echo "✗ mobile-guard [apps/customer-mobile]: destination declared but UNREACHABLE — nothing"
  echo "  navigates to it, so the screen cannot be opened by any shopper:"
  echo "$UNREACHABLE" | sed '/^$/d; s/^/    CustomerNavKey./'
  echo "  Either give it an entry point, or delete the route and its screen."
  FAIL=1
fi

# No sign-out control on the customer account root (one stray tap ended the session); sign-out lives on
# Security. A guard, because the assertion is an absence.
ACCOUNT_SCREENS="apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/account/presentation/AccountScreens.kt"
if [ -f "$ACCOUNT_SCREENS" ]; then
  # The account root is everything from `fun AccountScreen(` to the next top-level composable.
  ROOT_BODY="$(awk '/^private fun AccountScreen\(/{f=1} f{print} /^@Composable/{if(f && NR>1) c++; if(c>1) exit}' "$ACCOUNT_SCREENS" 2>/dev/null || true)"
  if printf '%s' "$ROOT_BODY" | grep -qE 'vm\.signOut'; then
    echo "✗ mobile-guard [apps/customer-mobile]: a SIGN-OUT control is on the account ROOT."
    echo "  034 FR-007 moved both sign-out actions to the Security screen: on the root they sit one"
    echo "  stray tap away from ordinary navigation, and a tap there ends the session."
    FAIL=1
  fi
fi

# Every declared route has an `entry<CustomerNavKey.X>` in CustomerShell's NavDisplay, or the first tap
# throws `IllegalStateException: Unknown screen X`; serialization and reachability checks both pass without
# it.
NAV_KEYS="apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/nav/CustomerNavKey.kt"
SHELL_FILE="apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/app/CustomerShell.kt"
UNRENDERABLE=""
if [ -f "$NAV_KEYS" ] && [ -f "$SHELL_FILE" ]; then
  ROUTES="$(grep -oE '@Serializable data (object|class) [A-Za-z]+' "$NAV_KEYS" | awk '{print $NF}' | sort -u)"
  for route in $ROUTES; do
    if ! grep -q "entry<CustomerNavKey\.$route>" "$SHELL_FILE"; then
      UNRENDERABLE="$UNRENDERABLE$route
"
    fi
  done
fi
if [ -n "$UNRENDERABLE" ]; then
  echo "✗ mobile-guard [apps/customer-mobile]: route declared but the shell CANNOT RENDER it —"
  echo "  NavDisplay will throw 'Unknown screen' the moment a shopper taps it:"
  echo "$UNRENDERABLE" | sed '/^$/d; s/^/    CustomerNavKey./'
  echo "  Add an entry<CustomerNavKey.X> { … } block in CustomerShell's NavDisplay."
  FAIL=1
fi

# The storefront frame:
# · no centred dialog or drop-down menu anywhere — every overlay is the kit's bottom sheet;
# · no raw Material control that the kit replaces;
# · no colour literal in a screen — colours come from the generated storefront theme;
# · the only Effy address a customer sees is hello@effyshopping.com (the generated legal documents are
# excluded: authored prose, which still names an unapproved address, an open item);
# · the cart and checkout never say how many packages (suppliers) fill an order.
# Comment lines are ignored.
ENFORCE_087=1
CM_SRC="$CUSTOMER_APP/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile"
strip_comments() { grep -vE '^[^:]+:[0-9]+: *(//|\*|/\*)' || true; }
REPORT_087=""
add_087() { if [ -n "$2" ]; then REPORT_087="$REPORT_087
  $1
$(echo "$2" | sed 's/^/    /')"; fi; }

add_087 "a dialog or drop-down menu (use EffySheet / EffyConfirmSheet):" "$(grep -rnE '\bAlertDialog\b|\bDropdownMenu\b|\bBasicAlertDialog\b|(^|[^A-Za-z.])Dialog\(|\bModalBottomSheet\b' --include='*.kt' "$CM_SRC" 2>/dev/null | grep -v 'core/presentation/EffySheet.kt' | strip_comments)"
add_087 "a raw Material control the kit replaces:" "$(grep -rnE '\bOutlinedTextField\(|\bFilterChip\(|\bScrollableTabRow\(|\bBadgedBox\(' --include='*.kt' "$CM_SRC" 2>/dev/null | strip_comments)"
add_087 "a colour literal in a screen (read the theme / EffyRoles):" "$(grep -rnE 'Color\(0x' --include='*.kt' "$CM_SRC/features" "$CM_SRC/app" 2>/dev/null | strip_comments)"
add_087 "an Effy address other than hello@effyshopping.com:" "$(grep -rnoE '[A-Za-z0-9._%+-]+@effyshopping\.com' --include='*.kt' "$CUSTOMER_APP/shared/src" 2>/dev/null | grep -v ':hello@effyshopping\.com$' | grep -v '/features/legal/generated/' | strip_comments)"
add_087 "the cart or checkout says how many packages fill the order (hidden fulfilment):" "$(grep -rnE '"[^"]*\bpackages?\b[^"]*"' --include='*.kt' "$CM_SRC/features/cart/presentation" "$CM_SRC/features/checkout/presentation/CheckoutScreen.kt" 2>/dev/null | strip_comments)"

# Enforced now (not report-only): the cart is a TAB. Pushing it would put a second copy
# of the cart on another tab's stack, with no tab bar under it.
PUSHED_CART="$( (grep -rnE 'push\(CustomerNavKey\.Cart\)' --include='*.kt' "$CM_SRC" 2>/dev/null || true) | strip_comments)"
if [ -n "$PUSHED_CART" ]; then
  echo "✗ mobile-guard [apps/customer-mobile]: the cart is pushed instead of selected as a tab (087 FR-007):"
  echo "$PUSHED_CART" | sed 's/^/    /'
  FAIL=1
fi

if [ -n "$REPORT_087" ]; then
  if [ "$ENFORCE_087" -eq 1 ]; then
    echo "✗ mobile-guard [apps/customer-mobile]: the storefront frame was broken (087):$REPORT_087"
    FAIL=1
  else
    echo "⚠ mobile-guard [apps/customer-mobile]: 087 conversion still owed (report only until T095):$REPORT_087"
  fi
fi

if [ "$FAIL" -eq 0 ]; then
  echo "✓ mobile-guard: auth/config clean; retired presentation and excluded affordances absent;"
  echo "  every customer destination reachable."
fi
exit "$FAIL"
