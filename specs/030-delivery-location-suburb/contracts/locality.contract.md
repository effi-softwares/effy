# Contract: Locality Lookup & Delivery-Location Display (030)

Binding on the Go hot path, `@effy/shared-types`, `customer-web`, and `customer-mobile`. Three
sections: the wire, the display rule, and the guest-path constraint.

---

## §1 — `GET /v1/storefront/localities`

**Public. Unauthenticated. Cacheable.** Mounted in `storefront.Register` beside `/serviceability`,
which it partners.

### Request

```
GET /v1/storefront/localities?q=<text>
```

| Param | Rule |
|---|---|
| `q` | Required. Either a postcode or a locality-name prefix — the **server** classifies it, the client does not (FR-006). Minimum 2 characters after trimming. |

### Responses

| Status | Body | Meaning |
|---|---|---|
| `200` | `LocalityDTO[]` — **0 to 8** items | The lookup ran. **An empty array means "no place matches", which is NOT a delivery refusal.** |
| `400` | `{"error": "invalid_query"}` | Fewer than 2 usable characters. ⚠ Clients render this as "keep typing", never as a refusal. |
| `503` | the shared unavailable shape | The lookup could not run. ⚠ Clients render "we couldn't check", never a refusal. |

**Headers**: `Cache-Control: public, max-age=86400`. Locality data changes at the pace of postal
administration; the response holds nothing about the caller.

### Ordering and bounds — both are contract, not implementation detail

- Ordered `name, state, postcode`. Deterministic, and stable across identical requests.
- **Never ordered or filtered by serviceability** (FR-011). The list must not hint at the answer:
  doing so would pre-empt the verdict and turn this endpoint into a coverage enumerator.
- At most **8** items (FR-010). More matches means the shopper should type another character.

### `LocalityDTO`

Declared **once**, in `packages/shared-types/src/storefront.ts`, and generated to Kotlin by the
existing generator (Principle II — `cm-contract-check` then covers drift for free).

```ts
export interface LocalityDTO {
  /** The locality name as a shopper would say it, e.g. "Richmond". */
  name: string;
  /** One of ACT NSW NT QLD SA TAS VIC WA. */
  state: string;
  /** Exactly four digits. The canonical form `delivery.NormalizePostcode` produces. */
  postcode: string;
}
```

⚠ **All three fields are required, and none may be dropped from a response.** A place is identified by
the triple; a two-field response is an ambiguous place, and the client cannot tell which one it got.

### The wire contract test (028's mechanism, 029's lesson)

One **byte-identical JSON literal**, duplicated by hand into `wire_contract_test.go` (Go) and a
Kotlin `commonTest`. Both assert their type serialises to exactly:

```json
[{"name":"Richmond","state":"VIC","postcode":"3121"}]
```

⚠ **Pin the payload the server actually emits, not the payload someone expects it to.** 029's banner
contract test pinned `{"kind":"sale"}` — a shape no banner had ever produced — and the test that
should have caught the defect asserted it instead. The literal above must be copied from real
response bytes during implementation, not written from this document.

---

## §2 — The display rule

**One rule, stated once, implemented twice, tested on both surfaces against this same table.**
`delivery-display.ts` (web) and `DeliveryDisplay.kt` (mobile) are pure functions over the stored
context; both are unit-tested against exactly these rows.

| Stored `locality` | Stored `state` | Display | Case |
|---|---|---|---|
| `"Richmond"` | `"VIC"` | `Richmond VIC 3121` | The shopper chose a place from the list. |
| `null` | `"VIC"` | `VIC 3121` | Bare postcode covering several localities — **no suburb is invented** (FR-034). |
| `"Melbourne"` | `"VIC"` | `Melbourne VIC 3000` | Bare postcode covering **exactly one** locality — naming it is compliant and strictly more useful. |
| `null` | `null` | `3121` | The locality lookup failed. ⚠ The **verdict is unaffected** — a failed name lookup must never degrade the delivery answer. |

