# Sign-off: 029-promotional-banner-carousel

**Date**: 2026-07-31, amended **2026-08-01** · **Branch**: `029-promotional-banner-carousel` ·
**Status**: ✅ **CONCLUDED — PARTIAL BY DESIGN** — 78/89 tasks (62/73 at sign-off, plus Phase 9's
16/16 post-sign-off tasks)

⚠ **"Concluded" means the slice is closed, not that everything in it was proven.** Eleven tasks
remain open and every one is an operator walk — they are listed under *Carry-forwards* and are not
made true by this document. **T051, the bypass test, is still the single most important open item on
the platform.**

Partial in the same sense as 007, 020 and 028. The shopper-facing half is built, machine-verified,
and **for the first time on this platform, seen rendering real promotional banners on a device**.
The operator-facing half is code-complete and **has still never been walked by a human** — every
banner that exists today was written straight into the database.

That distinction is the most important thing in this document, so it is stated plainly rather than
buried under a green tick: **the seeding that made the banners appear is the exact bypass path
quickstart §2a exists to prove is refused.** It demonstrates the rendering half and says nothing
whatsoever about the enforcement half.

---

## What this feature did

Gave 028's advertising facet a canonical shape and a second placement.

- **One canvas definition, one source of truth.** `packages/shared-types/src/banner-canvas.json` —
  1200×600, 2:1, 150 KB ceiling, with a marked text zone. It lives in `shared-types` rather than
  `design-system` because an admin Lambda importing a UI package to learn two numbers is wrong.
- **A fixed-size template** the operator downloads, plus a live preview and scale-only normalisation
  in the back-office promotions console.
- **Server-side conformance verification** — a ranged GET reads the artwork's real dimensions from
  its own header bytes on save, and **refuses** rather than resizing, with a distinct
  `promo_banner_image_wrong_size` code.
- **A dedicated offers carousel** (`HomeBlock.Offers`), distinct from 028's between-sections
  placement, driven by a new `banner_placement` column. A promotion appears in one or the other,
  **never both** (FR-027).

### ⚠ Why nothing is ever cropped

The requirement read like it needed crop arithmetic: *fill the space, never stretch, crop only
outside the safe area*. Locking the ratio at **both** ends — conformant artwork at 2:1 and a render
box at 2:1 — removes the case entirely. The scale is uniform and there is nothing to crop.

That is why the **server-side check matters more than any rendering code in this slice**. It is the
only thing keeping the two ends in agreement, and it is the half that has never been exercised
against a real upload.

---

## Verified — machine

| Gate | Result |
|---|---|
| `pnpm -r typecheck` | **12/12** packages |
| `pnpm -r test` | **896** JS/TS tests, **12/12** packages reporting |
| `pnpm turbo build` | 3/3 web surfaces |
| Go build · vet · gofmt · `go test ./...` | green (11 packages) |
| `go test -race` (storefront) | clean — the new concurrency carries no data race |
| `:shared:iosSimulatorArm64Test` · `:shared:testAndroid` | green, **both** targets |
| `:androidApp:assembleDebug` · iOS framework link | green |
| `cm-guard` · `sm-guard` | green |
| `cm-contract-check` · `sm-contract-check` | no drift |
| `cm-tokens-check` · `sm-tokens-check` | green (includes `check-banner-template.mjs`) |
| `brand-check` | green |
| `check-no-emerald` · `check-no-jade` | green — this slice introduces **no colour** |
| `depcruise` (Amplify quarantine) | clean |
| customer-web guest bundle | ✓ within budget — see carry-forward |

**Both drift guards were proven by deliberately breaking them**, per the repo standard set in 024:
hand-editing `widthPx` fails `tokens:check` and names the file; editing the template SVG fails
`banner-template:check`.

**The cross-language wire contract was proven two ways.** `int` → `float64` fails at compile time; a
silent `json:"terms"` → `json:"termsText"` rename compiles cleanly and is caught **only** by the
byte-for-byte comparison against the hand-duplicated literal.

