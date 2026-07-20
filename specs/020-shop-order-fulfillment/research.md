# Research: Shop Order Fulfillment (020)

**Date**: 2026-07-20 · **Feeds**: [plan.md](./plan.md) · **Spec**: [spec.md](./spec.md)

Phase 0 decisions. Each records what was chosen, why, and what was rejected. Findings marked ⚠ changed
a direction the spec or an earlier assumption had leaned toward.

---

## R1 — Path assignment: **cold path (`edge-api`), service `shop`** ⚠

**Decision**: All shop-facing fulfilment endpoints live on the **cold path**, in the existing
`apis/edge-api/shop` service, under `/shop/v1/fulfillments...`.

**⚠ This inverts the spec's own speculation.** [spec.md](./spec.md) Assumptions says *"live order intake
is time-sensitive, which argues for the hot path"*. Investigation shows that is wrong on three counts,
one of them dispositive.

**Rationale**:

1. **Dispositive: `core-api` has no cloud deployment at all.** It is local-Docker-only by decision — no
   ECS/Fargate/ECR/ALB resources exist in `infra/`, no CI workflow builds or pushes it, and the only way
   it is reachable off-localhost is an ngrok tunnel (`make cm-ngrok-core`). Its own README states
   *"This slice runs locally in Docker only; Fargate arrives with a later slice."* **A shop order queue
   placed on the hot path could never go live.** Meanwhile the shop pool's authorizer and every existing
   shop endpoint already run on the deployed shared HTTP gateway.

2. **The doctrine assigns it to edge.** [docs/api/path-assignment.md](../../docs/api/path-assignment.md)
   rule 2 — *"latency-tolerant, low-frequency, or an internal/ops surface (… operator consoles …) →
   edge-api. The operator's mandate is binding here: anything that does not need low latency MUST be
   written in edge-api."* It names the shop service explicitly as *"an internal operator console,
   latency-tolerant and low-frequency, cold starts acceptable"*, and its worked examples include a
   near-identical case (*refund review queue → edge-api*). Placing this on core-api without a justified
   exception is a **recorded Constitution Check failure** (Principle III).

3. **The latency claim does not survive contact with the numbers.** SC-001 budgets **30 seconds** for a
   paid order to appear. A Lambda cold start is ~1s. The queue is a back-room screen refreshing on an
   interval, not a customer staring at a spinner. There is no latency requirement here that a warm-ish
   Lambda cannot meet with 29 seconds to spare.

4. **Cost of the alternative is real, not theoretical.** Putting this on core-api would require: a
   `Shop Pool` added to `config.Auth` with `required` tags (making shop-pool env **mandatory for every
   core-api boot**, including customer-only dev runs); a second `PoolVerifier`; **a change to
   `PoolVerifier` itself**, whose `clientID` is a scalar while the shop pool has *two* clients (web +
   mobile) — so shop-mobile could not authenticate without reworking it; a new `shopidentity` package
   (`customeridentity` is hardcoded to `public.customer`); and new SSM reads in `docker-compose.yml` and
   `make core-run`.

**Alternatives rejected**:
- *Hot path (`core-api`)* — cannot deploy; contradicts the doctrine; requires reworking `PoolVerifier`.
- *Split (reads hot, writes cold)* — forbidden outright: *"An endpoint is never split across both paths,
  and neither path proxies the other."*
- *A new `edge-api/fulfillment` service* — unjustified. The audience is the shop pool, which
  `edge-api/shop` already serves with a working authorizer; a new service means a new deploy unit for no
  isolation benefit.

**Recorded revisit trigger**: if 021 introduces tight same-day windows **and** interval refresh proves
inadequate **and** core-api gains a cloud deployment, re-evaluate for push/streaming. All three must
hold; none holds today.

---

## R2 — The customer half stays on the **hot path** — and this is the point ⚠

**Decision**: US5 (FR-017, FR-018a–c) is delivered by **extending `apis/core-api/internal/features/orders`**,
not by anything on the cold path. So **020 touches both backends**, by audience.

**Rationale**: The customer's order read already lives on the hot path and **already returns the
anonymous per-shop summary** this slice gives meaning to. From
`apis/core-api/internal/features/orders/orders.go`:

```go
// Fulfillments returns the per-shop portions WITHOUT shop identity (only status/count/subtotal).
SELECT status AS status, item_count AS item_count, subtotal_amount::text AS subtotal_amount
FROM public.shop_fulfillment WHERE order_id = $1 ORDER BY created_at ASC
```

The `Fulfillment{Status, ItemCount, SubtotalAmount}` struct is already shipped and already shop-blind.
US5 needs **no new customer endpoint** — only richer status values (R3) plus a shortfall projection
gated on terminal state (FR-018b). That is a small, additive change inside an existing hot-path feature.

**This is the operator's rule working exactly as stated** (2026-07-20): *"if you think one feature
customer side should use core api and shop side should use edge api, nothing to worry, you can implement
them both and use them respectively."* One capability — fulfilment status — served to two audiences from
two paths, each chosen on its own merits: the customer's receipt is customer-facing commerce (hot path,
019 FR-028); the shop's console is an internal ops surface (cold path, rule 2).

