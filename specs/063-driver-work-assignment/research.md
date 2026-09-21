# Research — Driver Work Assignment & Wave Planning (063)

Phase 0. Every unknown in the plan's Technical Context is resolved here, or explicitly deferred with
the reason. Findings that merely restate `docs/research/logistics/` are cited, not repeated — this
document covers what that pass left open and what building against the *current* schema settled.

---

## R1. The trigger is a wave, and the schedule already exists — read backwards

`SameDayCutoff` (`apis/core-api/internal/platform/delivery/sameday.go`) answers, at checkout, *"can
this shopper still get same-day?"* — `now ≤ run_time − prep_buffer` for the latest makeable run.

The planner needs the **same arithmetic in the opposite direction**: given the 14:00 run and a 60-minute
buffer, everything for that run must be collected by 13:00, so plan at `13:00 − planning_lead`.

**Decision**: the wave trigger is `for each active collection run: at (run_time − prep_buffer −
planning_lead), plan`. `planning_lead` is new configuration with a default, not a literal.

**Rationale**: D12 — two independent lines of evidence (WMS wave-planning practice, and our own
`delivery_collection_run` schema) point at the same shape. A wave *is* a deadline and a batch; the
previous model's one-minute scavenger had neither.

---

## R2. ⚠ THE FLAGGED DECISION — where the cutoff rule lives

`docs/logistics-engine-architecture.md` §Slice C flagged this and did not settle it. Three options:

| Option | Rejected / chosen because |
|---|---|
| Planner calls `core-api` for the deadline | **Rejected.** Wave planning would depend on the hot path being up. A missed wave is *silent* — no error a shopper sees, no alarm, just packages that do not move. 053 recorded the same shape when an unconfigured FCM halted an entire drain. |
| Move the rule to a shared package | **Impossible.** `@effy/edge-shared` is TypeScript; `SameDayCutoff` is Go. Principle II's shared-contract mechanism does not span the two runtimes. |
| **A deliberate duplicate, pinned by a cross-language contract test** | **CHOSEN.** |

**Decision**: the deadline arithmetic is implemented once in TypeScript for the planner, and pinned to
the Go implementation by a contract test sharing **byte-identical fixtures**, including DST fixtures.

**⚠ This is a duplicate, and duplicates are what 054 spent a whole slice removing.** It is accepted
here only because the alternative is worse and the guard is mechanical. The two implementations answer
*different questions over the same data* (may a shopper choose same-day / when must collection finish),
so they are not two copies of one rule so much as two readings of one schedule — but they share the
`run_time − buffer` arithmetic and the zone, and that shared part is what the contract test pins.

**Precedent**: 028 closed 027's biggest carry-forward exactly this way — `wire_contract_test.go` and
`BannerWireContractTest.kt` sharing one hand-duplicated JSON literal, proven by breaking it two ways.

**⚠ DST fixtures are not optional.** 058 found **two real calendar bugs** that only DST tests caught,
including a silently skipped trading hour, and both came from rebuilding an instant from wall-clock
fields — which is precisely what `time.Date(y, mo, d, hour, minute, …, MelbourneTZ)` does. The fixtures
MUST include the day DST ends (02:30 happens twice) and the day it starts (02:30 does not exist).

---

## R3. Path selection (Principle III)

**Cold path throughout. No hot-path work in this slice.**

| Workload | Path | Why |
|---|---|---|
| Wave planning (scheduled) | Cold | Periodic batch work, seconds of runtime, no user waiting. Textbook cold path. |
| Dispatcher console reads/writes | Cold | Back-office CRUD — the doctrine's own example. |
| Driver work reads | Cold | `edge-api/driver` already serves this audience; a driver opening their round is not latency-critical in the way a storefront read is. |

**No customer-facing traffic exists in this feature at all**, which is what makes the choice
uncontroversial. Principle III is satisfied without an exception.

---

## R4. Service placement — measured, not assumed

053, 054 and 056 each hit the CloudFormation 500-resource ceiling and each recorded the count. Current:

| Service | Handlers | Authorizer |
|---|---|---|
| `edge-api/admin` | **72** | back-office |
| `edge-api/fleet` | **23** | back-office |
| `edge-api/driver` | **6** | driver |

**Decision**: **no new service.** The dispatcher console goes in **`edge-api/fleet`** (back-office
authorizer; fleet already owns drivers, vehicles, readiness and coverage — dispatch is the same
domain and the same audience). Driver-facing work reads go in **`edge-api/driver`**. The scheduled
planner goes in **`edge-api/fleet`**.

**Rationale**: `fleet` at 23 handlers has ample room, and 056 created it precisely so the driver domain
would stop pushing `admin` toward the ceiling. Adding a fourth service would cost a stack, an
authorizer wiring and a deploy step to solve a problem that does not exist.

**⚠ Deliberately NOT in `edge-api/driver`**, for the reason 056 recorded when it made the same call: a
mis-wired route there would hand a **driver** the ability to assign work — including to themselves.

---

## R5. ⚠ The ordering rule must be shared, or the two surfaces will disagree

The dispatcher sees a round's order. The driver sees a round's order. **If those two disagree, a
dispatcher reorders a round and the driver never sees it** — and nothing fails, because both surfaces
successfully render *something*.

