# 027-customer-cart-sync — Sign-off

**Date:** 2026-07-30 · **Branch:** `027-customer-cart-sync` · **Tasks:** 130 / 142

## Verdict

**Signed off as CODE-COMPLETE and MACHINE-VERIFIED, with the live acceptance walk OUTSTANDING.**

Every functional requirement is built across all three surfaces plus the operator console, every
machine-checkable gate is green, and the platform half is verified against the **live dev database**.
What is *not* done is the human walk of the success-criteria tables: 12 of the 21 SCs make claims about
two devices, a force-quit, a request count, a Stripe re-delivery or a rendered screen, and none of those
can be established from a terminal.

This document records that split honestly rather than marking the table done. Per T134: *"recording
anything not walked rather than marking it done."*

---

## 1. Machine-verified (green)

| Gate | Result |
|---|---|
| `pnpm -r typecheck` | clean, all packages |
| `pnpm -r test` | **847 JS/TS tests** passing |
| `turbo build` | 3 web surfaces build |
| Go `build` / `vet` / `test` / `gofmt` | clean (`core-api`) |
| customer-mobile | iOS compile + `commonTest` + `assembleDebug` |
| shop-mobile | iOS compile + `commonTest` + `assembleDebug` |
| `make cm-guard` / `sm-guard` | clean |
| `make cm-contract-check` | no Kotlin/TS drift |
| `tokens:check` | Compose theme **unchanged** — this slice adds no token |
| `mobile-assets:check` | 50 asset copies match across 3 apps |
| `depcruise` (customer-web) | no violations, 242 modules |
| Guest bundle budget | all 5 routes within 174 KB |

**Three pre-existing red gates were fixed** in the sweep, not worked around: `ic_notifications_outlined`
and `ic_location_outlined` were *used by real screens* but never promoted to the `mobile-assets/` SSOT,
and `compose-multiplatform.xml` was an unused KMP-template leftover in two apps.

**Bundle delta** (measured by stash/unstash, not estimated):

| Route | HEAD | with 027 | Δ |
|---|---|---|---|
| `/` | 171.9 | 172.1 | +0.2 |
| `/browse` | 169.8 | 170.1 | +0.3 |
| `/search` | 173.2 | 173.5 | +0.3 |
| `/product/[id]` | 172.1 | 172.3 | +0.2 |
| `/cart` | 172.7 | 173.8 | +1.1 |

⚠ `/search` sits **0.5 KB** from the gate. The next client dependency added to it breaks the build.

---

## 2. Verified against the LIVE dev environment

Confirmed 2026-07-30 against `effy-dev-db` (`AWS_PROFILE=ef`) with `core-api` running locally.

- **Migration applied.** `20260730102329_cart_sync_promotions.sql` — Thu Jul 30 11:41:51 2026. All five
  new tables present; `order_policy` holds its singleton row (`min=0.00`, `maxLine=99`,
  `maxDistinct=100`); `cart.revision` exists.
- **`core-api` healthy.** `/readyz` → `{"checks":{"database":"ok"},"status":"ready"}`; the full `/v1/cart`
  route set mounts.
- **The cart is genuinely persisting.** One cart at **revision 22**, backed by **22 change-log rows with
  22 distinct changeIds and zero duplicate `(cart_id, change_id)` pairs**. Revision count equals applied-
  change count exactly — the monotonic revision and the dedupe ledger are both behaving in production
  data. This is the defect the slice was opened for, and it is fixed.
- **FR-018 is enforced by the schema, not by code.** `cart_change_log_pkey` is a UNIQUE INDEX on
  `(cart_id, change_id)`. A replayed change cannot double-apply even if the service forgot to check.
- **SC-021's refusals are enforceable at the storage layer.** Live constraints include
  `promo_code_window_chk` (inverted window), `promo_code_kind_value_chk` (a percentage code carrying an
  amount), `promo_code_code_uq` on `upper(code)` (duplicate), plus the value and cap checks. A bug in the
  service cannot write a promotion the platform could not honour.

⚠ **What this evidence does *not* establish.** A revision counter cannot distinguish one device used
twenty-two times from two devices converging, and a constraint existing is not the same as an operator
being *told* the right thing when they hit it. Those are SC-002 and SC-021, and they remain unwalked.

---

## 3. Success criteria — status

