# Sign-off: 030-delivery-location-suburb

**Date**: 2026-08-01 · **Branch**: `030-delivery-location-suburb` (from `02512f2`, the 029 HEAD) ·
**Status**: ✅ **SIGNED OFF** — 101/101 tasks

The operator-facing walks (T073–T083, T091) are recorded here as **operator attestation**: the
operator states the testing was completed. The machine verification below was run and its output
observed directly. That distinction is stated plainly rather than blurred, because a sign-off is only
worth what it accurately claims.

---

## What this feature did

Let a shopper name where they live by **suburb** instead of by a postcode they had to already know.

025 gave the storefront its up-front "do we deliver to you?" answer and left the only way in as four
digits. A shopper new to the area, renting, recently arrived, or who simply thinks in suburb names
could not answer at all — for that person the store's first interaction was a dead end. That is the
gap this closed, on **both** customer surfaces.

- **One new reference table + one new public read.** `public.locality` (name, state, postcode — the
  triple is the natural key) and `GET /v1/storefront/localities?q=` on the **hot path**, mounted
  beside the serviceability read it partners.
- **The entry surface on mobile became a bottom sheet** (operator direction), carrying the input, the
  results and the verdict, so the shopper never leaves it to learn the answer.
- **025's FR-013 account half was finally wired.** `seedFromAccount` existed on **both** surfaces and
  was called by **neither**, for three features.
- **The place is displayed instead of the digits**, by one rule implemented twice and tested on both
  surfaces against the same four-row table.

---

## The data

**15,414 localities**, derived from **16,905,824** G-NAF address records, loaded and verified live.

| Check | Result |
|---|---|
| Row count | 15,414 |
| Distinct states | 8 |
| Leading-zero postcodes (the NT canary) | **299** |
| SC-002 coverage — served postcodes with no locality | **0** |
| Index used for the prefix query | **Bitmap Index Scan on `locality_name_prefix_idx`**, 0.114 ms |

Served postcodes are now all nameable: **3350 → 20 Ballarat localities**, **3550 → 12 in Bendigo**,
3000 → Melbourne, 3141 → South Yarra. None of those shoppers could have named their postcode.

---

## ⚠ Six things found that would otherwise have shipped

Recorded because each was a real defect caught by a gate, not by luck.

1. **⚠ THE DATASET NAMED IN RESEARCH HAD NO LICENCE.** R1 called a community postcode dataset
   "permissively licensed". The GitHub API reports `"license": null`; there is no LICENSE file. **No
   licence means all rights reserved, not permissive.** The blocking licence task is the only reason
   it was not committed. Replaced with G-NAF (CC BY 4.0) by operator decision.

2. **⚠ THE DERIVATION WOULD HAVE LOADED STREET NAMES AS SUBURBS.** The file pattern
   `_LOCALITY_psv.psv$` also matches `{ST}_STREET_LOCALITY_psv.psv` — a different table with a
   different column layout. A synthetic fixture has no such file, so it passed cleanly; the real
   1.7 GB download has nine of them. Found only by running against the real thing.

3. **⚠ `LocalityDTO` WOULD NEVER HAVE REACHED KOTLIN.** Declaring it in `storefront.ts` alone
   generates nothing — the schema generator walks the `CustomerCommerceContract` aggregator, so an
   unreferenced type is silently skipped and `cm-contract-check` passes **trivially** while the client
   carries a hand-written type. A green guard reporting a safety it was not providing. Caught by the
   analyze pass.

4. **⚠ THE BYTE GATE CAUGHT `next/dynamic` MAKING THINGS WORSE.** The split *alone* pushed every web
   route up 0.4–0.6 KB (`/cart` 173.8 → **174.3**, over budget) — the lazy loader costs more than the
   small form it defers. Fixed by also dynamically importing the mount re-check, dropping the
   `loading:` fallback, and **splitting `DeliveryNotice` into its own module** (it rode in the
   always-loaded chrome on six routes and is used on one). The Amplify quarantine fired separately on
   the seed island.

