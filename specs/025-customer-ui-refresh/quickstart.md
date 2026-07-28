# Quickstart: Customer Experience Refresh

**Feature**: 025-customer-ui-refresh | **Date**: 2026-07-27

How to run both customer surfaces against this feature and verify it against the spec's success
criteria. This is a validation guide — implementation detail belongs in `tasks.md`.

---

## 0. Prerequisites

**No migration.** This feature adds none. If `make db-status ENV=dev` shows pending migrations, they
belong to an earlier slice and must be applied before starting — but not by this feature.

| Need | Command | Notes |
|---|---|---|
| Workspace deps | `make edge-install` | pnpm workspace |
| Dev DB reachable | `make dev-status` → `make dev-start` | the dev instance is parked when idle |
| Catalogue with products | (existing dev seed) | **Two shops, ~38 products, 92 S3 images.** Needed for sort/count/related to be meaningful. |
| Delivery zones seeded | (021 dev seed: `MEL-METRO`, `VIC-REGIONAL`) | **Required for serviceability.** Without it every postcode answers `false` and SC-002/SC-002a cannot be walked. |
| Hot path running | `make core-run` | ⚠ **Local Docker only.** `core-api` has no cloud deploy; every storefront read here is local-only. |

> ⚠ **After Phase 0, `make core-run` must be restarted** — the serviceability route and the sort/count
> parameters need the new binary. This is the same trap 019 hit with `PUT /v1/cart`.

---

## 1. Run the surfaces

```bash
make core-run          # hot path on :8080 (leave running)
make cw-dev            # customer storefront on http://localhost:3000
```

Mobile (customer):

```bash
# Android
cd apps/customer-mobile && ./gradlew :androidApp:installDebug
# iOS — open apps/customer-mobile/iosApp in Xcode and run
# Device → local core-api: expose it first
make cm-ngrok-core
```

---

## 2. Machine-verifiable gates

Run these before any manual walkthrough. **All must be green.**

```bash
# ── Hot path ──────────────────────────────────────────────────────────
make core-test                    # incl. cursor round-trip, count-vs-walk, serviceability parity
make core-lint                    # gofmt + go vet

# ── Shared packages (Principle II) ────────────────────────────────────
pnpm -r typecheck
pnpm -r test
make cm-codegen                   # customer-mobile contract + token drift
make sm-codegen                   # shop-mobile contract + token drift
make brand-check                  # brand assets unchanged by this feature

# ── customer-web ──────────────────────────────────────────────────────
make cw-lint
make cw-test
make cw-build
make cw-gates                     # Amplify quarantine + guest bundle budget
pnpm --filter @effy/customer-web e2e

# ── Mobile ────────────────────────────────────────────────────────────
make cm-guard
make sm-guard
make sm-test
cd apps/customer-mobile && ./gradlew :shared:allTests
cd apps/shop-mobile     && ./gradlew :shared:allTests
```

### The gate that will bite first

`make cw-gates` is **red before this feature starts**: 167.4 KB against a 160 KB limit, pre-existing
and recorded under 020. Phase 0 fixes it. Until it is green, no other web verification is meaningful.

Two related notes:
- The `cw-size` help text in the Makefile still says "≤ 120 KB". That number is stale — the script's
  real limit is 160 KB, and the script's own comment explains why 120 was unreachable. Fix the help
  string while in there.
- `GUEST_PAGES` must be extended to `/search` and `/product/[id]`, or the gate will pass while
  ignoring the routes this feature changes most.

---

## 3. Serviceability — the SC-002a parity walk

```bash
# A postcode inside a seeded zone
curl -s 'http://localhost:8080/v1/storefront/serviceability?postcode=3000' | jq
# → { "postcode": "3000", "serviced": true }

# A postcode in no zone
curl -s 'http://localhost:8080/v1/storefront/serviceability?postcode=0800' | jq
# → { "postcode": "0800", "serviced": false }

# Not a postcode — MUST be 400, MUST NOT be serviced:false
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:8080/v1/storefront/serviceability?postcode=abc'
# → 400
```

Then confirm the same postcodes get the same answer at checkout (SC-002a). The parity test in
`core-test` asserts this automatically; the manual walk exists because a passing test against a shared
function still deserves one live confirmation.

**Also confirm the response contains no zone id, zone name, fee, or window** — FR-014a and FR-006.

---

## 4. Sort and total — the SC-003a integrity walk

```bash
# Total present and sort echoed
curl -s 'http://localhost:8080/v1/storefront/products?limit=5' | jq '{total, sort, n: (.items|length)}'

# Each ordering
for s in newest price_asc price_desc; do
  curl -s "http://localhost:8080/v1/storefront/products?sort=$s&limit=5" | jq -c "{$s: [.items[].priceAmount]}"
done

# relevance without q falls back — and SAYS so
curl -s 'http://localhost:8080/v1/storefront/products?sort=relevance&limit=3' | jq '.sort'
# → "newest"

# A cursor from one sort, presented under another → 400
C=$(curl -s 'http://localhost:8080/v1/storefront/products?sort=newest&limit=2' | jq -r .nextCursor)
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8080/v1/storefront/products?sort=price_asc&cursor=$C"
# → 400
```

