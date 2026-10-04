# Research: Customer Delivery Instructions

Every finding was read from the code on `dev` at 2026-10-04.

## R1. Where the order's instructions are stored

**Decision**: two nullable columns on `public."order"` — `delivery_handover` and `delivery_note` —
**not** keys inside the `delivery_address` jsonb.

**Rationale**: the spec says to keep them "alongside the delivery address snapshot", and the jsonb
is the obvious place. It is the wrong one. `o.delivery_address` is read by fifteen non-test files
in seven services:

| Reader | Audience | Passes the object on? |
|---|---|---|
| `core-api/features/orders/orders.go` | customer | whole object |
| `edge-api/orders/src/orders/{repository,service}.ts` | back-office | whole object (`deliveryAddress: order.delivery_address`) |
| `edge-api/shop/src/{orders,fulfillments,pick-lists,today}/repository.ts` | **shop** | via `mapDelivery`, plus `->> 'recipientName'` |
| `edge-api/notifications/src/receipts/{repository,sender}.ts` | **email** | via `addressLines` |
| `edge-api/driver/src/work/{delivery,sql}.ts` | driver | named keys |
| `edge-api/fleet/src/{planner,dispatch,exceptions}/sql.ts` | back-office | named keys |

Two of those audiences are forbidden (FR-025 shops, FR-027 emails). A key inside the jsonb would be
one refactor of `mapDelivery` or `addressLines` away from reaching them, with nothing failing.
Separate columns make the forbidden readers safe by construction: they would have to add the column
to a SELECT on purpose, and a guard test fails if they do.

**Alternatives considered**:
- *Inside the jsonb.* Rejected, above.
- *A separate `order_delivery_instructions` table.* Rejected: it is 1:1 with the order, written
  once, never queried alone. A join to learn two values is 054's side-table argument again.

## R2. Which path writes them, and when

**Decision**: the hot path, at payment intent. `CreateCheckoutIntentRequest` gains an optional
`deliveryInstructions`; the service validates it and a new `SetOrderDeliveryInstructions` store call
writes both columns, mirroring the existing `SetOrderBilling` (`checkout/store.go`), in the same
flow that writes the address snapshot (`AddressSnapshot` → `UpsertPendingOrder`).

**Rationale**: orders and checkout are hot-path work (the routing law, 011 FR-028), and the address
snapshot is taken at intent. Each intent rewrites the pending order, so the stored instructions are
those of the **last** intent before payment — which is "at placement". After the order is paid
there is no writer at all, which is FR-010 by absence rather than by a guard.

A request with the field absent writes NULL/NULL. That is what an old mobile build sends.

## R3. One validation rule

**Decision**: a pure `normalise` in `packages/shared-types/src/delivery-instructions.ts`:

1. Collapse runs of whitespace other than single line breaks; strip control characters except
   `\n`; trim.
2. Empty after that → no note (FR-005).
3. Count **Unicode code points**, not UTF-16 units; more than 250 → refuse (FR-003, FR-029 — an
   emoji is one character to the person typing it).
4. Handover is one of the closed set or absent.

Clients call it to show the remaining count; servers call it to decide. The Go mirror in
`internal/platform/deliveryinstructions` implements the same four steps and is pinned by a fixture
file both languages read (the pattern of `wire_contract_test.go` ↔ `BannerWireContractTest.kt`,
028). The database CHECK (`char_length(delivery_note) <= 250 AND btrim(delivery_note) <> ''`) is the
backstop, and `char_length` counts code points, so all three agree.

**Why not client-side only**: FR-007 and SC-009. A `curl` to the intent route must be refused.

## R4. The saved default

**Decision**: `customer_address` gains `default_delivery_handover` and `default_delivery_note`
(same CHECKs). Address CRUD stays on the cold path (`edge-api/customer/src/addresses/`), where it
already is; `AddressDTO` and the create/update requests gain the two fields.

The checkout **draft** is client state: `{ handover, note, edited }`.
- Selecting an address sets the draft from that address's default and `edited = false`.
- Typing or choosing sets `edited = true`.
- Switching address replaces the draft with the new address's default (FR-015), edited or not —
  the alternative carries a note about one building to another.
- "Save to this address" is an explicit checkbox; when ticked, the client PATCHes the address after
  a successful intent. Unticked, nothing is written to the address (FR-014).

**Update semantics**: the address PATCH reads the **presence** of each key (056's lesson —
`COALESCE($n, col)` cannot tell "leave alone" from "clear"), so FR-016's clear is expressible.

**The hot path never reads the address's default.** It writes only what the request carries. So a
placed order cannot be affected by an address edit, and US4 holds by construction.

## R5. What the driver contract carries

**Finding**: `DeliveryDropDTO.instructions: string | null` exists and is rendered by
`EnRouteScreen`, `ArrivedScreen` and `DeliveryScreens` through `InstructionCallout`.
`deliveryDrop` (`edge-api/driver/src/work/delivery.ts`) returns `instructions: null` under a comment
recording that nothing stores it.

**Decision**: `instructions` carries the **note**, verbatim. A new field
`handover: "leave_at_door" | "meet_at_door" | null` carries the preference, and the app renders its
sentence ("Customer asked for this to be left at the door"). The preference is not folded into the
string: the app must act on it (R6), and the server composing English for a mobile app to display
is the wrong layer.

Installed driver builds ignore the new field (`ignoreUnknownKeys = true`,
`EffyHttpClient.kt:19`) and simply start showing the note.

## R6. "Leave at the door" and proof

**Finding**: 064 made contactless completion require a photograph (`delivery_proof` method
`contactless`, FR-002 of 064). The proof chooser offers Photo, Signature and Contactless.

**Decision**: when `handover = leave_at_door`, the arrived screen states it and the proof chooser
lists the unattended option first with a line saying the customer asked for it. When
`meet_at_door`, the chooser says the customer wants to receive it in person. **Nothing is
disabled** (FR-020): a driver handing over a "leave at the door" order to a customer who opened the
door completes it with a signature or photo as it happened. No backend rule changes; the proof
service is untouched.

## R7. Keeping the text out of emails, logs and telemetry

- **Emails**: `receipts/repository.ts` selects named columns; neither new column is added. A guard
  test reads `edge-api/notifications/src` and fails naming any file containing `delivery_note` or
  `delivery_handover`.
- **Shops**: the same guard over `edge-api/shop/src`.
- **Logs** (T003, verified 2026-10-04): core-api's request logging (`platform/httpx/logging.go`)
  does not log request bodies. Validation errors name the field and the rule, never the value. The refusal for an
  over-long note says "too long", not what was sent.
- **Telemetry**: the one event carries an enum and two booleans.

## R8. Deploy order and old clients

**Decision**: `make db-up` → `core-deploy` → `edge-deploy SERVICE=customer` →
`SERVICE=orders` → `SERVICE=driver` → web push → app releases.

- The migration is additive and safe first.
- core-api must be live before any client sends the field (an older core-api ignores unknown JSON
  keys, so the instructions would be silently dropped — the customer would believe they were heard).
  ⚠ So core-api deploys **before** customer-web is pushed to `dev`, as 047 and 052 already require.
- The driver and orders services name the new columns and must not deploy before the migration.
- Old customer-mobile builds send nothing and show nothing: unaffected.