Two invariants that fall out of the table and are asserted separately:

- **The postcode is always present.** It is what the verdict is keyed on; `locality` and `state` are
  decoration over it.
- **The function never returns an empty string** for a set location. A location that renders as
  nothing is indistinguishable from no location at all.

### The verdict, unchanged from 025 and non-negotiable

Three states, rendered three visibly distinct ways, on both surfaces:

| `serviced` | Meaning | ⚠ |
|---|---|---|
| `true` | We deliver here | |
| `false` | We don't deliver here yet — browsing continues | |
| `null` | **We have not got an answer** | **NEVER rendered as, or mistakable for, a refusal.** |

The screen-reader announcement must name the place **in the same words the visible display uses**
(FR-042) — a sighted and a non-sighted shopper being told about differently-worded places is the same
defect as showing the wrong place.

---

## §3 — The guest-path constraint (customer-web only)

Binding, machine-enforced, and the reason the web half is harder than it looks.

1. **`DeliveryAffordance` renders on every public route** (it is in `app/(shop)/layout.tsx`). The
   budget is **174 KB per route**. ⚠ **Measured 2026-08-01 on `02512f2`, six routes, all green:**
   `/` 172.2 · `/browse` 170.1 · `/search` 173.5 · `/product/[id]` 172.3 · `/cart` **173.8** ·
   `/promotions/[id]` 171.0. **The binding constraint is `/cart`: 0.2 KB.** `pnpm size` is the gate.
2. **The panel body MUST be lazily loaded** (`next/dynamic`, on first open). Only the button, the
   `<dialog>` shell and the store subscription may be always-loaded, so that a shopper who never opens
   the affordance downloads none of the lookup machinery (FR-043).
3. **No new dependency on the guest path.** `radix-ui`, `sonner` and `vaul` are barred here by
   `.dependency-cruiser.cjs` → `no-heavy-ui-deps-on-guest-path`, whose comment already names the
   delivery picker as a native-`<dialog>` case. The suggestion list is a hand-rolled
   `role="listbox"` / `role="option"` with `aria-activedescendant`, arrow keys and Enter (FR-051,
   FR-045).
4. **The locality dataset is never shipped to a client** (FR-046). Every suggestion is a server round
   trip. ⚠ Stated because "ship the 18k rows and filter client-side" is instant, offline-capable, and
   would add roughly 400 KB to a 174 KB budget.
5. **If the split still breaches the budget, reduce the web presentation** — do not raise the limit and
   do not add a dependency (FR-045). This is decided here, in advance, so it is not decided under
   pressure at the end of the slice.

⚠ **The seed cannot be a new client module.** It must run on mount to be useful, so it is
always-loaded — and a new client-component boundary does not fit in 0.2 KB. The seed is therefore a
**prop passed into `DeliveryAffordance`** (which already ships) from a server island, **not** a
separate `DeliverySeedClient`. This corrects research R8, which was written against a stale headroom
figure and would have breached the gate.

⚠ **The always-loaded budget for this entire feature is 0.2 KB.** The lazy split must therefore be
byte-**neutral or negative**, not merely "small" — moving today's panel body behind `next/dynamic`
should *free* bytes. If the measured result is positive on `/cart`, rule 5 applies.

---

## §4 — What this contract forbids

- **Extending `ServiceabilityDTO`.** It stays exactly `{postcode, serviced}`, and its reflection test
  stays. The design does not need the echo (research R4), so the freeze holds.
- **Any foreign key between `locality` and `delivery_zone_postcode`.** They share a value, not a
  relationship; either direction of constraint breaks something (see `data-model.md`).
- **Any locality, state, or postcode in telemetry** (FR-047). The existing
  `delivery_location_set { serviced }` keeps exactly its current properties. The new server metric
  carries `outcome` only — ⚠ never the query string.
- **Writing a delivery location back to the account** (FR-021). Setting a location creates no address,
  modifies no address, and touches the address book in no way. The seed reads; it never writes.
