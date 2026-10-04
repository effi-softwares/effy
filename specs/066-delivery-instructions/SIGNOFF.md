# Sign-off — 066 Customer Delivery Instructions

**Date**: 2026-10-04 · **Status**: 🚧 **49/51 — CODE-COMPLETE AND MACHINE-VERIFIED. NOT DEPLOYED, NOT
COMMITTED, NOT WALKED BY A PERSON.** The two open tasks are the operator's: the deploy (T050) and
the walks plus the two live bypass/leak checks (T051).

## What this slice changed that was not true before

**A customer can tell the driver how to deliver an order, and the driver reads it.** At checkout a
shopper chooses "Leave at the door" or "Meet at the door", types a note of up to 250 characters, or
both. The order keeps what was said; the driver sees it on the en-route, arrived and drop-detail
screens; back-office staff and the shopper see it on the order.

Also now true, and not before:

- **The driver's instruction area has content.** `DeliveryDropDTO.instructions` has existed since
  049 and three driver screens render it; the service returned a hard-coded `null` because nothing
  stored the text.
- **An address can carry default instructions** that prefill checkout, and an order can override
  them without changing what is saved.
- **"Leave at the door" is the customer's decision.** The driver app states it and leads the proof
  chooser with the unattended option. It removes nothing.

## Built

| Layer | What |
|---|---|
| Migration | `20261004052207_delivery_instructions.sql` — 2 columns on `"order"`, 2 on `customer_address`, 4 CHECKs |
| `shared-types` | `delivery-instructions.ts` (vocabulary, limit, `normaliseDeliveryInstructions`, labels) + a 20-case fixture shared with Go; fields on 5 DTOs; 3 Kotlin contracts regenerated |
| `core-api` | `platform/deliveryinstructions` (the Go mirror); checkout intent validates and stores; customer order read returns them |
| `edge-customer` | address CRUD carries default instructions; update keyed on PRESENCE so a default can be cleared |
| `edge-driver` | drop read returns the note in `instructions` and the preference in `handover` |
| `edge-orders` | back-office order detail returns them |
| `edge-shared` | guard: no shop or notification code path may reference them |
| `customer-web` | `DeliveryInstructions` control; checkout draft, prefill, per-order override, "save to this address"; receipt and order page; address form |
| `back-office` | order detail |
| `customer-mobile` | `features/deliveryinstructions/` (domain, mappers, shared field); checkout, receipt, address form |
| `driver-mobile` | handover sentence in the instruction callout on three screens; proof chooser order |

## Verified

`pnpm -r typecheck` **20/20** (unchanged) · `pnpm -r test` exit 0 · Go build / vet / gofmt clean,
`go test -short ./...` clean, checkout suite with containers green · all three Kotlin contracts
regenerate byte-stable · customer-web production build and **bundle sizes byte-identical on all 16
gated routes** · depcruise clean · both mobile apps: Android host tests green and **iOS test target
compiles** · `mobile-guard` clean.

| Suite (with containers) | Before | After |
|---|---|---|
| shared-types | 7 | 34 |
| edge-shared | 135 | 137 |
| edge-customer | 203 | 217 |
| edge-driver | 128 | 132 |
| edge-orders | 54 | 57 |
| customer-web | 463 | 489 |
| back-office | 230 | 233 |
| customer-mobile (Android host) | 316 | 331 |
| driver-mobile (Android host) | 49 | 54 |
| Go `deliveryinstructions` | — | new, 23 cases incl. the shared fixture |
| Go checkout container tests | — | +5 against every migration |

**Docker was up for the whole run**, so every container test executed.

### Negative proofs, each executed by breaking the thing

| # | Break | Caught by |
|---|---|---|
| 1 | Raise the limit to 300 in TypeScript only | 3 fixture cases in the TypeScript suite |
| 1b | Raise it in Go only | `TestSharedFixture_GoAgreesWithTypeScript` |
| 2 | Make the hot path read the address's saved default | the source guard, naming `store.go` |
| 3 | Select `delivery_note` in a shop repository | the prohibition guard, naming the file |
| 4 | Render the note with `dangerouslySetInnerHTML` (customer-web, then back-office) | the plain-text test on each |
| 5 | Switch the address PATCH to `COALESCE` | 2 container tests — the saved default could no longer be cleared |

