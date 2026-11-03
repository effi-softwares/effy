# Data Model: Guided Tours (106)

## Stored: `public.console_tour_state` (new migration, forward-only)

One row per person per console. Written and read only by `@effy/edge-shared/tours` (`store.ts`).

| Column | Type | Rule |
|---|---|---|
| `audience` | `text NOT NULL` | `CHECK (audience IN ('shop','admin'))`. Set by the service, never by the client. |
| `subject` | `text NOT NULL` | The caller's Cognito `sub`, from their own token. |
| `offer_tours` | `boolean NOT NULL DEFAULT true` | "Show tours on new pages" (tours start by themselves). |
| `seen` | `jsonb NOT NULL DEFAULT '{}'` | `{ "<tourKey>": { "v": int, "outcome": "finished"\|"closed"\|"declined", "at": ISO } }` |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

- **Primary key** `(audience, subject)`.
- `CHECK (jsonb_typeof(seen) = 'object')`.
- **Row size bound**: the store refuses a write that would make `seen` exceed **100 keys** (the consoles have 16 + ~30
  tours). Tour keys match `^[a-z0-9][a-z0-9-]{0,39}$`, and `v` is an integer from 1 to 1000.
- **No foreign key** to `shop_staff` / `admin.staff`: the row is a preference of a signed-in subject. It is never
  joined, and it may exist for a subject the platform has not yet recorded.
- Grants: the baseline's `ALTER DEFAULT PRIVILEGES` covers the table. The shop service's role owns its writes.
- **Not append-only, not audited**: it is a person's own UI preference, not a business record.

### State transitions (per tour key, per person)

```
(absent) ──started (by itself or by hand)──▶ closed (written at once, R13) ──finished──▶ finished
                              └─closed early / page changed / reload──▶ stays closed
any ──"Show every tour again"──▶ (absent)   (the whole `seen` map is emptied)
any ──later write──────────────▶ the latest outcome and version overwrite the earlier ones
```

**Start rule** (client, `shouldOffer(tour, state)`): a tour starts by itself when `state.offer_tours` is true AND
(`seen[key]` is absent OR `seen[key].v < tour.version`). The second case shows "Updated" in All tours. `declined` stays a valid outcome on the wire but is no longer written (2026-11-03: tours start by themselves).
`welcome` follows the **same** rule: the switch suppresses it, and a raised version re-offers it. Its only
difference is **precedence**: while `welcome` would be offered, no page tour is offered.

## Wire: `ConsoleTourStateDTO` (`@effy/shared-types`, `tours.ts`)

```ts
interface ConsoleTourSeenDTO { version: number; outcome: "finished" | "closed" | "declined"; at: string }
interface ConsoleTourStateDTO { offerTours: boolean; seen: Record<string, ConsoleTourSeenDTO> }
type ConsoleTourPatch =
  | { tour: string; version: number; outcome: "finished" | "closed" | "declined" }
  | { offerTours: boolean }
  | { reset: true }
```

A person with no row reads as `{ offerTours: true, seen: {} }`. The first PATCH creates the row (upsert).

## Client-only: the tour definitions (`SHOP_TOURS`, `apps/shop-web/src/features/tours/tours.ts`)

```ts
interface TourDef {
  key: string                       // "orders-queue"; unique; matches the key rule above
  version: number                   // raise to re-offer (FR-021)
  title: string                     // shown in All tours
  needsRecord?: "order" | "product" // FR-007
  steps: TourStepDef[]              // 1..12
}
interface TourStepDef {
  target: string | readonly string[] | null // data-tour key(s); first present wins; null = centred
  title: string                              // ≤ 40
  text: string                               // ≤ 220
  side?: "top" | "right" | "bottom" | "left" // default "bottom"
  managersOnly?: boolean                     // FR-012
}
```

The Tour Inventory in [spec.md](spec.md) is the content. The "Shown when" column becomes `managersOnly` (Manager) or
nothing (presence decides: R2, FR-011).

## Client-only: the running tour (TanStack Store, `@effy/web-kit/tour`)

| Field | Meaning |
|---|---|
| `page` | `{ key, status: "loading" \| "ready" \| "error" }`, registered by `useTourPage` (research R6) |
| `active` | `{ key, via, index, shown: number[] } \| null`. `shown` is the step indexes present when each step was reached, so "Step N of M" counts only those (FR-009). |
| `dismissed` | tour keys not to start by themselves again this session (started already, or a page whose Welcome was closed early) |
| `pendingStart` | `{ key, via } \| null`: a start waiting for its opener (menu, palette, dialog) to close (research R7) |

**Every step skipped**: the provider shows one centred card with the tour's `title` and the fixed sentence
`EMPTY_TOUR_SENTENCE = "There's nothing here to show yet. Try this tour again once the page has something in it."`
(in `@effy/web-kit/tour`), with only **Done**. It is recorded as `closed`.
