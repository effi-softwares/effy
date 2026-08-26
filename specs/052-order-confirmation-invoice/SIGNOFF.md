# Sign-off: 052 — Order Confirmation & Emailed Receipt

**Date**: 2026-08-26 · **Status**: 🚧 **CODE-COMPLETE AND MACHINE-VERIFIED ON WEB + ANDROID + iOS +
EMAIL. NOT DEPLOYED. NOT WALKED BY A PERSON. NO RECEIPT HAS EVER BEEN SENT.**

**62 / 68 tasks.** All five user stories are built. The six that remain are **operator gates** — a
migration, three deploys, the live walks, and the commit.

⚠ **This document exists to record what was NOT done.** A sign-off that lists only achievements is a
press release.

---

## What was built

| | Web | Mobile | Email |
|---|---|---|---|
| US1 — the receipt document | ✅ | — | — |
| US2 — the same document on mobile | — | ✅ | — |
| US3 — the emailed receipt | — | — | ✅ |
| US4 — send it again | ✅ | ✅ | ✅ (the send) |
| US5 — honest about what it is | ✅ | ✅ | ✅ |

**One migration** (`20260826122449_order_receipt.sql`): three nullable `payment.method_*` columns and
`public.receipt_dispatch`. **One new cold-path route**, **one new scheduled worker**, **one alarm**.

---

## Verification (all green)

- **Go**: `build` · `vet` · `gofmt` clean · 15 packages `ok` under `-short`
- **Workspace**: `pnpm -r typecheck` **17/17** · `pnpm -r test` **17/17**
- **Counts vs. the T001 baseline**: customer-web **418 → 433** · email-kit **61 → 71** ·
  edge-customer **160 → 170 passed** (+13 skipped container tests) · edge-notifications **9 → 22** ·
  customer-mobile **~297 → 306**
- **Mobile**: iOS main + test compile · `testAndroidHostTest` 306/0 · `assembleDebug` · `cm-guard`
- **Gates**: `tokens:check` **unchanged** · `cm-tokens-check` unchanged · `email-check` 10 templates ·
  `brand-check` 57 assets · `terraform validate` · guest bundle **within budget on all 15 routes**

### Proven by deliberately breaking it

- **The stage rollup** — turning it into a `max` makes `TestStageFor_IsTheLeastAdvancedPortionNotTheMost`
  fail and nothing else. Without that, one delivered portion would report the whole order delivered.
- **The contract key-set test** — renaming a DTO field fails it, naming both the missing and the
  unexpected key.
- **SC-010 by deletion** — removing `status-palette.ts` breaks exactly 3 imports and nothing else.

---

## ⚠ What was NOT done

### Six operator gates (T063–T068)

1. **The migration has not run.** Commit it first — the 003 commit-guard refuses otherwise.
2. **Nothing is deployed.** ⚠ Deploy **`core-api` before `customer-web`** (047 recorded that reversing
   it briefly broke dev checkout). `edge-customer` and `edge-notifications` both need deploying.
3. **The SC walk (T065/T066)** — five observers, the mail-client matrix, dark mode, screen reader.
4. **The three negative proofs (T067)** are written but **unexecuted**: Docker was not running here, so
   every container-backed test **skipped**.
5. **The commit.**

### Not verifiable by any test I can write

⚠ **No human has looked at any of this.** Layout, contrast and hierarchy are not properties a DOM
assertion or a Compose unit test can see — 039 shipped **four live defects** with a fully green suite
for exactly that reason (an orphaned divider, a backwards phone layout, a CTA hierarchy that vanished
in dark mode, a scrim bleaching the artwork). Assume this slice has its own.

⚠ **The email has been rendered, never delivered.** The 25-item budget test proves it fits Gmail's
102 KB clip; nothing proves it looks right in **Outlook's Word engine**, which nothing open-source
substitutes for.

⚠ **Android specifically.** 033 and 049 each recorded that Android had gone unlooked-at across several
slices. That streak is unbroken here.

### Carry-forwards

- **iOS enum forward-compatibility.** `OrderStage` generates as a kotlinx `enum class`, and `effyJson`
  sets `ignoreUnknownKeys` (which covers keys, **not enum values**) without `coerceInputValues`. A
  fifth stage added later would fail the receipt read on older builds. ⚠ **This slice did not fix it**:
  the exposure is identical for `BannerPlacement`, `BannerTarget.Kind` and `OrderStatus`, and the only
  real fixes are platform-wide. Recorded in the contract, not papered over.