**Alternative rejected**: *moving the customer read to the cold path for symmetry* — violates 019's
routing law (commerce → hot path) and would regress a working customer-facing latency path for tidiness.

---

## R3 — State machine storage: extend the CHECK, add a state clock

**Decision**: One forward-only migration that (a) widens `public.shop_fulfillment.status`'s CHECK
constraint from `('pending','received')` to the five-state machine, and (b) adds `state_changed_at`.

The 019 schema is:
```sql
status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received')),
```
with the comment *"received reserved for the later shop-surfacing slice (no consumer flips it here)"* —
this slice is that consumer. New domain: `pending → received → picking → ready_for_pickup`, plus
`collected`.

**Rationale**: `received` was deliberately reserved for exactly this, so the enum grows rather than being
replaced — no data migration, no rename, no rewrite of 019's fan-out. `state_changed_at` satisfies
FR-011c (time-in-state) and FR-001a (at-risk escalation) without scanning the audit table on every queue
render.

**Alternatives rejected**:
- *A separate `fulfillment_state` table* — over-modelled; one row per portion already exists and is
  uniquely keyed `(order_id, shop_id)`.
- *Deriving current state from the audit log* — makes the hot queue query an aggregate over history;
  correct but needlessly slow and harder to constrain.
- *Postgres `ENUM` type* — CHECK constraints are the established pattern across every existing table
  (`shop_staff.status`, `payment.status`, `order.status`); an enum type would be an inconsistent
  one-off and is harder to extend forward-only.

---

## R4 — Pick progress and shortfall: a **new table**, never on `order_item`

**Decision**: New table `public.fulfillment_item` keyed on `(shop_fulfillment_id, order_item_id)`,
carrying gathered quantity and unavailable quantity.

**Rationale**: `public.order_item` is a **receipt line** — an immutable record of what was bought and
charged. 019 treats the whole order as historical truth (its `delivery_address` is a jsonb snapshot for
exactly this reason). Writing mutable operational state onto a receipt line would let a picking action
mutate a financial record, which is precisely the coupling 019 designed against. A separate table keeps
"what was sold" and "what happened in the shop" independently correct.