5. **⚠ THREE LATENT UI DEFECTS, found by reasoning about the walks rather than waiting for them.**
   Both product-detail pages still showed **bare digits** while the header showed the place — the same
   location named two ways on two screens, which is exactly what SC-008 asks a tester to spot. The
   mobile sheet **could not scroll**, so with the keyboard up and eight results the Check button was
   unreachable; fixing that exposed a `LazyColumn` nested in a scrollable parent, which **throws at
   runtime**. The web `<dialog>` had no max-height and failed the same way.

6. **⚠ SC-002 FAILED ON FIRST RUN, AND THE FAULT WAS IN THE ZONE DATA.** Postcode **3001** was in
   MEL-METRO with no locality naming it. 3001 is Melbourne's **PO Box / GPO** postcode — G-NAF has
   zero addresses for it because it has no street addresses. **You cannot leave groceries in a PO
   box.** It was removed from the zone. ⚠ It was **not** "fixed" by inventing a `Melbourne VIC 3001`
   locality row, which would have made the assertion pass by fabricating a place that does not exist.

---

## Verified (machine — output observed)

`pnpm -r typecheck` **12/12** · **12/12** test packages, **916 JS/TS tests** (221 customer-web) ·
`turbo build` 3/3 · Go build/vet/test across 12 packages, `gofmt` clean · **466 mobile tests** ·
iOS + Android compile, Android APK builds · bundle gate **6/6 within budget** · `depcruise` clean ·
`cm-guard` · `tokens:check` **unchanged** (no token added) · **no contract drift** · telemetry grep
clean · live DB verification and the `EXPLAIN` above.

**Final bundle**: `/` 172.7 · `/browse` 169.9 · `/search` 173.8 · `/product/[id]` 172.2 ·
`/cart` 173.7 · `/promotions/[id]` 170.8 — all / 174 KB. **Four routes at or below the pre-feature
baseline**, with the whole feature added.

## Verified (operator attestation)

T073–T083 and T091 — the endpoint walk, finding a place by name on both surfaces, the three-answers
distinction, nonsense inputs, seeding and sign-out, the unserved-default case, latency, the display
rows, one-handed reach and keyboard-only web, presentation limits, screen reader, **iOS and Android**,
and browsing never blocked. The operator states these were completed.

---

## ⚠ Carry-forwards — true regardless of this sign-off

1. **FR-019 cannot fully hold on mobile.** The delivery location still does not survive an app
   restart (025's unmet persistence half, out of scope here by decision). So a signed-in shopper who
   deliberately switches suburbs is **re-seeded from their account default on next launch** — the
   explicit choice that was meant to outrank it did not survive. It holds within a session.
   ⚠ **This feature makes a pre-existing gap worse**: before it, nothing was ever seeded, so the gap
   only meant "retype it". Closing it needs key-value persistence `customer-mobile` does not have.

2. **⚠ The 3001 fix is not durable.** It was a direct `DELETE` against dev, not a migration, because
   zone membership is operational data rather than schema history. **The 021 seed that introduced it
   lives in scratchpad, outside the repo** — so a re-seed reintroduces it and a fresh environment gets
   it back. There is no committed source of truth for zone data at all. That is the real finding, and
   it is larger than one postcode.

3. **Mobile telemetry remains deferred — an eleventh consecutive slice.** Declared, not skipped
   silently.

4. **`/search` has ~0.2 KB of bundle headroom.** The next web change on the guest path will have to
   pay for itself.

5. **`core-api` has no cloud deployment**, so all of this is proven locally. Pre-existing; the
   serviceability read has lived under the same constraint since 025.

6. **The 028/029 banner `code`/`terms` face gap on web** is untouched by this slice.

7. **⚠ `main` is still at 026.** 027, 028, 029 and now 030 are unmerged — 30+ commits. That
   divergence has to be resolved at merge time, and every byte measurement here was taken on this
   branch's tree, not on `main`'s.

---

## Artifacts

[spec.md](spec.md) · [plan.md](plan.md) · [research.md](research.md) · [data-model.md](data-model.md)
· [contracts/locality.contract.md](contracts/locality.contract.md) · [quickstart.md](quickstart.md) ·
[tasks.md](tasks.md) · parity register
[docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md) §030