- **The mobile line image is a placeholder tile.** `imageUrl` reaches the domain model and is not
  rendered — Compose image loading is a per-platform decision this slice did not take.
- **`ProblemType` has no `NotFound`.** Six files now declare the same URI as a local const. Worth
  collapsing; deliberately not done as a side effect of a receipt slice.
- **No PDF, no print stylesheet** — out of scope by the operator's own answer. Worth revisiting, since
  "a keepable copy" is most of why people ask for an invoice.

### The tax invoice (FR-034)

**Two prerequisites, neither engineering work in this slice:**

1. ⚠ **The ABN is unsupplied.** `identifiers.json` holds `[ABN]`. Operator input; the constitution
   forbids inferring it.
2. ⚠ **Per-item GST treatment is unmodelled** — and for a grocer this is the harder one. Basic food is
   GST-free in Australia, so an Effy basket is a **mixed supply**: "total price includes GST" is
   **false** for most orders, and the ATO's "extent to which each sale is taxable" requirement cannot
   be met from data that does not exist. It needs a taxable/GST-free flag on `public.product`.

⚠ **Supplying the ABN alone changes nothing** — `canIssueTaxInvoice()` stays false until both land.
Whoever supplies it and expects tax invoices to start appearing should find that function.

---

## ⚠ Defects found in EARLIER work, fixed here

Recorded so they are not mistaken for 052's own.

1. **The mobile receipt's lines did not add up.** `deliveryFeeAmount` was never mapped in
   `CheckoutMappers.kt`, so the screen showed Items − Discount = Total while delivery had been charged.
   051's FR-043 recorded this exact defect and fixed it **on web only**. Same shape as 033's
   mapper-drops-what-the-backend-sends finding.
2. **`packages/brand` was RED before this slice began.** 048 added a `robots.txt` to both consoles and
   never exempted it, so `brand-check` reported them as orphaned assets — and **aborted `pnpm -r test`
   at 4 packages of 17**. Nobody had noticed because the exit code was the only visible signal.
3. **`MethodList.test.tsx` had been asserting nothing.** 051's `5a540f4` moved the row to `rounded-xl`
   and moved `border-foreground` onto the radio indicator; the test's selector matched **zero
   elements**.
4. **`NOTIF_MAX_ATTEMPTS`/`NOTIF_BATCH_SIZE` were undeclared** in 050's `serverless.yml`. Not fatal
   (they have code-side defaults, unlike 035's four) but the same shape. Now declared.
5. **Raised, NOT fixed** — 051's call: the selected payment row is `border` and the unselected
   `border border-input`, which resolve to the **same `#e5e5e5`** in light mode, under a comment
   claiming a "doubled border". Selection is still unambiguous via the radio, so it is a stale comment
   rather than a usability defect.

---

## Corrections to my own artifacts, made during implementation

- ⚠ **A name collision `tsc` caught.** `DeliveryPromiseDTO` already existed in `shop-order.ts` — the
  **shop's** `readyBy` at the fulfilment node, which research R4 says must never reach a customer. Same
  name, opposite audience. Renamed to `ArrivalEstimateDTO`.
- ⚠ **My contract asserted a forward-compatibility guarantee that does not exist** (the enum issue
  above). Corrected in the contract rather than left standing.
- ⚠ **`make check-tokens` does not exist.** My quickstart and tasks referenced a phantom target; the
  real gates are `tokens:check` and `cm-tokens-check`.
- ⚠ **I destroyed the email budget fixture.** The 25-item basket SC-006 depends on was replaced with a
  3-item one; the existing `toBeGreaterThanOrEqual(20)` assertion caught it immediately.
- ⚠ **I split "tax invoice" across a newline** in the plain-text part, so a plain-text reader searching
  the phrase would not find it. Caught by the FR-032 assertion.
- ⚠ **A process error**: I ran `git checkout` to revert a deliberate test-breaking experiment and wiped
  ~48 lines of handler work. Caught immediately and reapplied. I should have restored from a copy.

---

## The one-query triage

`docs/receipt-triage.md`. Short version:

```sql
SELECT reason, status, attempts, last_error, message_id, created_at, processed_at
  FROM public.receipt_dispatch WHERE order_id = $1 ORDER BY created_at DESC;
```

no row = never paid or pre-052 · `pending` and old = drain not running or mail unconfigured ·
`skipped` = no address · `failed` = read `last_error` (⚠ most likely the SES grant needing **both**
the identity and the configuration-set ARN) · `sent` = join `message_id` to `email_delivery_event`.