## Verified — live (dev)

- **Migration applied** — `20260731104629_promo_banner_placement.sql`.
- **`core-api` running the new binary** — `placement` is present on the wire, which only the new
  build emits.
- **The first promotional banner payload this platform has ever produced.** Six advertised
  promotions returned with `placement` as a **string**, `position` as an **integer**, `terms`
  correctly `null` for zero-minimum promotions (the `promoTerms()` nil branch), and every artwork
  presigned. The wire contract holds against real data, not fixtures.
- **SC-011 proven at the read level** — `GOODWILL2026` (active, redeemable, **not** advertised) and
  `EOFY30` (advertised, complete copy, **expired**) are live *simultaneously* with six visible
  promotions and appear **nowhere** in the payload. Both sit at carousel position 0 deliberately: a
  regressed filter would surface them **first**, with the loudest copy in the set.
- **All seeded artwork is exactly 1200×600**, verified from the encoded bytes, all under 150 KB.

## Verified — device (iOS simulator, operator)

- The offers carousel and inline banners render, with artwork, copy and terms.
- Confirmed by the operator after the scrim rebuild described below.

---

## ⚠ NOT verified — and what that costs

**The entire operator loop. Nobody has ever created a banner through the console.**

| Open | What is actually unknown |
|---|---|
| **T050** — console walk (§2) | The template, the preview and the normalisation have never been used by a human. SC-001 ("under 5 minutes, no design tools") is **unmeasured**. |
| **T051** — the bypass test (§2a) | ⚠ **The most important open item.** Nobody has presigned a URL, PUT a deliberately wrong-shaped image straight to S3, and confirmed the save is **refused**. Until that runs, **FR-004 is decorative** and SC-002 rests on the seeder's own arithmetic rather than on the platform's enforcement. |
| **T054** — exhaustion take-down | Needs real `promo_redemption` rows. The count-never-store rule is unit-proven only. |
| **T052 (half)** — end a promotion, watch it vanish | Banners now appear on a device; the *disappearance* half of SC-010 was never walked. `EOFY30` proves the predicate server-side, which is not the same thing. |
| **T055–T058** | Reduced motion, touch targets, **dark appearance**, largest system text size, tablet/landscape. ⚠ Dark mode is newly relevant — the scrim was rebuilt this session and its dark-mode behaviour is **reasoned, not seen**. |
| **T062** | **Android has still never been looked at.** 028 recorded this exact gap and asked that it not be repeated. It has been repeated. |
| **T063** | SC-003/SC-005 unmeasured; SC-009 (screen reader), SC-012 (5/5 testers) unwalked. 028's research **R9 — "does a hueless banner draw the eye?" — is now answerable for the first time** but has not been formally answered. |

**⚠ One requested change is not applied.** `FREEZER12` was to be unadvertised so Home carries two
banner placements rather than three. The seed file records the intent; the database still has it
advertised, and the live payload still returns six banners across three blocks. The `UPDATE` is a
live mutation and remains with the operator.

---

## Defects found and fixed during this slice

**The white scrim — found on device, and wrong for a structural reason.** The overlay was
`colorScheme.surface`, so in light mode it was a **white** wash: it bleached the photograph *and*
left dark type on a semi-transparent white film over a busy image, which is the worst contrast case
there is, because the effective background under each glyph is whatever the photo happens to be
doing. The fix names the underlying error: **the artwork is the same picture in both appearances**,
so the one thing making type legible over it cannot be the thing that inverts. Over artwork the
scrim is now fixed dark with fixed light type in both modes — both ramp steps, no new colour.

**The gradient was also the wrong shape.** It ran bottom-left → top-right, putting its *weakest*
point where the type needs it most: the text column is bottom-anchored and stacks title first, so
the largest text sits ~50% up, where the diagonal had already faded out. Now vertical, matching the
full-width band the text actually occupies.

