# Quickstart: validating 066

Contract: [contracts/delivery-instructions.md](contracts/delivery-instructions.md) · Data:
[data-model.md](data-model.md)

## Prerequisites

- Docker running, for the container tests.
- A dev customer with two saved addresses.
- For the driver walks: 063 and 064 live on dev, and a driver who can be assigned a same-day round.

## Baseline (T001, measured 2026-10-04 before any change)

| Check | Before | After |
|---|---|---|
| `pnpm -r typecheck` reporting packages | 20 | 20 |
| `@effy/shared-types` | 7 | 34 |
| `@effy/edge-customer` (default / with containers) | 170 + 33 skipped / 203 | 178 + 39 skipped / 217 |
| `@effy/edge-driver` (with containers) | 128 | 132 |
| `@effy/edge-orders` (with containers) | 54 | 57 |
| `@effy/customer-web` | 463 | 489 |
| `@effy/back-office` | 230 | 233 |
| `go test -short ./...` non-ok packages | 0 | 0 |
| customer-mobile `:shared:testAndroidHostTest` | 316 | 331 |
| driver-mobile `:shared:testAndroidHostTest` | 49 | 54 |
| customer-web `size`, 16 gated routes | within budget | byte-identical |
| `contract:check`, `commerce-contract:check`, `driver-contract:check` | green | regenerate byte-stable; ⚠ read red until the regenerated files are committed |

## 1. Machine checks

```sh
pnpm -r typecheck
pnpm --filter @effy/shared-types test          # normalise + the shared fixture
pnpm --filter @effy/shared-types contract:check commerce-contract:check driver-contract:check
CONTAINER_TESTS=1 pnpm --filter @effy/edge-customer test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-driver test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-orders test
(cd apis/core-api && go test ./internal/platform/deliveryinstructions/... ./internal/features/checkout/... ./internal/features/orders/...)
pnpm --filter @effy/customer-web test && pnpm --filter @effy/customer-web build && pnpm --filter @effy/customer-web size
pnpm --filter @effy/back-office test
(cd apps/customer-mobile && ./gradlew :shared:testAndroidHostTest :shared:compileTestKotlinIosSimulatorArm64)
(cd apps/driver-mobile && ./gradlew :shared:testAndroidHostTest :shared:compileTestKotlinIosSimulatorArm64)
```

## 2. Deploy (operator; order matters)

```sh
make db-up ENV=dev
make core-image-push ENV=dev && make core-deploy ENV=dev   # ⚠ BEFORE pushing customer-web
make edge-deploy SERVICE=customer ENV=dev
make edge-deploy SERVICE=orders ENV=dev
make edge-deploy SERVICE=driver ENV=dev
# then push to dev (customer-web, back-office), then the app builds
```

## 3. Walks

| # | Do | Expect | Proves |
|---|---|---|---|
| W1 | Checkout on web: choose "Leave at the door", type a note, pay | Confirmation and order page show both, exactly as typed | US1, SC-001 |
| W2 | Checkout with nothing entered | No instruction area anywhere, no placeholder | SC-003 |
| W3 | Type to 250 characters, including an emoji as the last one | Counter reaches 0; a 251st is not accepted | FR-004, FR-029 |
| W4 | Enter instructions, fail the payment with a declined test card, retry | The text is still there | FR-006 |
| W5 | As the assigned driver, open that drop | Note on en-route, arrived and detail; "asked for this to be left"; proof chooser leads with unattended and asks for a photo | US2, FR-019 |
| W6 | Same order, hand it over in person with a signature | Completes normally | FR-020 |
| W7 | Save instructions on address A; start checkout with A; switch to B; switch back | A's are prefilled; B shows B's (or empty); back to A shows A's | US3, FR-015 |
| W8 | Edit prefilled text for one order without ticking "save"; pay; open the address book | Order has the edit; address A unchanged | FR-014 |
| W9 | After W1, change then delete the address | The order still shows the original | US4, SC-005 |
| W10 | Back-office → Orders → that order | Instructions shown with the delivery address | US5 |
| W11 | Note: `<b>x</b> <a href="https://example.com">l</a> <script>alert(1)</script>` | Those literal characters on customer-web, back-office, both apps and the driver app; nothing bold, linked or run | SC-006 |
| W12 | Repeat W1, W2, W7 on customer-mobile | Same behaviour | SC-010 |
| W13 | Open the same order in the shop console and read the receipt email | Instructions appear in neither | FR-025, FR-027 |

## 4. Bypass and leak checks

```sh
# SC-009 — 251 characters straight at the hot path → 422, nothing stored
curl -s -X POST "$CORE/v1/checkout/intent" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"addressId\":\"$ADDR\",\"deliveryInstructions\":{\"handover\":null,\"note\":\"$(printf 'x%.0s' {1..251})\"}}"

# SC-007 — place an order whose note is the sentinel EFFY066SENTINEL, then:
#   core-api, edge-customer, edge-driver, edge-orders logs for the session contain it zero times;
#   the receipt email body contains it zero times.
```

## 5. Negative proofs (break it, see it caught)

- Raise `DELIVERY_NOTE_MAX` in TypeScript only → the shared fixture fails in Go.
- Read the address's default in the hot path instead of the request → the US4 container test fails.
- Add `o.delivery_note` to a shop repository SELECT → the prohibition guard fails naming the file.
- Render the note with `dangerouslySetInnerHTML` → the plain-text test fails.
- Make the address PATCH use `COALESCE` → the "clear a saved default" test fails.
