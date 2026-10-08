# Implementation Plan: Effy Delivery Windows — Today and the Next Three Days

**Branch**: `dev` (feature directory `078-effy-delivery-windows`) | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/078-effy-delivery-windows/spec.md`

## Summary

For "Delivered by Effy", the customer picks one window: under **Same-day delivery** (today, while its
cutoff has not passed, it has room and a collection run can still reach the hub) or under **Standard
delivery** (any of the next three delivery days, each window with its own room on each day). Fourth
slice of the delivery model v2 programme (backlog epic E4). **Built switched off**: customers see
today's checkout until the cutover (E9), because Effy drivers cannot yet deliver a later-day window (E8).

The approach, in seven decisions (reasoning in [research.md](research.md)):

1. **One switch for the whole programme, created now** — `delivery_settings.delivery_model_v2_from`,
   read only through `public.delivery_model_v2_at(now)`. No route sets it; E9 adds the setter behind
   its go-live checklist (R1).
2. **Capacity is already per day** (F1). Nothing in the schema changes for it; every *caller* that
   asks only about today learns to ask about a date.
3. **One window rule for every day** — `judgeSlot` becomes `judgeWindow(now, day, …)`; the collection
   test runs only for today; 069's `openSlots` calls it, so old and new paths share one rule (R3, R4).
4. **One window per order, no split** — the v2 path never consults the per-shop same-day bridge (R5).
5. **The customer's words decide the package's method** — `same_day` for today, `standard` for a later
   day; a `standard` package **with a window** is Effy's. One CHECK is relaxed; three readers that equate
   "standard" with "carrier" learn the difference (R6).
6. **The quote grows a second shape** (`effyWindows`), null while the switch is off; clients render it
   when present and ship before the cutover (R2).
7. **No new route.** The fullness grid and the look-ahead extend fleet's existing routes (R11).

⚠ **Three things the operator must know up front**
- **Nothing a customer sees changes on release.** The switch stays NULL until E9.
- **Do not turn the switch on in dev and leave it on.** A later-day order gets no driver round until E8
  and must be cancelled by hand (quickstart step 5).
- **"Standard delivery" changes meaning, not name** (operator decision 2026-10-08): from the switch it
  means *Effy, on a later day, in a window*. Backlog E5/E9 were corrected to keep the customer words.

## Technical Context

**Language/Version**: SQL (PostgreSQL 16, Goose 3.27); TypeScript on Node 22 (Lambda, arm64); React 19
(back-office Vite SPA, customer-web Next.js 16); Kotlin 2.4 / CMP 1.11 (customer-mobile).

**Primary Dependencies**: none added.

**Storage**: one forward-only, additive migration — two `delivery_settings` columns, one SQL function,
one relaxed CHECK on `order_package_delivery`. See [data-model.md](data-model.md).

**Testing**: Vitest table tests on the pure window calendar (P1–P5); container tests on the real
migration (P6–P13, P15, P16); a guard test (P14); React component tests (P18, P19); Kotlin `commonTest`
(P17, P18). Each proof broken once — [quickstart.md](quickstart.md).

**Target Platform**: `commerce` (shared gateway), `fleet` and `orders` (staff gateway), `notifications`
(worker), `shared` library; back-office, customer-web, customer-mobile; `infra/envs/dev/commerce-alarms.tf`.

**Project Type**: monorepo (backend services + web + mobile).

**Performance Goals**: a v2 quote adds one query (`delivery_slot_load` for up to 15 dates with
`= ANY`) and one (`ownLiveHolds` for the same dates) over today's; pricing is in memory — at most
windows × (1 + look-ahead) calls to `priceEffyOrder` (e.g. 5 × 4 = 20). No new client round trip.

**Constraints**: switch off ⇒ byte-identical quote (P9); no customer DTO carries capacity, a remaining
count, a shop or a per-package anything (FR-009); no polling (071); no cards; Melbourne time only; the
operator runs the migration, deploys and any switch change.

**Scale/Scope**: 1 migration, 1 SQL function; 0 routes added (shared 158, staff 146 of 300 —
unchanged); 2 customer routes and 2 staff routes change shape additively; 1 back-office panel rebuilt
as a grid + 1 setting; 2 customer checkout surfaces; 1 alarm.

## Constitution Check

*Constitution v3.2.0. Evaluated before research and again after design.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | The spec carries no technology. Two decisions found while specifying (the customer words, the switch) went **into the spec** as clarifications before planning. |
| II. Shared contracts | ✅ | `EffyWindowsDTO`, the intent field, the refusal code and the fleet grid live once in `@effy/shared-types` and are regenerated into the Kotlin contract. The customer sentences are written once and mirrored in `DeliveryWindowWords.kt`, held by a test (076's `CoverageWords.kt` pattern). |
| III. One backend; which service, which gateway | ✅ | **No new service or route.** Customer quote/intent extend `commerce` (shared gateway); the fullness grid and look-ahead extend `fleet` (staff gateway — back-office delivery operations); the three "standard ≠ carrier" readers are in `orders` (staff) and `fleet`. |
| III. A rule has one implementation | ✅ strengthened | One window rule (`judgeWindow`) for the quote, the hold and the legacy path; one switch reader (P14); `delivery_slot_load` stays the one definition of "a booking counts"; `clockOn` the one slot→instant conversion. |
| III. Money logic lives once | ✅ | No charge or refund path changes; the fee is 077's `priceEffyOrder`. |
| IV. Auth isolation | ✅ | Staff routes behind the staff gateway's only authorizer; mutate = admin/manager, read = any active staff (unchanged). |
| V. Design | ✅ | Customer: two sections, a day-tab strip and a list of windows — no cards. Back-office: a table grid (windows × days). Tokens only; `--warning` for over-limit, `--muted` for non-delivery. Reference: Uber Eats schedule sheet, Woolworths/Coles window pickers (R12). |
| VI. Layered architecture, raw SQL, no ORM | ✅ | `windows.ts` is pure; I/O stays in `slots.ts` readers; handler → service → repository unchanged in `fleet`. |
| VII. Observability | ✅ | `EffyWindowQuotes {outcome}`, a new code on `WindowChoiceRefusals`, `EffyWindowsNoneDefined` + Terraform alarm; PostHog `checkout_window_selected`, `checkout_windows_unavailable` (R13). No PII. |
| Real-world identifiers | ✅ | None introduced. |
| Live updates, no polling | ✅ | Existing `slots` kind covers every change shown; nothing new announced (holds deliberately not, R11). |
| Operator runs live changes | ✅ | Migration, deploys and the (dev-only, optional) switch are handed over in quickstart. |

**Post-design re-check**: unchanged. No violation; Complexity Tracking records three trade-offs.

## Project Structure

### Documentation (this feature)

```text
specs/078-effy-delivery-windows/
├── plan.md
├── research.md            # F1–F8, R1–R15
├── data-model.md
├── quickstart.md          # proofs P1–P20, operator steps, walks V1–V10
├── contracts/routes.md
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/<ts>_effy_delivery_windows.sql      NEW   # 2 settings columns, delivery_model_v2_at(), relaxed CHECK

