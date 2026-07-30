# Research: 027-customer-cart-sync

**Date**: 2026-07-30 · **Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Ten questions had to be settled before this slice could be planned honestly. Each is recorded as
Decision / Rationale / Alternatives, and two of them (R0, R5) overturn or constrain an earlier
documented decision — those are written up as amendments, not as quiet edits.

---

## R0 (amendment) — 019 research R8 "Option B" is reversed

**The prior decision.** 019's research R8, amended 2026-07-23 to "Option B", reads: *the device-local
cart is the single source of truth; the server cart is an idempotent snapshot via `PUT /v1/cart`
(replace); the local cart is cleared only on order completion.* It was adopted to kill three live bugs
(a cart emptied by entering checkout, an abandoned attempt's items reappearing, and quantities
tripling) that all came from an **additive, non-idempotent** `POST /v1/cart/merge` fired on checkout
entry.

**Decision.** Reversed. From this slice, **for a signed-in shopper the platform's cart is
authoritative**; the client holds a non-authoritative mirror for immediacy. The device-local cart
remains the whole truth **only while the shopper is a guest**, and is folded into the account cart at
sign-in.

**Rationale.** Option B was the right fix for the wrong layer. Its actual insight — *stop sending
non-idempotent bulk mutations* — is preserved and generalised here (see R1: every cart write in this
slice is idempotent by construction). But "device-local is the source of truth" makes four of this
spec's P1 requirements unimplementable, not merely harder:

- FR-003 / FR-006 (account-level cart) — a device-local truth has no account.
- FR-009 (two devices converge) — with two device-local truths there is nothing to converge *on*;
  whichever pushed last wins the whole cart, which is precisely the "quantities double / removed line
  resurrects" family of bugs Option B was invented to stop, merely relocated from checkout entry to
  device switching.
- FR-011 (merge loses nothing) — replace *cannot* merge; that is what replace means.
- FR-027 (server computes the charge) survives under Option B only because checkout re-prices the
  snapshot. Once a discount exists (FR-048/FR-049) the snapshot has to carry the money too, and a
  client-authoritative cart carrying money is exactly what the constitution's "server-authoritative
  amount" rule exists to prevent.

**What kept Option B honest, and is retained.** `PUT /v1/cart` (whole-cart replace) is **removed from
the API**, not merely unused. That removal is what makes FR-010 structural rather than aspirational: a
device that has been offline for a week holds no operation capable of deleting a line it has never
heard of. Its queued work is line-scoped and absolute, so the worst it can do is set a quantity the
shopper genuinely asked for on that device — a documented, per-line last-write-wins.

**Alternatives considered.**
- *Keep Option B and add a background push.* Rejected: it is Option B's failure mode on a timer. A
  second device cannot contribute, only overwrite.
