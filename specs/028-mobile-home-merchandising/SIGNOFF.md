# Sign-off: 028-mobile-home-merchandising

**Date**: 2026-07-31 · **Branch**: `028-mobile-home-merchandising` · **Status**: ✅ **SIGNED OFF —
PARTIAL BY DESIGN**

Partial in the same sense as 007 and 020: the shopper-facing feature is built, machine-verified and
confirmed on device, and one half — the operator's promotional banner loop — is code-complete but has
**never been seen running**. That is recorded below rather than implied by a green tick.

---

## What this feature did

Replaced the customer mobile Home tab's flat two-column "Discover" grid with a merchandised,
sectioned storefront: a one-tap search handoff, named horizontally-scrolling rails, a category
shortcut row with authored iconography, and promotional banners driven by real back-office
promotions.

**⚠ It reverses 026's FR-025a for the Home tab**, on operator direction (FR-003). Every other screen
026 composed is untouched. The virtue 026 was protecting — merchandise reachable without scrolling
past chrome — was retained as SC-002 and SC-006 rather than abandoned.

---

## Verified — machine

| Gate | Result |
|---|---|
| `pnpm -r typecheck` | 12/12 packages |
| `pnpm -r test` | **862** JS/TS tests across 8 packages |
| `pnpm turbo build` | 3/3 web surfaces |
| Go build · vet · gofmt · test | 11 packages green |
| Mobile `:shared:allTests` (Android + iOS) | green |
| `:androidApp:assembleDebug` · iOS Kotlin/Native compile | green |
| `cm-contract-check` | no drift |
| `cm-tokens-check` | **unchanged** — this slice added no design token |
| `mobile-assets:check` | 76 copies, zero stale/missing/orphaned |
| `cm-guard` · `check-no-emerald` · `check-no-jade` | green |

## Verified — live (dev)

- **Migration applied.** `20260731072813_promo_advertising.sql` present in `db-status`.
- **Admin service deployed.** `POST /admin/v1/promotions/{id}/banner-image/presign` returns **401,
  not 404** — the route exists and the JWT authorizer rejects an unauthenticated call.
- **`core-api` running the new binary.** `GET /v1/storefront/home` returns `banners: []` against six
  live rails. The old code *always* returned the `"welcome"` stub when rails existed, so the empty
  list is itself the proof — and it also proves the new `AdvertisedPromotions` SQL runs against the
  real schema.
- **Category data verified against the live catalogue** — see the defect below.

## Verified — device (iOS simulator, operator)

Sectioned layout, rail geometry and peek, the shimmer loading state, product-card sizing, and the
vertical rhythm were all confirmed visually by the operator across several iterations.

---

## ⚠ NOT verified — and what that costs

| Unproven | Consequence |
|---|---|
| **T068 — the advertised-promotion loop** | **No promotion was ever marked advertisable.** The banner has never rendered. `EffyPromoBanner`, the pager, the target navigation, the terms sentence, the artwork upload and the automatic take-downs are **machine-verified only**. SC-014 and SC-015 are unproven. |
| **T003 / T069 — measurements** | No baseline was recorded. **SC-005** (≤50% viewport), **SC-006** (≤4 swipes), **SC-008** (<2 s) are unmeasured. |
| **SC-009** — 5/5 first-time testers | Not run. |
| **SC-010** — screen-reader traversal | Not walked. The `isTraversalGroup` bounding is unproven with a real screen reader. |
| **SC-011** — dark mode · largest text size · tablet landscape | Not walked. |
| **SC-012** — empty store | Not walked (unit-proven only). |
| **SC-013** — Android/iOS side-by-side | **Only iOS was ever seen.** Android compiles and its tests pass; nobody has looked at it. |
| **Research R9** — does a hueless banner draw the eye? | **Unanswerable**, because the banner was never displayed. This was the feature's headline design risk and it remains open. |

---

## Defects found and fixed during this slice

Five, and the pattern in four of them is the same: **a test passed because the fixture agreed with the
code rather than with the world.** That is 027's lesson, and it recurred repeatedly here.

1. **The category row rendered nothing at all.** Every product's primary category is a *leaf*;
   `productCount` does not roll up, so all three top-level categories reported `0` and the filter
   `parentKey == null && productCount > 0` matched none. Thirteen authored icons displayed nothing.
   Worse, category filtering is an exact primary-category match everywhere, so a top-level shortcut —
   even if shown — would have opened a results screen with **zero products**. Found only by querying
   the live categories endpoint. FR-024 and SC-004 were **amended in the spec**, not patched in code
   alone (Principle I).
2. **Rail tiles ignored their width.** `BoxWithConstraints` inside a `LazyRow` item: a LazyRow measures
   children with an **unbounded main axis**, so `maxWidth * fraction` stayed infinite, names stopped
   wrapping and the square image plate expanded into a screen-height void. Fixed by passing a resolved
   `Dp`, which makes the mistake unrepresentable.
3. **Images had no loading state.** The letter placeholder only ran when the URL was `null`; a valid
   URL still downloading drew **nothing**, on a near-white plate, on a white page. Replaced with three
   honest states (shimmer / letter mark / photo). ⚠ A bug in the fix was caught before shipping:
   `painter.state` is a `StateFlow` in Coil 3, so reading `.value` would have left the shimmer running
   over a photo that had already arrived.
4. **The skeleton didn't match the content.** `fillMaxWidth(fraction)` and then `Modifier.width()`
   inside a plain `Row` both fail, because a Row allocates width sequentially and coerces each child
   into what is left. Fixed by building the skeleton from the **same primitives as the content**
   (`LazyRow`), so it cannot diverge. Every skeleton in the app now shimmers.
5. **"See all" was a 40dp touch target** and five of them announced the identical label. Material 3's
   `TextButton` defaults below the platform's 48dp minimum, and 028 turned an affordance with *no
   callers* into the primary route into a scoped result set, repeated down the screen.

**Also corrected**: six verification tasks (T058–T063) that had been marked complete on reasoning
rather than on checking. Re-opened, audited, and three real defects fell out of that audit.

---

## Carry-forwards

- **Walk T068.** Create an advertised promotion in the console and confirm the banner, its terms, the
  artwork upload, the not-advertised case (SC-015) and the automatic take-downs. Until then the whole
  operator half is unproven.
- **Category rollup.** A recursive CTE so a category's count and filter include its descendants. It is
  what would make *top-level* shortcuts possible, and it is a server capability this slice did not add.
- **`customer-web` banner adoption.** Web ignores `code`, `terms`, `target` and `position`, so a
  promotion with a minimum spend shows its headline there **without its terms**. A recorded parity gap.
- **Mobile telemetry.** Seven Home events are specified (research R13) and none is emitted — the
  platform-wide deferral now spanning 013/014/015/020/021/022/027/028.

## Constitution

**PASS**, with two deviations recorded in the plan's Complexity Tracking: the promotional banner as a
justified no-card exception (Principle V), and telemetry specified but not emitted (Principle VII).
`cm-tokens-check` passing unchanged is the proof that no colour was introduced.