| SC | Claim | Status |
|---|---|---|
| SC-001 | Cart survives force-quit + device restart | ⛔ **NOT WALKED** — needs a real process death |
| SC-002 | Item added on one surface appears on the other | ⛔ **NOT WALKED** — needs two clients |
| SC-003 | Guest + account carts union on sign-in | ⛔ **NOT WALKED** |
| SC-004 | Two devices converge on one cart | ⛔ **NOT WALKED** |
| SC-005 | Quantity change visible within 100 ms | ⛔ **NOT WALKED** — needs request counting |
| SC-006 | Offline changes apply exactly once | ⛔ **NOT WALKED** |
| SC-007 | Unavailable item flagged + excluded | ⛔ **NOT WALKED** (unit-proven) |
| SC-008 | Price change surfaced with the previous amount | ⛔ **NOT WALKED** (unit-proven) |
| SC-009 | Set-aside survives restart + devices | ⛔ **NOT WALKED** |
| SC-010 | Clear requires confirmation, keeps saved items | ⛔ **NOT WALKED** (unit-proven) |
| SC-011 | Reorder adds available, reports the rest | ⛔ **NOT WALKED** (unit-proven) |
| SC-012 | Every invalid promo case is distinguishable | ⛔ **NOT WALKED** — needs T104 fixture codes |
| SC-013 | Amount charged equals the discounted total | ⛔ **NOT WALKED** — needs Stripe re-delivery |
| SC-014 | Below-minimum states the shortfall, blocks checkout | ⛔ **NOT WALKED** |
| SC-015 | Ceilings hold directly, via reorder, and via merge | ⛔ **NOT WALKED** (unit-proven) |
| SC-016 | Abandoned checkout leaves the cart untouched | ⛔ **NOT WALKED** |
| SC-017 | No shop identity in any cart string | ⚠️ **PARTIAL** — code-verified, see below |
| SC-018 | Both surfaces offer every capability | ✅ **RECORDED** — parity register §027 |
| SC-019 | Saved cart → placed order without re-adding | ⛔ **NOT WALKED** |
| SC-020 | Operator takes a promotion live and back off | ⛔ **NOT WALKED** — console never signed into |
| SC-021 | Every invalid code definition refused | ⚠️ **PARTIAL** — constraints live, refusals unwalked |

**1 met · 2 partial · 18 not walked.**

**SC-017 detail.** Verified by reading every string the cart mints: no customer-facing cart, order or
checkout DTO carries a shop field; lines group by an opaque truncated-SHA `packageKey` and render as a
positional "Package N"; notices carry the *product* name; the reorder shortfall counts items; the promo
label is shop-free. The **phrasing** half is open — grep finds identifiers, only reading a rendered
two-shop below-minimum cart finds tone.

---

## 4. Outstanding (operator)

| Task | Action |
|---|---|
| T104 | Create the eight fixture codes **through the console** (needs a back-office EMAIL_OTP sign-in) |
| T029b | `GET /v1/cart` over HTTP with a two-shop cart |
| T046 · T054 · T060 · T070 · T077 · T084 · T091 · T117 · T123 | quickstart §3/§4 scenario tables |
| — | `apps/customer-web/e2e/cart.spec.ts` — 18 tests, written and registering, **never executed** (needs live `core-api` + seeded catalogue) |
| T134 | Re-walk this table and flip the ⛔ rows |
| T135 | Open the PR |

---

## 5. Defects found and fixed during this slice

- **R12a** — one auth plugin sent the **ID token** to both backends; `core-api` requires
  `token_use == "access"`. The root cause of the whole slice.
- **R12b** — `auth.PoolVerifier` accepted exactly one app client per pool, so the mobile client was
  refused even with the right token.
- **R13** — Kotlin serialised quantities as `Double` (`1.0`); Go's `encoding/json` refuses that into an
  `int`. Fixed **at the contract** with a `WireInt` alias, so the generated Kotlin cannot regress.
- **Latency** — the first working write timed out at ~14 round trips to Sydney RDS inside a 4 s budget.
- **Empty-cart centring** — adding pull-to-refresh wrapped the empty state in a `verticalScroll` Column,
  which top-aligns. Found by the operator on device.
- **Cart row layout** — the stepper and two text buttons shared the middle column's leftover width, so
  "Remove" broke to "Rem/ove" and "Save for later" was pushed off-screen. Rebuilt as two stacked rows
  with icon actions. Found by the operator on device.
- **Bundle** — a static telemetry import in one cart client component cost **+1.0 KB on four guest
  routes** and broke the gate; now a dynamic import.

**⚠ The carry-forward.** Every unit test passed throughout the R12/R13 investigation, because the fakes
spoke Kotlin at both ends and never crossed the wire. **A generated-Kotlin-vs-real-Go contract test would
have caught R13 on day one** and is the strongest recommendation out of this slice.

Two of the last three defects were found by an operator looking at a screen, after every machine gate was
green. That is the argument for the walk in §3, not a formality.