- *CRDT / per-line vector clocks.* Rejected as unjustified complexity: a cart line is a scalar
  quantity a human is directly editing, so per-line LWW is what the shopper actually expects ("I set
  it to 3 on this phone, it is 3"), and the operations that could genuinely conflict destructively
  (whole-cart replace) are being deleted instead of reconciled.

**Governance.** Recorded as an amendment in
[specs/019-customer-commerce-flow/research.md](../019-customer-commerce-flow/research.md) R8 (task
T00x) with a pointer here. No constitution amendment is required: Principle VI's "unidirectional
client state" and "never hand-cache server data in component state" are *satisfied more closely* by
this design than by Option B — the mirror is an explicit, reconciled store owned by the domain layer,
not component state.

---

## R1 — Concurrency and staleness (FR-009, FR-010)

**Decision.** Two mechanisms, deliberately unequal in weight:

1. **Every cart write is idempotent by construction.** The API offers no operation whose repetition
   changes the outcome, with exactly one exception (`add`, below). Concretely:
   - `PATCH /v1/cart/items/{productId}` sets an **absolute** quantity (`0` removes). Replaying it is a
     no-op.
   - `DELETE` of a line or of the cart is idempotent by nature.
   - `POST /v1/cart/merge` and `POST /v1/cart/reorder` are **union-with-maximum-quantity**, which is
     idempotent *and* commutative — running either twice, or both in either order, yields the same
     cart.
   - Set-aside / restore / promo-apply / promo-remove are all state-assignments, not deltas.
   - **`POST /v1/cart/items` is the exception**: "add to cart" from a product page must *increment*
     (add 2, then add 2, means 4). It therefore carries a client-generated `changeId` — see R2.
2. **A monotonic `cart.revision`**, returned on every cart response and bumped by every mutation. It is
   **not** a write precondition — no `If-Match`, no 409-and-retry loop. Its single job is to let the
   client mirror decide, in one integer comparison, whether a response it just received is newer than
   what it holds (responses can arrive out of order under concurrency). Any response whose revision
   exceeds the mirror's is adopted wholesale; any older response is discarded.

FR-010 ("a stale device MUST NOT silently discard newer changes made elsewhere") is then satisfied
**structurally**: the only operation that could discard a line the client has never seen is a
whole-cart replace, and R0 deletes it. Per-line LWW is documented as intended behaviour, not a
compromise: it is what a shopper editing a quantity on the device in their hand means.

**Rationale.** Conditional writes (commercetools' `version` on every update action) are the right
default for a document a *program* edits concurrently. A cart is edited by one human on two devices
seconds apart, and a 409 would surface to them as a failed tap they must repeat — for a conflict whose
correct resolution is always "do what the human just asked". Idempotence-by-construction removes the
conflict class instead of reporting it, and costs one integer on the wire.

**Alternatives considered.**
- *`expectedRevision` required on every write, 409 on mismatch.* Rejected: converts an ordinary
  double-device edit into a user-visible error, and forces a retry loop into both clients for no gain
  once every operation is already idempotent.
- *Server timestamps, last-write-wins by clock.* Rejected: relies on client clocks or on ordering
  writes by arrival, and gives no way for the mirror to discard a stale *response*.
- *No revision at all.* Rejected: out-of-order responses would let an older cart overwrite a newer one
  in the mirror, which is FR-009's failure mode reintroduced on the client.

---

## R2 — Exactly-once for a queued change (FR-018)

**Decision.** Any cart write MAY carry a client-generated `changeId` (UUIDv4). The server records
applied ids in `public.cart_change_log (cart_id, change_id, applied_at)` with `UNIQUE (cart_id,
change_id)`, and the check-and-insert happens **in the same transaction as the mutation**. On a
duplicate the mutation is skipped and the **current** cart is returned — so a retry after an ambiguous
failure is indistinguishable, to the shopper, from the first attempt having succeeded. Retention is
**7 days**, pruned opportunistically (a bounded `DELETE … WHERE applied_at < now() - interval '7 days'`
alongside the insert), which comfortably exceeds any plausible offline window for a queued cart edit.

The clients send `changeId` on **every** queued mutation, not only on `add`. It is redundant for the
idempotent operations, and that redundancy is deliberate: it means the queue's replay logic has no
special cases, and a future non-idempotent operation cannot be added without inheriting the guard.

**Rationale.** This is the outbox + idempotency-key pattern, which is the standard answer to the
"request arrived, response did not" ambiguity that a mobile client cannot otherwise resolve. Doing the
dedupe insert in the mutation's own transaction is the part that actually makes it exactly-once;
checking first and mutating second is a race.

**Alternatives considered.**
- *Rely on idempotence alone and ship no dedupe table.* Rejected only because of `add`; every other
  operation would be fine. Making `add` absolute-only was considered and rejected as a worse product
  (a second "Add to cart" tap on a product page must increase the quantity, which is what every
  reference platform does).
- *Reuse Stripe-style deterministic keys derived from content.* Rejected: two genuinely distinct
  "add 1 of X" actions minutes apart are legitimately different changes and must both apply; a
  content-derived key would swallow the second.
- *An HTTP-level idempotency middleware caching whole responses.* Rejected as heavier than needed and
  wrong for this shape — the correct reply to a duplicate is the *current* cart, not a replayed old
  one.

---

## R3 — Where the mobile mirror and queue live (FR-001, FR-002, FR-017)

**Decision.** Reuse `core/storage/DevicePreferences.kt` (added by 026; Android `SharedPreferences`,
iOS `NSUserDefaults`) as the platform driver, behind a **new cart-owned port** in the cart feature's
data layer — `CartLocalStore` — which serialises the mirror and the pending-change queue as JSON with
`kotlinx.serialization` (already a dependency). **No new dependency.**

`DevicePreferences`' doc-comment currently forbids storing "customer records, or anything the backend
is authoritative for". That rule is **amended in place, narrowly**, to permit a *non-authoritative
mirror* under three conditions, all of which this design meets:

1. it is reconciled against the platform on read and discarded when the platform disagrees;
2. it is never an input to an authorization or pricing decision (FR-027 already forbids that);
3. it holds no more than the shopper could see on screen anyway — product ids, names, quantities and
   prices already rendered in their own cart.

The amendment is written into the file, not just here, because the next person to add a store will read
the file and not this document.

**Sizing.** The bound is FR-038's distinct-item ceiling (**100**, see R7). A cart line serialises to
roughly 200 bytes, a saved line the same, a queued change under 100 — so the worst realistic payload
is ≈ 45 KB. `SharedPreferences` and `NSUserDefaults` are both comfortable at that size; both are
whole-file rewrites on commit, so writes are debounced with the same coalescing that serves the network
(R4) rather than fired per keystroke.

**Rationale.** A real embedded store (SQLDelight, Room) is the textbook answer and is the wrong trade
here: it adds a Gradle plugin, a schema, generated code and an iOS driver to persist at most 200 small
rows that are always read in full and never queried. The constitution's "no DI framework / explicit
wiring" ethos points the same way — the cheapest thing that is honestly durable.

**Alternatives considered.**
- *SQLDelight.* Rejected: new dependency + codegen + per-platform driver for a dataset that has no
  queries.
- *A second `expect`/`actual` file-backed store.* Rejected: duplicates what `DevicePreferences`
  already abstracts on both platforms, for the same durability guarantees.
- *Keep the mirror in memory and persist only the queue.* Rejected: fails FR-001 for a signed-in
  shopper on a cold launch without connectivity — the cart would be empty until the network answered.

---

## R4 — Coalescing the quantity stepper (FR-014, FR-016, SC-005)

**Decision.** Three parts:

1. The mirror is updated **synchronously** on the tap. The line, the totals and the badge all read from
   the mirror, so FR-014/FR-015 hold with no network involvement whatsoever.
2. A per-`productId` **debounce of 400 ms** in the sync coordinator, sending the *settled absolute
   quantity* via `PATCH`. Because the payload is absolute, intermediate values are simply never sent —
   there is nothing to reconcile.
3. **At most one request in flight per line**; a change arriving while one is in flight replaces the
   pending value (conflate), and is sent when the response lands.

Ten taps inside two seconds therefore produce **one** request (two only if the shopper pauses longer
than 400 ms mid-run), satisfying SC-005's "no more than two".

400 ms is chosen as the point where a deliberate second tap has already happened but a shopper who has
finished does not perceive a delay in the (invisible) save. It is a named constant on both surfaces so
the number is greppable and tunable in one place per client, not scattered.

**Rationale.** Absolute-quantity payloads are what make debouncing safe: with increments, dropping an
intermediate request corrupts the total, so every tap must be delivered. This is the same reason R1
chose absolute `PATCH`.

**Alternatives considered.**
- *Throttle (send first, then every N ms).* Rejected: sends the *first* value immediately, which is the
  one guaranteed to be wrong mid-run, and still needs a trailing send.
- *Send on screen-exit / cart-close only.* Rejected: loses the change if the process dies, and makes
  cross-device sync arrive minutes late (FR-008, SC-002).
- *Server-side increment with a per-tap `changeId`.* Rejected: correct but N requests for N taps, which
  is exactly what FR-016 forbids.

---

## R5 (constraint on 019's schema) — Save for later is its own table

**Decision.** A new table `public.cart_saved_item (cart_id, product_id, quantity, unit_price_at_add,
added_at)` with `UNIQUE (cart_id, product_id)`, **not** a `saved boolean` flag on `public.cart_item`.
Moving between the two is a two-statement transaction, so an item is never in both.

**Rationale.** `public.cart_item` is read by more than the cart: `checkout.CartLines` builds the
payable order lines from it, the delivery quote packages from those lines, and the paid-order finalizer
empties it. A boolean flag would require **every one of those call sites** to add `AND NOT saved`, and
the failure mode of forgetting one is not a cosmetic bug — it is charging a shopper for an item they
explicitly set aside, and fanning it out to a shop to pick. A separate table makes that mistake
impossible to make: a query that does not mention `cart_saved_item` cannot see saved items.

The cost is one extra indexed scan on a cart read and a two-statement move. That is the right price.

**Alternatives considered.**
- *`cart_item.saved boolean`.* Rejected on the safety argument above; the diff is smaller and the
  latent-defect surface is much larger.
- *Reuse `public.customer_favorite` (019) as "saved for later".* Rejected: favourites are a wishlist
  keyed to a customer with no quantity and no cart relationship, and conflating them would mean
  setting a cart item aside silently favourites it. Two different shopper intentions.

---

## R6 — Where the promotion entity lives, and how it is governed

**Decision.** `public.promo_code` and `public.promo_redemption` live in the **`public` schema**:
**written** by the cold path (`apis/edge-api/admin/src/promotions/`, back-office authorizer) and
**read and redeemed** by the hot path (`apis/core-api` cart + checkout). Governance follows 009 exactly:

- **Authz** — read = any active `admin.staff` (including `csa`); mutate = `admin` or `manager`.
- **Attribution** — `promo_code.created_by` / `updated_by` (the operator's `cognito_sub`) **and** an
  `admin.audit_log` row per change, which is the pattern 009 established and the reason FR-071 is
  satisfiable.

This is not a new architectural shape: `public.shop` is already written by the admin cold path and read
by both the shop cold path and the hot path. The dual-path rule (Principle III) is about *where a
request is served*, not about table ownership — and it puts operator CRUD on the cold path and a
latency-sensitive customer read on the hot path, which is exactly this split.

**Rationale.** The alternative — keeping promotions entirely on the hot path so one service owns the
table — would put an internal back-office CRUD screen on the Go service, contradicting the routing law
and, worse, requiring `core-api` (which has **no cloud deployment**) to be reachable by the back-office
console. That is unbuildable today, not merely inelegant.

**Alternatives considered.**
- *Promotions wholly on the hot path.* Rejected: the back-office cannot reach `core-api`; core-api's
  go-live is its own slice.
- *A separate `promo` schema.* Rejected: the platform's schema split is `public` (operational) vs
  `admin` (back-office accounts + audit). A promotion is operational data that customer traffic reads;
  it belongs in `public`. The audit trail belongs in `admin`, and goes there.
- *Redemption counting in the cold path.* Rejected: redemption must be in the **same transaction** as
  the paid transition (FR-048), which lives in the hot path's `FinalizeSucceeded`.

---

## R7 — Minimum order value, and the two ceilings

**Decision.** A purpose-named singleton table `public.order_policy` — one row, pinned by
`CHECK (singleton) UNIQUE` — holding `minimum_subtotal_amount`, `currency`, `max_line_quantity`,
`max_distinct_items`, `updated_by`, `updated_at`. Read by the hot path (cart + checkout); written by the
cold path (the back-office promotions area, "Order rules"). Seeded by the migration with
`minimum_subtotal_amount = 0.00` (no minimum), `max_line_quantity = 99` (today's hard-coded constant),
`max_distinct_items = 100`.

The two ceilings move out of Go constants and into this row for one reason: FR-037/FR-038 require the
shopper to be *told* the ceiling, which means the number has to reach the client. Serving it from the
same row the platform enforces it from removes the possibility of the message and the rule disagreeing.

`max_distinct_items = 100` is chosen deliberately below Shopify's 500-line cap: Effy's cart re-prices
every line on every read, and 100 keeps that read comfortably inside the hot path's latency budget
while being far above any real grocery basket.

**Rationale.** The value must be operator-configurable (FR-053), read on the cart's hot read path, and
enforced inside the checkout transaction (FR-056). A table row satisfies all three with no extra call.

**Alternatives considered.**
- *SSM Parameter Store.* Rejected: an out-of-database AWS call on the cart read path, and unusable
  inside the checkout transaction that must enforce it.
- *A generic `platform_setting (key, value)` table.* Rejected: a junk drawer with no types and no
  `CHECK`s, where an invalid minimum becomes a runtime surprise instead of a constraint violation.
- *Per-anonymous-package minimums (the Uber Eats per-store model).* Rejected for this slice and
  recorded in the spec's Assumptions: Effy presents one cart with one total, and a per-package minimum
  gives the shopper a puzzle they cannot solve without knowing which items came from where — which
  FR-062 forbids telling them.

---

## R8 — Reorder is a server-side operation

**Decision.** `POST /v1/cart/reorder` with `{ orderId }`, returning the resulting cart **and** a
`skipped[]` report (`productId`, `reason` ∈ `unavailable | removed | cart_full | clamped`). It verifies
the order belongs to the calling customer, then applies **union-with-maximum-quantity** against the
existing cart, so a double tap cannot double quantities (SC-011).

**Rationale.** A client-side loop over the order's items would be N round trips, would be
non-atomic (a partial reorder on a dropped connection), and — decisively — **could not produce the
report FR-035 requires**, because whether an item is unavailable or has been deleted from the catalogue
is only knowable server-side. Doing it in one statement set also lets the cart-size ceiling be applied
to the batch as a whole rather than item-by-item, which is what makes "3 added, 2 could not be" honest.

**Alternatives considered.**
- *Client loops over `POST /v1/cart/items`.* Rejected on all three counts above.
- *Reuse `merge` with the order's lines fetched by the client.* Rejected: the client would have to be
  told which items are unavailable in order to report it, which means the read has to happen server-side
  anyway — at which point the extra round trip buys nothing.

---

## R9 — customer-web stays dependency-free (and the bundle gate)

**Decision.** Extend `apps/customer-web/lib/cart-store.ts` in place: the same
`localStorage` + `useSyncExternalStore` store gains the mirror's revision, the pending-change queue,
and a per-line debounce implemented with `setTimeout`. All network access goes through **route
handlers** under `app/api/cart/*` via the existing `proxyToCore`. **Zero new dependencies**, no TanStack
in the guest path, consistent with this app's deliberate tiny-guest-bundle design.

**On the budget.** `apps/customer-web`'s guest budget is **160 KB** and the measured figure is
**≈167 KB — already over, pre-existing** (recorded under 020, re-confirmed byte-identical under 024).
Two facts make this workable and must be stated rather than glossed:

1. `pnpm size` (`scripts/bundle-budget.mjs`) is a **standalone script**, not part of `build` or `test`,
   so the pre-existing overage does not currently fail `turbo build`.
2. This slice's obligation is therefore **no regression**, measured as a **byte delta**: capture
   `pnpm --filter @effy/customer-web size` on a clean tree, again with the slice applied, and record
   both numbers. Fixing the inherited overage is explicitly **not** this slice's job and must not be
   silently attempted inside it.

The cart page and everything under `app/checkout/` are already outside the static shell, so PPR is
unaffected by anything here.

**Alternatives considered.**
- *Adopt TanStack Query for the cart on web.* Rejected: it is the right tool on the consoles and the
  wrong one here — it lands in the guest bundle for a store that has exactly one resource and already
  works.
- *Server Actions instead of route handlers.* Rejected: 012 already established that this app's
  server-side auth path is route handlers (`aws-amplify/auth/server` has no `signOut`), and the
  quarantine guard is proven against that shape.

---

## R10 — Web parity without breaking the Amplify quarantine

**Decision.** Every new cart capability on web is reached through a **server-side route handler** that
proxies to `core-api` with the server session (`proxyToCore` + `@aws-amplify/adapter-nextjs`, which
already lives on the server side of the quarantine). Client components — the cart page, mini-cart,
badge, add-to-cart control, the promo field — talk only to `/api/cart/*` with `fetch`, so no client
module reaches `aws-amplify` and the dependency-cruiser rule (`reachable: true`, the form 011 D11 fixed)
stays green.

Guests are served without auth by two public hot-path endpoints (below), so the quarantine is not
strained by needing a session where there isn't one.

**Two public endpoints exist because guests must also be told the truth.** A guest has no server cart,
but FR-004 (restored carts show current prices), FR-021/FR-022 (honest price and availability) and
FR-054 (state the minimum) apply to them:

- `POST /v1/cart/preview` — unauthenticated; takes the device cart's lines and returns the fully
  re-priced cart with notices. It writes nothing.
- `GET /v1/cart/policy` — unauthenticated; returns the minimum and the two ceilings.

**Promotional codes are signed-in only**, and this is a deliberate product decision recorded here
because the spec does not state it: a per-shopper usage cap (FR-043) is unenforceable without an
identity, so offering a guest a code field would mean either accepting an uncapped code or refusing it
after the fact. The cart shows the code field to signed-in shoppers, and shows guests a sign-in
affordance in its place. Sign-in is required to check out anyway, so nothing is lost.

**Alternatives considered.**
- *Let guests apply codes and validate at sign-in.* Rejected: a discount shown and then withdrawn is
  worse than one not yet offered, and FR-042 forbids the client deciding validity.
- *Re-price the guest cart on the client from a catalogue read.* Rejected: duplicates pricing logic on
  two clients and makes FR-027's "platform computes the money" false in practice.

---

## R11 (found during implementation) — FR-025's "deleted from the catalogue" is unreachable as written

**The finding.** FR-025 requires a cart line whose product "has been deleted from the catalogue entirely"
to be removed and reported. That case **cannot occur** for a carted product: `cart_item.product_id` is
`REFERENCES public.product (id) ON DELETE RESTRICT` (019), so the database refuses to delete a product
that is in anyone's cart — and 016's own policy is that "archive is the default remove; hard delete only
from an unreferenced draft". Implementing FR-025 literally would produce a branch no test could reach and
no shopper could ever hit.

**Decision.** Map the requirement onto the state that *is* reachable, and distinguish the two honestly:

| `product.status` | Treatment | Notice |
|---|---|---|
| `active` | payable | — |
| `draft`, `unavailable` | kept in the cart, flagged, excluded from every total | `unavailable` |
| `archived` | **line deleted** — archive is permanent, so keeping a flagged line the shopper can never buy is clutter, not honesty | `removed` |
| product row absent | dropped | `removed` |

The last row is reachable **only on the guest preview path** (`POST /v1/cart/preview`), where the client
supplies product ids from its own device cart and one of them may name a product that was hard-deleted
while it was never in a server cart. That is precisely why preview validates rather than trusting input.

**Rationale.** `unavailable` is a temporary state a shopper may reasonably wait out — removing their line
would be presumptuous. `archived` is terminal, and a permanently unbuyable line is noise. Both are
reported; only one is destructive, and only where destruction is correct.

**Alternative rejected.** Treating `archived` as merely `unavailable` and never deleting anything — simpler
by one branch, but it leaves dead lines in a cart forever and makes FR-025 a requirement the code silently
does not meet.

---

## R12 (LIVE-ONLY BUG, found on first device run 2026-07-30) — customer-mobile could never authenticate to core-api

**Two independent defects, both of which had to be fixed.** The first diagnosis found only one of them and
declared victory; the restart proved it still failed. Recorded in the order they were found, because the
sequence is the lesson.

### R12a — the mobile app sent the WRONG TOKEN to the hot path (the actual cause)

`core/http/EffyHttpClient.kt` had **one** auth plugin serving **both** backends, and it sent the **ID
token** as the bearer to each. That is right for the edge api and wrong for core-api, and the two are not a
matter of taste:

| | bearer | why |
|---|---|---|
| **edge** (cold path) | **ID token** + access token in `X-Effy-Access-Token` | An API Gateway JWT authorizer pins the app-client id as the **audience**, and only an ID token carries `aud`. The access token rides along because Cognito's privileged calls are access-token-authorized (013 D2). |
| **core** (hot path) | **ACCESS token** | It verifies the token itself: `token_use == "access"` **and** `client_id ∈ pool clients`. An ID token fails **both** — its `token_use` is `"id"` and it has no `client_id` at all. |

So every authenticated customer-mobile call to core-api answered `401` in under a millisecond.
`customer-web` was never affected: `proxyToCore` sends `session.accessToken`, which is correct — and that
asymmetry is exactly why the web cart worked while the mobile one did not.

**Fix.** A `BearerToken` enum (`Edge` / `Core`) chosen per client at construction, and the header choice
extracted into a **pure `authHeadersFor`** function. It was previously buried inside a Ktor plugin over an
`expect`/`actual` engine, which is *why* nothing could test it; four unit tests now pin it, including that
the two backends never receive the same bearer.

### R12b — core-api accepted only ONE app client per pool (a second, real defect)

`auth.PoolVerifier` held a single `clientID` and checked `claims.ClientID != v.clientID`. But a Cognito
pool legitimately has more than one app client: the customer pool has a web client and a **mobile** client
(013, `infra/envs/dev/auth-customer.tf:153`, published at
`/effy/<env>/auth/customer/mobile_app_client_id`), because their refresh windows and auth flows differ.
`make core-run` passed only the web id.

This one was **necessary but not sufficient** — fixing it alone left R12a still failing, which is why the
first restart changed nothing.

**Fix.** `PoolVerifier` takes a **set** of client ids (`slices.Contains`) — the shape the edge authorizer
always had. `Pool.ClientIDs` reads the existing `AUTH_*_CLIENT_ID` with `envSeparator:","`, so a
single-value deployment is unaffected, and `make core-run` passes `web,mobile` from the two SSM parameters.
Startup **fails closed** on an empty set. Three tests: either client verifies, an unconfigured client is
still refused (widening to a set must not widen to *any* client), an empty set refuses to boot.

### ⚠ Why neither was caught before 027

Both have been live since 019, and three things hid them:

1. The only authenticated core-api call 019's mobile app made was a **best-effort** `PUT /v1/cart` snapshot
   — wrapped in `runCatching`, failure discarded.
2. 019's checkout was **never run on a device** (its own carry-forward 2 says so), so no other
   authenticated route was ever exercised.
3. The **edge** authorizer was correct all along, so account routes worked — which made the app look
   authenticated when half of it was not.

027 is simply the first feature that depends on mobile authenticating to the hot path.

### The lesson

The client **swallowed** both failures — `runCatching`, `catch (e: AppException) { false }` — so a total
authentication failure presented to the operator as "the cart just doesn't sync", and the diagnosis took a
round trip through the server logs to find. Three things came out of it: the coordinator now treats
`Unauthenticated` as **retryable** (a rejected token is not the shopper's mistake and heals on the next
attempt, so binning their queued work over it was wrong), the header choice is a **pure, tested function**
instead of untestable plugin internals, and [quickstart.md](quickstart.md) §6a is now a first-line triage
table for "it doesn't sync" keyed on what the logs actually say.

### Original write-up (kept for the record)

**The symptom.** With the migration applied and `core-api` running, adding to the cart on iOS and signing in
on Android showed nothing. The logs were unambiguous: the client was doing everything right —
`GET /v1/cart`, `POST /v1/cart/items`, `POST /v1/cart/merge` all arriving — and **every single one answered
`401` in under a millisecond**. A sub-millisecond 401 is not a network or database problem; it is a claim
being rejected before any work happens.

**The cause.** `auth.PoolVerifier` held a single `clientID` string and checked
`claims.ClientID != v.clientID`. But a Cognito pool legitimately has **more than one app client**: the
customer pool has a web client and a **mobile** client (013, `infra/envs/dev/auth-customer.tf:153`,
published at `/effy/<env>/auth/customer/mobile_app_client_id`), because their refresh windows and auth
flows genuinely differ. `make core-run` passed only the web id. Every token customer-mobile has ever
minted was therefore rejected by core-api.

**⚠ This is a pre-existing defect from 019, not from this slice.** It has been live since the mobile
commerce work landed, and nothing caught it for three reasons that are worth naming:

1. The only authenticated core-api call 019's mobile app made was a **best-effort** `PUT /v1/cart` cart
   snapshot — wrapped in `runCatching`, failure discarded.
2. 019's checkout was **never run on a device** (its own carry-forward 2 says so), so the other
   authenticated routes were never exercised.
3. The **edge** authorizer was correct all along — 013 added the mobile client to its audience *list*. Only
   core-api's own verifier assumed a pool has exactly one client.

027 is simply the first feature that depends on the mobile app being able to authenticate against the hot
path, which is why it surfaced now.

**The fix.** `PoolVerifier` takes a **set** of app client ids (`clientIDs ...string`, checked with
`slices.Contains`) — the same shape the edge authorizer always had. `Pool.ClientIDs` reads the existing
`AUTH_*_CLIENT_ID` env var with `envSeparator:","`, so a single-value deployment is unaffected, and
`make core-run` now passes `web,mobile` from the two SSM parameters. Startup **fails closed** on an empty
set: accepting nothing and 401-ing forever is worse than refusing to boot.

Three tests pin it: a token from *either* configured client verifies, an unconfigured client is still
refused (widening to a set must not widen to any client), and an empty/whitespace set refuses to start.
The pre-existing `rejects wrong client id` and `rejects valid token from another pool` cases still pass —
pool isolation (Principle IV) is untouched.

**The lesson, which is the reason this is written up rather than just fixed.** The client swallowed the
401 silently — `runCatching`, `catch (e: AppException) { false }` — so a total authentication failure
presented as "the cart just doesn't sync". A failure that the shopper cannot act on still has to be
visible to *someone*. Two changes came out of it: the coordinator now treats `Unauthenticated` as
**retryable** rather than a permanent refusal (a rejected token is not the shopper's mistake and heals on
the next attempt, so binning their queued work over it was wrong), and the diagnosis path for "it doesn't
sync" is now first-line documented in [quickstart.md](quickstart.md) §Limits.

---

## R13 (found by debugging, before it was ever reported) — Kotlin sent `1.0` where Go required an `int`

**How it was found.** With R12a/R12b fixed, the dev database told the real story: **one** customer row,
**one** cart, `revision = 1`, **zero items**. One cart write had ever succeeded — a `DELETE` — so no `add`
had ever worked, on any client, ever. That did not fit "the token is fixed now", so the next suspect was
the request body itself.

**The defect.** TypeScript `number` → JSON Schema `"number"` → Kotlin `Double`. So
`kotlinx.serialization` sent `{"quantity":1.0}`, and Go's `encoding/json` **cannot** unmarshal `1.0` into
an `int`:

```
kotlin  (quantity 1.0): err=json: cannot unmarshal number 1.0 into Go struct field ... of type int
web     (quantity 1):   err=<nil>
```

Every `POST /v1/cart/items` and `PATCH /v1/cart/items/{id}` from customer-mobile therefore failed to bind
and answered **422**. It was invisible behind R12a/R12b's 401, and would have been the *next* failure.

⚠ `customer-web` was never affected — JavaScript serialises an integer as `1`, with no decimal point. That
asymmetry is why the web cart worked while the mobile one did not, for the *second* independent reason in
this feature.

⚠ Only the REQUEST direction ever broke. `kotlinx` happily reads `3` into a `Double`, so responses always
parsed, which is why nothing looked wrong on screen.

**Fix, at the contract.** A `WireInt` alias in `cart.ts` carrying `@asType integer` (verified supported by
`ts-json-schema-generator`), applied to every count, quantity, limit and revision. The schema now says
`"integer"`, the generator emits `Long`, and a whole number goes on the wire. Fixing the *generator input*
rather than the Go DTO means every future integer field inherits the fix instead of re-earning the bug.

**Tests, placed where the break was** — at the DTO, in `handler_binding_test.go`: a whole number binds, a
**float is refused rather than silently truncated to 0** (taking `1.0` as `0` would empty a shopper's
line), `changeId` binds by its camelCase wire name, and the optional `changeId` may be absent.

**⚠ Known and deliberately left**: `QuotePackageItemDTO`, `OrderShortfallDTO` and `OrderItemDTO` still type
`quantity` as `Double`. All three are **response-only** and parse correctly, so they are cosmetic, not
broken. Widening `@asType integer` across `order.ts`/`checkout.ts` is a follow-up, not something to do
in the middle of a live debugging session.

**The lesson.** Three defects stacked on one code path, each masked by the one in front of it, and all
three shared a single root cause: **customer-mobile had never successfully written to the hot path**, so
nothing on that path had ever been exercised. Unit tests passed throughout — the fakes spoke Kotlin on both
sides and never crossed the wire. A contract SSOT guarantees both ends agree on *names*; it guaranteed
nothing about whether the generated types could actually round-trip. That gap is what a contract test
between the generated Kotlin and the real Go DTOs would close, and it is the strongest carry-forward this
feature has produced.

---

## Verification reality check (recorded, because it constrains sign-off)

`core-api` is **local Docker only** by decision; its cloud deployment is its own slice. Everything in
this feature that runs on the hot path is therefore verifiable **locally against the dev database**
(`make core-run` + the dev DSN), including the cross-device claim: two clients pointed at one local
`core-api` *is* the two-device test, because the authority they converge on is the one thing under
test. What **cannot** be proven in this slice is behaviour over real network latency and mobile
radio loss from an internet-facing deployment — SC-002's "within 5 seconds" is measured locally and
re-measured when the hot path goes live. That limitation is stated in
[quickstart.md](quickstart.md) §Limits rather than left for a reader to discover.