**Count agrees with a full walk**: page one ordering to exhaustion and confirm the number of distinct
product ids equals `total`, with none repeated. Automated in `core-test`; walk it once by hand per
sort.

---

## 5. Guest journeys (both surfaces)

Walk each as a **signed-out guest**. Any sign-in prompt in these paths is a FR-003 failure.

| # | Journey | Proves |
|---|---|---|
| 1 | Cold open → set a delivery location → serviced answer appears **before** any cart exists | SC-002, FR-014 |
| 2 | Set an unserviced location → plain refusal, browsing still works, same answer at checkout | FR-014, SC-002a |
| 3 | Primary nav → browse → category → product, **without search**, ≤3 deliberate steps, **no placeholder page** | SC-001, FR-009/010 |
| 4 | Refine by category + price + on-sale together; each removable; one action clears all | FR-015 |
| 5 | Change sort; count updates; scroll to end; no product repeated or missing | SC-003a, FR-016b |
| 6 | Copy the URL of a refined result set, open in a new tab → same refinements | FR-017 |
| 7 | Open a product from results, go back → refinements, scroll position, place preserved | FR-018 |
| 8 | Product: every gallery image reachable; delivery expectation beside price; quantity beside add | FR-022/023/024 |
| 9 | Mobile: scroll a long product page → price + add stay reachable | FR-025 |
| 10 | Add an item → immediate acknowledgement, cart indicator updates, path to cart offered without navigating | SC-004, FR-039 |
| 11 | Remove a cart line → undo from the same acknowledgement | FR-041 |
| 12 | Wide-screen checkout → order summary stays visible while scrolling steps | FR-042 |
| 13 | Search with no results → explained, with a recovery path | FR-021 |
| 14 | Multi-shop cart → package split explained, **no shop named or inferable** | FR-006, FR-043 |

---

## 6. SC-005 — the structured visual review

**This cannot be automated and the plan does not pretend otherwise.** No gate in this repo can tell
whether a layout looks right. Walk the matrix and record a pass/fail per cell.

**Viewports** (5): narrowest supported phone · large phone · portrait tablet · landscape tablet ·
wide desktop.
**Appearances** (2): light · dark.
**Surfaces** (2): customer-web · customer-mobile.

For each cell, confirm on every screen the feature touches:

- [ ] No clipped, overlapped, or unreachable content
- [ ] No essential content behind status bars, cutouts, gesture areas, or the keyboard
- [ ] Product tiles fill their grid — no fixed-width gaps (FR-020)
- [ ] Every colour, type size, spacing step, radius resolves to the design-system SSOT (FR-007)
- [ ] Cards appear **only** in the three permitted places (product tile, category tile, promo slide) —
      no metric or summary cards anywhere, none at the top of any page (Principle V, research R11)

Then, once per surface pair:

- [ ] **SC-008** — the same content side by side on a phone and a desktop reads as one product,
      **including the typeface** (this is the one that is currently visibly wrong)

---

## 7. SC-006 — the mobile "nothing left behind" sweep

Grep-able, then visually confirmed. Each must return **zero reachable instances** in
`apps/customer-mobile`:

- [ ] Lettered navigation glyphs (`NavGlyph` deleted, `AdaptiveNavShell` deleted)
- [ ] Improvised text-link back controls (`TextButton("← Back")`)
- [ ] Spinner-only first-load states (bare `CircularProgressIndicator` with no skeleton)
- [ ] Cart lines without a product image

---

## 8. Accessibility (SC-009, SC-010)

- [ ] Screen reader completes discovery → product → cart → checkout on **both** surfaces: no
      unlabelled controls, no focus traps, no unannounced dynamic change (result count, applied
      refinement, add confirmation, error)
- [ ] Web keyboard-only completes every one of those journeys, focus always visible
- [ ] Grayscale review: every status, badge, refinement, availability meaning still interpretable
- [ ] Maximum supported system text size: nothing clipped or unreachable

---

## 9. Moderated testing (SC-002, SC-003, SC-013)

These need real people and cannot be closed any other way.

- **SC-002** — ≥90% of shoppers correctly state whether Effy delivers to their address *before*
  adding anything to the cart.
- **SC-003** — ≥90% narrow a >100-product result set to <20 using refinement alone, unaided, first
  attempt. *(Requires a catalogue larger than the current dev seed — note this when scheduling.)*
- **SC-013** — a product review rates hierarchy, discovery clarity, delivery confidence, and
  perceived modernity ≥4/5 on both surfaces.

---

## 10. Regression (SC-012)

`shop-mobile` is refactored onto the shared foundation in Phase 0 and **must show no behaviour
change**:

- [ ] `make sm-test` + `./gradlew :shared:allTests` green
- [ ] `make sm-guard`, `make sm-codegen` green
- [ ] Sign-in, session restore, sign-out, role visibility, manager denial unchanged on device
- [ ] Its 018 presentation is visually identical

---

## 11. Sign-off

- [ ] Every gate in §2 green — **including the bundle budget**
- [ ] §3–§8 walked and recorded
- [ ] §9 scheduled or completed
- [ ] §10 clean
- [ ] `docs/audiences/customer-capabilities.md` updated with every capability on both surfaces and
      the `n/a` rows justified (SC-014)
- [ ] Spec, plan, research, data-model, contracts, tasks committed alongside the code (Quality Gates)
