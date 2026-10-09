#!/usr/bin/env bash
# No-legacy-delivery sweep (083 FR-021): the OLD delivery arrangement — a same-day slot or a standard
# day handed to a carrier, chosen per package — was removed. Its code paths, settings and columns MUST
# NOT come back into live source.
#
# ⚠ IT NAMES THE OLD PATH'S IDENTIFIERS, NOT THE WORDS "same_day" / "standard". Those two words are
# kept on purpose: for an Effy order they are the customer's names for a window today and a window on
# a later day (078), and they are how an order from before delivery types is read
# (public.package_delivered_by). Sweeping the words would forbid the thing that still works.
#
# What each name was:
#   sameDayForShops, sameday_eligible/samedayEligible   the per-shop / per-group same-day bridge (047, 076)
#   compatibilityFees                                    per-package fees for clients older than 077
#   resolveDeliveryChoice                                the 069 method / slot / day resolver
#   sameDaySlotId, standardDate/standard_date            the 069 intent fields
#   carrier_lead/carrierLead                             "hand over on the day minus N" (069)
#   standard_lookahead/standardLookahead                 the standard-day picker's reach (069)
#   same_day_factor, standard_factor                     the method multipliers (047; unread since 077)
#   courier_estimate_text                                079's platform-wide estimate (a courier service carries it since 080)
#   locked_by_sub                                        the round lock (063; unused since 073)
#
# ⚠ NOT SCANNED, each for a reason:
#   db/migrations/        history — the migrations that created and dropped these ARE the record
#   docs/archive/, specs/, FEATURE-HISTORY.md   what the old arrangement was, written down on purpose
#   test files            the migration tests rebuild the schema as it was, and a few tests send the
#                         old fields to prove they are IGNORED; a test cannot bring a code path back
#   generated contracts   regenerated from the sources this does scan
#   this script
set -euo pipefail

cd "$(dirname "$0")/.."

PATTERN='sameDayForShops|compatibilityFees|resolveDeliveryChoice|sameDaySlotId|standardDate|standard_date|carrier_lead|carrierLead|standard_lookahead|standardLookahead|sameday_eligible|samedayEligible|same_day_factor|standard_factor|courier_estimate_text|locked_by_sub'

hits="$(grep -rnE "$PATTERN" apis apps packages db/seeds scripts infra \
  --include='*.ts' --include='*.tsx' --include='*.kt' --include='*.sql' --include='*.yml' --include='*.sh' \
  --include='*.mjs' --include='*.tf' --include='*.json' \
  --exclude='*.test.ts' --exclude='*.test.tsx' --exclude='*Test.kt' \
  --exclude='check-no-legacy-delivery.sh' \
  --exclude-dir='node_modules' --exclude-dir='.next' --exclude-dir='dist' --exclude-dir='build' \
  --exclude-dir='.turbo' --exclude-dir='coverage' --exclude-dir='.serverless' --exclude-dir='.terraform' \
  --exclude-dir='commonTest' --exclude-dir='contract' --exclude-dir='generated' 2>/dev/null || true)"

if [ -n "$hits" ]; then
  echo "check-no-legacy-delivery: FAILED — the old delivery arrangement is named in live source:" >&2
  echo "$hits" >&2
  echo >&2
  echo "There is one delivery model (083). What an old order was sold is read through" >&2
  echo "public.package_delivered_by and its method/window columns — see docs/archive/delivery-model-v1.md." >&2
  exit 1
fi
echo "check-no-legacy-delivery: OK — no trace of the old delivery arrangement in live source (083 FR-021)."
