# Contracts: Effy Delivery Windows (078)

**No route is added or removed on either gateway.** Four existing routes change shape, additively.
Types live once in `@effy/shared-types` and are regenerated into the Kotlin contract.

| Route | Service · gateway | Change |
|---|---|---|
| `POST /commerce/v1/checkout/quote` | commerce · shared | response gains `effyWindows` |
| `POST /commerce/v1/checkout/intent` | commerce · shared | request gains `deliveryWindow`; new refusal code |
| `GET /fleet/v1/delivery-slots` | fleet · staff | response gains `days[]` and per-slot `load[]` |
| `GET` / `PUT /fleet/v1/delivery-days` | fleet · staff | gains `effyLookaheadDays` |

Customer order detail, receipt and receipt email: **no shape change** — they already carry the window
per package (research F7). ⚠ `arrivalEstimates` (and the receipt's method word) now hold one entry per
DISTINCT promise instead of one per package (`distinctArrivals`), so an order sold one window is one
delivery however many suppliers filled it.

Staff: `orders` handover refuses a windowed package with `422 not_carrier`; the handover list and the
orders list's "needs handover" count and filter skip it.

---

## 1. Quote — `DeliveryQuoteDTO.effyWindows` (`packages/shared-types/src/delivery.ts`)

```ts
/** 078 — ABSENT while the new delivery model is off: the response is then byte for byte the 077 quote. */
effyWindows?: EffyWindowsDTO | null;

export interface EffyWindowsDTO {
  /** Today first, then the next N delivery days. Never empty when present. */
  days: EffyDayDTO[];
  /** Set when no window is open on ANY day. The client shows NO_EFFY_WINDOWS_SENTENCE and cannot pay. */
  unavailable: "no_windows" | "none_defined" | null;
}

export interface EffyDayDTO {
  date: string;              // yyyy-mm-dd, Melbourne
  section: "same_day" | "standard";   // today → same_day; any later day → standard
  windows: EffyWindowDTO[];  // open windows only, earliest first
  /** Why `windows` is empty. Today: any of the three; a later day: only "full". */
  closedReason: "not_delivery_day" | "closed" | "full" | null;
}

export interface EffyWindowDTO {
  slotId: string;            // opaque
  date: string;
  startAt: string;           // ISO with the Melbourne offset
  endAt: string;
  cutoffAt: string;          // effective last moment (today: own cutoff or last collection, whichever first)
  surchargeAmount: string;   // what this window adds over the plain later-day fee; "0.00" when nothing
  fee: DeliveryFeeDTO;       // the order's delivery charge with this window (077 lines + total)
}
```

⚠ No capacity, remaining count or "full" window is ever sent (069 FR-050) — a full window is simply
absent. ⚠ Nothing per package; no shop reference. ⚠ With the model **on**, the legacy fields are still
filled (today's windows in `sameDaySlots`, the later days in `standardDays`) so an older client renders
truthfully; its intent is refused (below).

Words — `DELIVERY_WINDOW_WORDS` in `packages/shared-types/src/delivery.ts`, mirrored in the mobile
app's `DeliveryWindowWords.kt` and held to it by `effy-windows.test.ts`:

| Key (Kotlin constant) | Text |
|---|---|
| `sectionSameDay` (`SECTION_SAME_DAY`) | Same-day delivery |
| `sectionStandard` (`SECTION_STANDARD`) | Standard delivery |
| `todayClosed` (`TODAY_CLOSED`) | No windows left today. |
| `todayNotDeliveryDay` (`TODAY_NOT_DELIVERY_DAY`) | We don't deliver today. |
| `dayFull` (`DAY_FULL`) | Every window on this day is taken. |
| `noWindows` (`NO_WINDOWS`) | There are no delivery windows available in the next few days. Please try again later. |
| `cutoffPrefix` (`CUTOFF_PREFIX`) | Order by |

**The picker as words** — `effyWindowsView(effyWindows, now)` in `packages/shared-types/src/effy-windows.ts`
turns the DTO into exactly what is shown (day labels, "4 pm – 6 pm", "Order by 2 pm", the sentence for an
empty day, a surcharge or none). The website renders its output; the app renders its Kotlin twin; both
are pinned to `effy-windows.fixtures.json`.

## 2. Intent — `CheckoutIntentRequestDTO` (`packages/shared-types/src/checkout.ts`)

```ts
/**
 * 078 — the window the customer chose: one for the whole order. REQUIRED while the new model is on;
 * ignored while it is off (the 069 fields apply). The server derives same-day vs standard from the date.
 */
deliveryWindow?: { slotId: string; date: string } | null;
```

`DeliveryChoiceRefusalCode` gains `"no_windows_available"`. Refusals (409, body
`DeliveryChoiceRefusalDTO` with a fresh `quote`):

| Model on, and… | Code |
|---|---|
| no `deliveryWindow` sent (incl. a client built before 078) | `slot_required` |
| the window is switched off, past cutoff, uncollectable (today) or full on that date | `slot_unavailable` |
| the date is not among the days offered now (midnight passed, became non-delivery, beyond look-ahead) | `date_unavailable` |
| no window open on any day | `no_windows_available` |

Response unchanged: `slotHeldUntil` is the hold's end, whatever the date.

## 3. Fleet — `GET /fleet/v1/delivery-slots` (`packages/shared-types/src/delivery-admin.ts`)

```ts
interface DeliverySlotsResponseDTO {
  items: DeliverySlotDTO[];
  /** 078 — today, then the next effyLookaheadDays delivery days (non-delivery days skipped). */
  days: { date: string; isToday: boolean; nonDelivery: boolean }[];
}
interface DeliverySlotDTO {
  /* …069 fields, incl. bookedToday / overCapacityToday (kept for an older console)… */
  /** 078 — one entry per `days[]` date, same order. Holds that have not lapsed are counted. */
  load: { date: string; booked: number; overCapacity: number }[];
}
```

Read: any active staff. Counts come from `public.delivery_slot_load` and nowhere else.

## 4. Fleet — `GET` / `PUT /fleet/v1/delivery-days`

Gains `effyLookaheadDays: number` (1–14; `422 invalid_lookahead` otherwise). Mutate = admin/manager;
audited; announces `slots` after commit (as today).

## Live

No new kind. `slots` (ops) already fires on slot and day changes, on booking confirmation and on
cancellation. Customer surfaces re-read the quote when they return to checkout (071).