**⚠ Home was intermittently 503-ing the whole storefront — and it is 027's defect recurring.**
Found from an operator log: `scan cards: timeout` at exactly 3.007 s. Nothing was slow; there were
too many round trips. `Home()` issued **8 strictly serial queries** and a round trip to Sydney RDS
**measures 135 ms** from a local `core-api` — so ~1.08 s of pure network latency, measured at 1.37 s
warm against a 3 s budget. **46% of the budget spent waiting**, so a cold pool or a slow moment on a
t4g.micro tipped it over; hence "only on first load, and only sometimes".

027 recorded this exact failure — *"~14 round trips to Sydney RDS inside a 4 s budget… a combined
read replaced N queries"* — fixed the cart **write** path, and left this read path, of identical
shape, untouched. The reads are mutually independent, so the serial depth was a property of the
**code, not the data**. Now two waves, with ordering held outside the goroutines because the server
owns section order. **Measured live: 1.37 s → 0.39–0.62 s.**

**Also fixed:** `BannerPlacement` declared in two files and colliding on re-export (declared once in
`banner.ts`); the dimension reader rejecting a valid 13-byte JPEG (one 16-byte minimum applied
*before* format detection); `BannerCanvas` conflating "has artwork" with "can preview it", so stored
artwork showed neither preview nor Remove; and `shared-types` shipping `test: echo "no tests" &&
exit 0`, honest while it held only types and dishonest the moment `banner.ts` added logic.

**⚠ POST-SIGN-OFF (2026-08-01) — the banner tap went nowhere useful.** Reported by the operator on
device, in the plainest possible terms: *"when user tap the banner it goes to the search page like
page. why!!!!"* They were right, and the answer is worse than a wrong destination.

`banners()` set `Target: &BannerTarget{Kind: "search"}` for **every** promotion. One hard-coded
destination, so a tap opened the unfiltered store — the Search tab by another name — and the
destination carried **none of the promotion's facts**: not the code, not the terms. The shopper lost
the offer on the way to it.

The reason no better destination existed is **in the data model, not the navigation**: `promo_code`
has no product or category scoping. A promotion is a whole-cart discount with an optional minimum, so
there is no set of qualifying products a results list could be filtered to. **A cart-level code is a
message, not a place**, and the destination for a message is the message itself, stated in full.

Fixed by adding a `promotion` target and a promotion detail screen, served by a new public hot-path
read `GET /v1/storefront/promotions/:id` that **re-applies the same visibility predicate Home used**
(shared as a SQL const, so the two reads cannot drift) — a promotion that expired or was exhausted
while Home sat on screen is answered 404 → **"this offer has ended"**, with no retry affordance,
rather than terms that are void. 028 gains **FR-034a/FR-034b**, which narrow FR-034 rather than
contradict it: that rule protects *content* a shopper could miss, and a promotion detail restates the
banner, so nobody who never sees the banner loses anything.

**⚠ THE TEST THAT SHOULD HAVE CAUGHT THIS ASSERTED THE DEFECT.** `banner_test.go` read:

```go
if b.Target == nil || b.Target.Kind != "search" {
    t.Errorf("every banner needs a target reachable elsewhere in the app (FR-034)")
}
```

It passed for every banner ever rendered, because it encoded the same misreading of FR-034 that the
implementation did. So did the cross-language wire contract, whose literal pinned
`"target":{"kind":"sale"}` — **a shape no banner ever emitted**. A contract test is only worth its
hand-duplication if it pins the payload that actually crosses the wire; both now do.

**Also found and fixed on the way:** a **404 was mapping to `AppError.Unexpected`** on mobile, so
"that isn't there" reached the shopper as "something broke, try again" — an invitation to retry
something that can never succeed. `AppError.NotFound` now exists and 404 maps to it.

