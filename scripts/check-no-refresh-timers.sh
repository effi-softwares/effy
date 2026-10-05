#!/usr/bin/env bash
# 071 FR-009 / SC-010 — NO SCREEN REFRESHES ITS DATA ON A TIMER.
#
# Since 071 a screen reads when it opens, when it returns to the foreground, when its connection
# returns, when it is told something changed, and when the person asks. A polling loop added later
# would work — and quietly bill the platform for reads nobody is looking at, which is the very thing
# this feature removed. This fails the build instead.
#
# What it looks for:
#   web     — a TanStack Query `refetchInterval` set to anything but `false`
#   mobile  — a `while (…) { … delay(…) … }` loop whose body calls something named like a re-read
#
# What is allowed, and why (FR-011 — a clock that re-words loaded data is not a refresh):
#   apps/shop-web/src/features/today/useNow.ts      re-words "3 minutes ago"; reads nothing
#   apps/shop-web/src/lib/pwa.ts                    checks for a new APP VERSION, not for data
#   …/driver/…/delivery/presentation/WindowLine.kt  re-words a delivery window; reads nothing
#   packages/mobile-kit/common/live/                the live client itself (keep-alive, backoff, epoch)
#   packages/web-kit/src/live/                      likewise
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

# ── web ───────────────────────────────────────────────────────────────────────────────────────────
web_hits=$(grep -rnE "refetchInterval\s*:" \
    apps/shop-web/src apps/back-office/src apps/customer-web/app apps/customer-web/components apps/customer-web/lib packages/web-kit/src \
    --include='*.ts' --include='*.tsx' 2>/dev/null \
  | grep -vE "\.test\.(ts|tsx):" \
  | grep -vE "refetchInterval\s*:\s*false" \
  | grep -vE "^\S+:[0-9]+:\s*(//|\*)" || true)
if [ -n "$web_hits" ]; then
  echo "✗ a query refreshes on a timer (071 FR-009). Use the live channel: map the query's key in the app's features/live/routes.ts."
  echo "$web_hits"
  fail=1
fi

# ── mobile ────────────────────────────────────────────────────────────────────────────────────────
# A delay inside a loop, in a file that also calls a re-read from that loop. Deliberately simple:
# it reads each file once and reports a `while` block containing both `delay(` and a call whose
# name starts with refresh/reload/load/fetch/poll.
mobile_hits=$(find apps/customer-mobile/shared/src/commonMain apps/shop-mobile/shared/src/commonMain apps/driver-mobile/shared/src/commonMain \
    -name '*.kt' -print0 2>/dev/null \
  | xargs -0 awk '
      FNR == 1 { inloop = 0; depth = 0; hasdelay = 0; hasread = 0 }
      {
        line = $0
        sub(/\/\/.*$/, "", line)
        if (!inloop && line ~ /while[ ]*\(/) { inloop = 1; depth = 0; hasdelay = 0; hasread = 0; start = FNR }
        if (inloop) {
          if (line ~ /delay\(/) hasdelay = 1
          if (line ~ /(^|[^A-Za-z])(refresh|reload|load|fetch|poll)[A-Za-z]*\(/) hasread = 1
          o = gsub(/\{/, "{", line); c = gsub(/\}/, "}", line)
          depth += o - c
          if (depth <= 0 && (o > 0 || c > 0)) {
            if (hasdelay && hasread) print FILENAME ":" start ": a loop that waits and then re-reads"
            inloop = 0
          }
        }
      }' || true)
if [ -n "$mobile_hits" ]; then
  echo "✗ a mobile screen re-reads on a timer (071 FR-009). Collect the live client instead: LiveClient.changes(…)."
  echo "$mobile_hits"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "check-no-refresh-timers: OK — no data refresh timer in the six apps"
fi
exit "$fail"