That is 029's banner target, 033's `available` flag and 052's `summarizeFulfillment` — the exact shape
where both surfaces keep working and the divergence is silent.

**Decision**: the sort key (D20 — status → time constraint → zone → shop) is implemented **once in
`@effy/edge-shared`** and consumed by both `fleet` and `driver`. Principle II, applied *before* the
second consumer exists rather than after it drifts.

**Precedent**: 058 promoted three rules this way; 062 promoted the coverage label on its second reader.

---

## R6. Concurrency — two passes must not double-assign

Waves are scheduled, retried, and can be triggered manually by a dispatcher. FR-005 requires a second
pass to change nothing.

**Decision**: assignment exclusivity is a **partial unique index**, not service logic —
one open assignment per package. A second pass attempting the same insert loses on the constraint and
is handled, rather than racing on a `SELECT … WHERE NOT EXISTS`.

**Rationale**: 061 used exactly this for vehicle holdings (`WHERE ended_at IS NULL`, one open holding
per vehicle AND one per driver), and its container tests proved it under concurrency. 054 proved the
same principle against two concurrent payments for the last unit. **A check-then-write is not a
guarantee**; 039's newsletter rate limit recorded this and 052 repeated it.

---

## R7. Load balancing (FR-014) — what "fewest packages" counts

Settled by operator decision during `/speckit-specify`. Open question it left: fewest packages
*assigned today*, or *currently outstanding*?

**Decision**: **assigned today**, counting every package assigned to that driver since their duty
session began, whether or not it is now complete.

**Rationale**: counting only outstanding work makes a driver who has just *finished* a round the
lowest-loaded candidate, so the fastest worker is continuously handed the most work — a fairness
failure that looks like a bug to the driver and cannot be explained to them. FR-014a requires the rule
be explainable; "you had the fewest today" is, "you were momentarily emptiest" is not.

**⚠ The tie-break under the tie-break must be stable, not random.** FR-014 requires the same inputs to
produce the same choice; an arbitrary pick makes the planner untestable and a dispatcher's "why did
this happen" unanswerable. Resolved deterministically on driver id.

---

## R8. Capacity — weight only, and the limitation is real

`public.vehicle` carries `payload_kg`, `load_volume_litres` and `crate_capacity` (061).
`public.product` carries `weight_grams` (047, re-added).

**Decision**: the capacity gate (FR-012) is **weight only**. Volume and crate capacity are recorded on
the vehicle and **cannot be evaluated**, because the catalogue describes no product volume.

**⚠ This is a stated limitation, not an oversight, and it must not be papered over with an estimate.**
Inventing a volume-per-product constant would produce a gate that *looks* enforced and is arithmetic
over a guess — 052's "not a tax invoice" reasoning and 054's "inventing stock is worse than not
returning it". A van that is full by volume and light by weight will be over-assigned; the dispatcher
sees and fixes it (D15), which is what manage-by-exception is for.

---

## R9. What "ready" means, and what the planner may touch

`public.shop_fulfillment` is the package: one row per (order, shop), carrying
`status ∈ {pending, received, picking, ready_for_pickup, collected}` and
`delivery_method ∈ {same_day, standard}` (NULL for pre-047 rows).

**Decisions**:
- A package enters a wave at **`ready_for_pickup`** — the shop's terminal state.
- **`delivery_method` is READ, never written** by this feature (FR-023). NULL is treated as `standard`,
  because a pre-047 package was never sold as same-day.
- `collected` is written when the driver completes the shop stop, as it was before.
- ⚠ The planner MUST NOT write any other `shop_fulfillment` status. The shop's lifecycle belongs to the
  shop (020), and 057's order console is its second writer already.

---

## R10. Real-time — out of scope here, and deliberately

D11 settled push-to-wake + fetch-the-truth keyed by a monotonic revision, with SSE as a **spike, not a
given**. 058 built an SSE stream on `core-api` for the shop console, and recorded the hot path as the
platform's only long-running process — so a driver SSE stream would mean putting driver traffic on
`core-api`, which R3 just declined.

**Decision**: **not in this slice.** A driver's app fetches its work on open, on resume, and on pull.
A dispatcher's change is visible on the driver's next fetch.

**⚠ Recorded so it is not mistaken for an omission**: FR-037 ("a driver MUST see changes made by a
dispatcher") is satisfied by fetch, not by push. If that proves too slow in the walk, push-to-wake is
the next step and the revision field this slice stores is what makes it cheap.

---

## R11. Open, and deferred with reason

| Item | Why deferred |
|---|---|
| `planning_lead` default value | Needs one real round timed end to end. Ships configurable with a conservative default; tuning is an operator setting, not a code change. |
| Feasibility gate (FR-013) precision | With no travel-time data (D20), "can this round finish before the deadline" can only be estimated from stop count and a per-stop allowance. Ships as a configurable per-stop allowance, and the estimate is **shown to the dispatcher** rather than trusted silently. |
| Re-offer on driver failure mid-round | D13 names offer/fallback as correct *only* on the failure-recovery path. That path needs the proof/custody model (Slice D) to know what a driver still holds. |