**Fixed on BOTH surfaces, from one server decision.** `customer-web` gained `/promotions/[id]` in the
same change. Web routes on `href`, mobile on `target` — the closed vocabulary exists because mobile
has no URL router, while a URL is the web's native idiom — so the server sets both from the same
promotion id, and a Go test pins that they agree. Two fields naming one destination is exactly the
shape that drifts: one gets updated and the other quietly keeps sending a whole surface elsewhere,
which is precisely what `/search` was.

**✅ Confirmed working on a device by the operator, 2026-08-01** — the tap opens the promotion.
⚠ That is the **happy path only**. The refusal path (tap a banner whose promotion has since been
exhausted → "this offer has ended" on mobile, a 404 page on web) is **unit-proven on both surfaces and
walked on neither**: it needs a promotion taken down between a Home read and a tap.

**⚠ Two lessons worth carrying, both about tests that agree with the wrong thing:**

1. `pnpm -r test` was green while `pnpm -r typecheck` failed — **vitest does not run `tsc`**. It was
   caught only because the "Done" count dropped 12 → 11. Counting the packages that report is now
   part of the sweep, and is why the table above records 12/12 twice.
2. A Wikimedia `429` was **not** rate limiting — they require a descriptive `User-Agent` and refuse
   clients that send none, which is what Node's bare `fetch` does. Retrying harder would never have
   worked. The failure mode and the cause did not resemble each other.

---

## Carry-forwards

- **⚠ T051, the bypass test, is the one that should be walked first.** Everything else is polish;
  that one decides whether the feature's central guarantee exists.
- **`customer-web` is closer to parity, not at it.** The **banner tap is fixed on both surfaces**
  (2026-08-01) — web gained `/promotions/[id]`, routing on `href` where mobile routes on `target`,
  both set from one promotion id by one server, with a Go test pinning that they agree. What remains:
  the banner **face** on web still ignores `code` / `terms` / `placement`, so a promotion with a
  minimum shows its headline there without its terms and the carousel placement is mobile-only.
  ⚠ FR-037d is nevertheless satisfied — it asks that a condition reach the shopper *"from the banner
  **or from where it leads**"*, and where it leads now states it. The face is a presentation gap, no
  longer a shopper meeting a minimum at checkout.
- **⚠ The promotion detail has not been walked live on EITHER surface.** Its refusal path in
  particular — tap a banner for a promotion that has since expired or been exhausted, and confirm
  "this offer has ended" (mobile) / a 404 page (web) rather than live terms — is unit-proven only, and
  needs a live `core-api` plus a promotion taken down between the Home read and the tap (quickstart
  §4's exhaustion take-down, T054, covers the set-up). Clipboard copy is unverified on all three
  platforms; on web it additionally needs a **secure origin** to work at all, which `localhost`
  satisfies but a plain-HTTP LAN address does not.
- **A category rollup** (recursive CTE) remains what would make top-level category shortcuts
  possible; `productCount` still does not roll up and category filtering is still exact-match.
- **Mobile telemetry** stays deferred — **ten consecutive slices** now. Nine events are specified
  across 028/029 and none are emitted.
- **customer-web guest bundle is within budget but thin**: `/search` at 173.5 KB and `/cart` at
  173.8 KB against 174 KB — **0.5 KB and 0.2 KB of headroom**. The next client import on either
  route breaks the gate.
- **`core-api` pool sizing was deliberately left alone.** A cold start still opens up to 8
  connections at once against `MinConns = 2`. Raising it would smooth that, but the database is a
  t4g.micro shared with the cold path, so changing a shared resource was not taken unilaterally.

---

## Constitution

No amendment. This slice adds **no design token and no colour** — `tokens:check` passes unchanged
and both palette guards are green. The banner panel remains the **recorded no-card exception** from
028 (Principle V), and 029 **narrows** it rather than widening it by fixing the shape.

Principle II was followed rather than worked around: the canvas is defined once and consumed by the
seeder, the admin service, the console and the mobile renderer — no literal `1200` appears in any of
them.