packages/shared-types/src/
├── delivery.ts             # EffyWindowsDTO/EffyDayDTO/EffyWindowDTO; effyWindows on the quote; words; refusal code
├── checkout.ts             # intent: deliveryWindow
└── delivery-admin.ts       # slots response: days[], load[]; delivery days: effyLookaheadDays
packages/shared-types/contract/{commerce-schema.json,CommerceDto.kt,schema.json,Dto.kt}   # regenerated

apis/edge-api/shared/src/delivery/
├── windows.ts              NEW   # effyDays, judgeWindow, openWindows (pure)
├── windows.test.ts         NEW   # P1–P5
├── windows.container.test.ts NEW # P6, P7
├── windows.guard.test.ts   NEW   # P14
├── model.ts                NEW   # deliveryModelV2At(q, now) — the one reader of the switch
├── slots.ts                # judgeSlot/openSlots delegate to judgeWindow; slotLoad/ownLiveHolds take dates; settings + effyLookaheadDays
├── quote.ts                # v2 branch: one window per order, effyWindows + per-window-per-day fees; legacy branch unchanged
└── index.ts                # exports
apis/edge-api/shared/src/payments/finalize.ts     # unchanged logic; test for a later-date late payer (P8)

apis/edge-api/commerce/src/checkout/
├── quote.ts                # toQuoteDTO: effyWindows (null when off)
├── delivery-choice.ts      # resolveEffyWindow(): one window → packages same_day|standard + window; refusals
├── service.ts              # model switch → which resolver; metrics
├── store.ts                # captureDelivery judges the hold on its own date
└── checkout.container.test.ts   # P9–P12

apis/edge-api/orders/src/
├── handoff/repository.ts   # windowed package → not_carrier
└── orders/promise.ts       # on-time by window whenever one exists; no handover due for it
apis/edge-api/fleet/src/
├── slots/{sql,repository,service}.ts   # days[] + load[] for the offered days
├── deliverydays/{repository,service}.ts # effyLookaheadDays; non-delivery count includes windowed standard
└── functions/delivery-days-v1-put.ts    # accepts effyLookaheadDays
apis/edge-api/notifications/src/receipts/sender.ts   # window shown for a Standard delivery too (P13)