Modelling shortfall as **quantities** rather than a boolean flag directly satisfies FR-010a ("in whole
or by reducing the quantity actually gathered") and makes the outstanding obligation computable —
`ordered − gathered` per line, which is the queryable debt the Assumptions section demands so the future
refunds slice inherits a ledger rather than a mess.

**Alternatives rejected**:
- *Boolean `is_picked` / `is_unavailable` on `order_item`* — mutates a receipt; cannot express partial
  quantities.
- *A jsonb progress blob on `shop_fulfillment`* — unqueryable for the refunds slice; no referential
  integrity to the line it describes; concurrent updates would contend on one row.

---

## R5 — Concurrency: guarded conditional `UPDATE`, reusing 019's proven idiom

**Decision**: Every transition is a single `UPDATE … WHERE id = $1 AND status = $expected`, with
**rows-affected = 0 meaning "someone else already did it"** — surfaced as a benign no-op, not an error.

**Rationale**: This is exactly the idiom 019 already proved for the payment finalizer:
```sql
UPDATE public."order" SET status='paid', placed_at=now() WHERE id=$1 AND status='pending_payment'
-- 0 rows → already finalized (idempotent no-op)
```
It satisfies FR-014 and SC-005 (exactly one applied transition under concurrency) with no advisory locks,
no `SELECT … FOR UPDATE`, and no extra round trip. It is single-statement atomic, so two operators
tapping simultaneously produce one winner and one no-op — never a contradictory state.

**Alternatives rejected**:
- *Optimistic version column* — adds a column and a client round-trip to carry the version, for
  identical guarantees; the status value *is* the version here.
- *`SELECT … FOR UPDATE` in a transaction* — holds locks across a Lambda round trip; worse under cold
  starts, and unnecessary for a single-row state change.
- *Last-write-wins* — explicitly forbidden by FR-014.

---

## R6 — Audit trail: an append-only `fulfillment_event` table

**Decision**: New append-only table recording (portion, actor `shop_staff.id`, from-state, to-state,
timestamp), written **in the same transaction** as the state change.

**Rationale**: FR-015 requires attribution, and FR-019b elevates it: because **no fulfilment action is
role-restricted** (clarification 2), the audit trail is the *sole* accountability control in this
feature. That makes it load-bearing, not decorative — so it is written transactionally with the change
it records, and can never disagree with the current state. It also carries the reversal trail FR-011e
requires, and is the only place a "prematurely completed then rewound" order leaves evidence.

Reusing `admin.audit_log` (009) was considered and rejected: it lives in the `admin` schema and is
back-office-scoped, whereas these are `public`-schema operational events at much higher volume.

---

## R7 — Delivery promise: a **domain seam**, not a speculative column

**Decision**: Model `DeliveryPromise{serviceLevel, readyBy}` in the domain and derive it today from
`order.placed_at` plus a platform default. Add **no** promise columns to the schema — 021 owns them.

**Rationale**: FR-001b requires promise-ordering that degrades to exactly FIFO while one promise exists,
without hardcoding FIFO. Because today's promise is uniform, `readyBy` is a constant offset from
`placed_at`, so ordering by promise **is** ordering by arrival — SC-020 holds by construction rather
than by a branch. The queue's `ORDER BY` is a single documented seam that 021 repoints at its real
column.

Adding a nullable `promised_ready_at` now was rejected: it would be a column this slice never populates,
shaped by guesses about a spec that does not exist yet, and 021 may well model the promise per-shop
rather than per-order (an open question already recorded in
[NEXT-021-delivery-zones.md](./NEXT-021-delivery-zones.md)).

---

## R8 — Near-real-time: interval refetch, no push, no websockets

**Decision**: TanStack Query `refetchInterval` on web; a coroutine timer around the existing repository
call on mobile. Poll cadence ~15s while the queue screen is foregrounded, paused when backgrounded.

**Rationale**: SC-001's budget is 30 seconds, so a 15s interval clears it with margin even if one poll
is missed. Push (FCM/APNs) belongs to the notifications slice and is deferred platform-wide (013/014).
Websockets are not available on the cold path's HTTP-API/Lambda runtime without adding an entirely new
API Gateway WebSocket deployment — a large infrastructure change for a screen whose requirement is
already met.

Pausing on background matters for cost: this is pay-per-request, and a tablet left awake on the Orders
tab overnight would otherwise bill ~5,760 invocations/device/day.

**⚠ This is the first polling in the monorepo.** A sweep for `refetchInterval`,
`refetchIntervalInBackground`, `setInterval`, `EventSource`, and `WebSocket` across all of `apps/` and
`packages/` returns **zero hits**; the only timers anywhere are a search debounce and a 2s "added" flash
in customer-web. Today every surface refreshes purely by mutation-driven invalidation plus a 30s default
`staleTime` (`packages/web-kit/src/runtime/query-client.ts`). So this slice **establishes a pattern**
rather than following one — which is why the cadence, the background-pause, and the cost consequence are
specified here rather than left to each surface to improvise.

**Alternatives rejected**: *WebSocket API Gateway* (disproportionate infra); *SSE* (not supported by
HTTP API + Lambda proxy without hacks); *push* (deferred slice; also wrong tool for a screen already
open); *relying on the existing 30s `staleTime` + window-focus refetch* (would satisfy SC-001 only if an
operator happens to refocus the window, which is not a guarantee — FR-004 requires arrival without
operator action).

---

## R9 — Layout: **lists and tables, no cards** — with the reference platform deliberately overruled

**Decision**: shop-web renders the queue as a **table** (`DataTable` from `@effy/web-kit/console`) and the
order as a **sectioned detail page**. shop-mobile renders a **list**, and on a landscape tablet a
**two-pane list + detail**. No card containers anywhere.

**Rationale**: Constitution Principle V prohibits card layouts *"unless a card is demonstrably the right
pattern and no better layout exists, in which case the plan MUST record the justification."* The
reference platform (Uber Eats merchant) does use card-style tickets — and it is **overruled here**,
deliberately: an order queue's job is dense scanning and comparison across a fixed set of columns
(reference, age, promise, item count, state), which is what a table is for. Cards would waste the
horizontal space that the tablet-first requirement (FR-023) exists to exploit.

**No card justification is claimed** — the prohibition is followed, not excepted.

---

## R10 — Contracts: shared TypeScript DTOs, generated to Kotlin

**Decision**: Fulfilment DTOs are defined once in `@effy/shared-types` and generated to Kotlin for
shop-mobile, following the generator 019 established for commerce.

**Rationale**: Principle II — shared contracts are the single source of truth and clients MUST be typed
from or generated from them, never hand-redefined per surface. FR-021 restates this for the two shop
surfaces. 019 already built this pipeline (`scripts/gen-kotlin-commerce-contract.mjs` →
`contract/CommerceDto.kt`); this slice adds a shop-side equivalent rather than inventing a mechanism.

---

## R11 — Serviceability of the "hidden shop" rule under a new surface

**Decision**: The queue and detail endpoints derive `shop_id` **exclusively** from the authenticated
operator's `shop_staff` record, never from a path, query, or body parameter. No endpoint accepts a shop
identifier as input.

**Rationale**: FR-019 and SC-007 require that a shop can never read another shop's lines *regardless of
what any client sends*. The only way to guarantee that is to make the shop identifier structurally
un-supplyable. This mirrors the isolation 016's catalog already enforces
(`authorizeShopMember`, parity register row 16.12: *"every catalog query scoped to the operator's shop,
never client input"*), so the pattern is established rather than novel.

The corresponding customer-side guarantee is inherited free: `orders.Fulfillments` already selects only
`status, item_count, subtotal_amount` — shop identity is not in the projection at all (R2).