## Defects found while building

1. **My own — the mobile "clear" would have silently kept the saved default.** customer-mobile's
   JSON omits null fields, and the address PATCH reads an omitted field as "leave it alone". A
   cleared default sent as `null` would never have reached the wire. It is sent as an empty object
   instead, and `DeliveryInstructionsTest` pins the exact bytes (`{}`).
2. **My own — a Go comment contradicted its code** ("trim spaces, not all Unicode whitespace" above
   a `TrimFunc(unicode.IsSpace)`). Corrected before any test relied on it.
3. **Existing guard did its job.** `TestOrderDTO_KeySetMatchesTheContract` failed the moment the
   order read gained a key, and was updated from the contract, not from the struct.

## Deviations from the plan and tasks

- **Not in the address snapshot.** As planned (research R1), the order's instructions are columns,
  not keys in `delivery_address`; a container test asserts the snapshot contains neither value.
- **New contract fields are optional (`?:`)**, not required-nullable as `contracts/` first drew
  them, so every surface tolerates a server that has not deployed yet. Servers always send the key.
- **Validation refusals are HTTP 400**, the status both backends already use for validation; the
  contract draft said 422.
- **T012 has no separate handler test.** The no-echo property is proven where the error is made
  (`TestErrorsNeverCarryTheSubmittedText`, and the TypeScript equivalent); the handler adds a static
  message.
- **T035 has no dedicated address-form test on web.** The form reuses the tested control and the
  tested draft helpers; the checkout flow test covers the PATCH body.
- **customer-mobile does not carry a third copy of the normalisation rule.** It clamps typing to
  the limit, sends what was typed, and shows what the server stored. The one duplicated value is
  the number 250, pinned by a test.
- **A failed "save to this address" is silent** on web and mobile: the order already has the
  instructions and the flow is moving to payment.
- **The web telemetry call is a static import**, not dynamic: it sits in the checkout flow, which
  already imports telemetry and is not a guest route. Bundle sizes did not move.

## Not done, stated plainly

- **`checkout_delivery_instructions_set` emits nothing.** PostHog is not initialised on
  customer-web, and customer-mobile's commerce events have no emitter. Declared and documented only.
- **Nobody has looked at any screen**, on any of the four surfaces.
- **SC-001 and SC-011 are unmeasured** (time to add instructions; fewer failed deliveries).
- **The two live checks in quickstart §4 have not been run**: the 251-character `curl` at the
  deployed hot path, and the log sweep for a sentinel note.
- **Instructions for standard packages are stored and never passed to the outside carrier.**

## Pre-existing failures, NOT caused by this slice

- `make storefront-locks` is red **at HEAD** (verified by stashing): `StorefrontFooter.tsx`,
  `PrimaryNav.tsx`, `MobileNav.tsx` differ from the committed baseline. This slice touches none.
- Two `edge-shop` container tests (attention recipients; order paging), as recorded by 065.

## Open (operator)

1. Commit.
2. `make db-up ENV=dev` — additive, safe first.
3. `make core-image-push ENV=dev && make core-deploy ENV=dev` — ⚠ **before pushing customer-web**:
   an older core-api ignores the new field, so a shopper's instructions would be dropped silently.
4. `make edge-deploy SERVICE=customer ENV=dev`, then `SERVICE=orders`, then `SERVICE=driver` — none
   before step 2; each names the new columns.
5. Push to `dev` (customer-web, back-office), then release both apps.
6. Walk W1–W13 and run §4 of [quickstart.md](quickstart.md). ⚠ **W11** (markup in a note, on every
   surface) and **W13** (the shop console and the receipt email show nothing) are the two that
   matter most; **W5** is the first time a driver will ever see an instruction.