infra/envs/dev/commerce-alarms.tf   # EffyWindowsNoneDefined alarm

apps/back-office/src/features/delivery/
├── components/SlotsPanel.tsx        # grid: windows × (today + offered days), booked / limit, over-limit marked
├── components/DeliveryDaysPanel.tsx # "Days offered" (Effy) + legacy section labelled "until the switch"
└── queries.ts, repo.ts

apps/customer-web/
├── app/checkout/DeliveryOptions.tsx      # v2: Same-day + Standard sections, day tabs, window list, sentences
├── app/checkout/CheckoutFlow.tsx         # sends deliveryWindow; handles no_windows_available
├── lib/delivery-choice.ts                # picks v2 vs legacy by effyWindows !== null
├── components/receipt/*                  # "Standard delivery · Thursday 9 Oct, 4–6 pm"
└── lib/telemetry.ts                      # two events

apps/customer-mobile/shared/src/commonMain/…/features/checkout/
├── domain/{Checkout.kt,DeliveryWindowText.kt}
├── data/CheckoutMappers.kt
├── presentation/{CheckoutScreen.kt,CheckoutViewModel.kt,DeliveryWindowWords.kt (NEW),ReceiptScreen.kt,OrdersScreen.kt}
└── …/core/observability                  # two events

docs/delivery-console-guide.md · FEATURE-HISTORY.md · CLAUDE.md · docs/prd/2026-10-delivery-model-v2-backlog.md
```

**Structure Decision**: no new service, package or directory under `apis/edge-api/`. The new pure
calendar is its own file (`windows.ts`) so that E9 can delete `standard-days.ts` and the legacy half of
`quote.ts` as deletions, not edits.

## Build order

1. **Shared words and DTOs**; regenerate the Kotlin contract.
2. **`windows.ts`** + P1–P5 **before anything calls it**; then make `judgeSlot`/`openSlots` delegate and
   confirm the existing `slots.test.ts` / `sameday.test.ts` are still green unchanged.
3. **Migration** + `model.ts`; P6, P7, P14.
4. **Shared quote** v2 branch; legacy branch untouched (P9 snapshot written *first*, against today's code).
5. **Commerce**: DTO, resolver, intent wiring, hold on its date; P10–P12; finalize P8.
6. **Readers**: handoff, promise, non-delivery count, receipt sender; P13, P16.
7. **Fleet**: grid + look-ahead; P15. Alarm in Terraform.
8. **Back-office**: grid and setting; P19.
9. **Customer web, then mobile**: both shapes; P17, P18; telemetry.
10. **Docs**: console guide, FEATURE-HISTORY, CLAUDE.md, backlog; hand over operator steps.

## Risks

| Risk | What limits it |
|---|---|
| The switch is turned on before drivers can deliver a later day | No route sets it (R1); E9's setter checks readiness; quickstart and CLAUDE.md say so; dev-only manual set with a revert step. |
| A later-day Effy package is handed to the carrier | Handoff refuses a windowed package (P16). |
| Release changes what customers see | Switch off ⇒ quote byte-equal to a snapshot taken before the change (P9). |
| Capacity oversold on a later day | The slot row lock + per-date load (P7); late payers flagged, never refused after payment (P8). |
| A day repeats or disappears around DST / midnight | Noon-UTC day arithmetic, `clockOn` the one conversion; P5 on both 2026-10-04 and 2027-04-04. |
| A chosen "Wed" window becomes "Today" at midnight and is no longer valid | Re-judged at the intent with today's rules; refused `slot_unavailable` / `date_unavailable`, never substituted. |
| An old mobile build after the switch | It still renders truthful legacy fields; its intent is refused `slot_required` with a fresh quote. The mobile build ships before the cutover (E9 checklist). |
| A customer sees a "no windows" dead end | Plain sentence; alarm when no window is defined at all; courier fallback arrives with E5. |

## Complexity Tracking

No constitution violation. Three trade-offs worth recording:

| Trade-off | Why | Simpler alternative rejected because |
|---|---|---|
| Two quote shapes until the cutover | The new picker must be built, tested and shipped to phones before the switch, while the live checkout keeps selling same-day/standard | Replace the shape now: every customer would get later-day Effy windows that no driver can deliver (E8). |
| "`standard` + window = Effy" as a convention, not a column | The customer's word must stay on the package (operator decision); E5 adds `order.delivery_type` | A third method value: widens every method CHECK and must be unwound again by E5/E9. Recording later days as `same_day`: contradicts the meaning the operator said never changes. |
| The switch column created before its setter | One switch for the whole programme, read by one function | A 078-only flag: E9 would have to reconcile two switches; a setter now would skip E9's readiness check. |
