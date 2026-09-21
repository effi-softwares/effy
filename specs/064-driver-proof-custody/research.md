# Research — 064 Driver Proof of Delivery & Custody

**Date**: 2026-09-21 · **Spec**: [spec.md](spec.md)

Every finding below was established by reading the current codebase or querying the live dev
database, not by recalling what a previous slice said. Three of them contradict what the spec assumed.

---

## R1 — Backend path (Principle III)

**Decision**: **Cold path only**, split across two existing services.
- Driver-facing proof, failure and custody → `apis/edge-api/driver` (driver authorizer).
- Back-office exception reading → `apis/edge-api/fleet` (back-office authorizer).

**Rationale**: The driver app has been on the cold path since 049 and all of 063's work sits there;
a driver completing a drop is a low-frequency operator action, not latency-sensitive customer
traffic. Back-office exception reading is precisely the ops CRUD the cold path exists for, and 056
already established `edge-api/fleet` as the back-office fleet service. **No hot-path change, and no
Principle III exception is required.**

**Alternatives considered**: Putting proof on `core-api` was rejected — it would make completing a
delivery depend on the hot path being up, and 063 recorded the identical reasoning when it refused
to have wave planning call `core-api`.

⚠ **`edge-api/fleet` is the right home for US3, not `edge-api/driver`**, for 056's own stated reason:
a mis-wired route in the driver service would hand a *driver* the ability to read and act on every
driver's exceptions.

---

## R2 — ⚠ A same-day order cannot currently reach `delivered` at all

**Finding**: The only writer of `shop_fulfillment.status = 'delivered'` anywhere in the platform is
`apis/edge-api/orders/src/arrival/repository.ts:103` — 053's **back-office manual arrival** path,
built for *standard* packages handed to a carrier.

`apis/edge-api/driver/src/work/delivery.ts:103` says it outright:

> `delivered` is NOT reachable here: completing a drop requires proof (D16), which is Slice D.

**So today a same-day delivery can only be completed by a back-office admin asserting it happened.**
The driver who actually handed the package over cannot record it. This is a sharper statement of the
slice's purpose than the spec had, and it makes US1 a P1 with no argument.

**Consequence for the plan**: the proof path is not "an extra record attached to an existing
completion" — it *is* the completion. It must do everything the arrival path does.

---

## R3 — ⚠ The shared completion rule already anticipates this caller, and it is not wired

**Decision**: The proof path MUST write a `public.package_arrival` row and MUST call
`enqueueOrderDeliveredIfComplete` from `@effy/edge-shared`, inside one transaction.

**Rationale**: That helper's own header names both callers:

> Two services now complete a package: `edge-api/driver` (an Effy driver's same-day drop, closed with
> proof) and `edge-api/orders` (a back-office record of a carrier delivery).

`edge-api/driver` **imports neither** — verified by grep. 063's teardown removed the driver-side
caller and the shared rule has been sitting with one consumer ever since.

Two things follow, and both are load-bearing:
1. **Order completeness keys on `package_arrival`, not on `shop_fulfillment.status`.** A proof that
   sets the status and skips the arrival row leaves the order permanently incomplete — the customer
   is never told it arrived, and nothing fails.
2. **The rollup is not a max.** A mixed order is complete only when *every* package has arrived.
   053 fixed a live defect where the driver path announced delivery on a drop id, telling a customer
   their order had arrived while the standard half was still with a carrier. Re-introducing a
   drop-scoped announcement would reproduce that exact defect.

**Alternatives considered**: Writing a second completion rule in the driver service — rejected on
Principle II, and specifically because this is the third time this repo has recorded two
implementations of one rule diverging silently (029's banner target, 033's `available`, 052's
`summarizeFulfillment`).

---

## R4 — ⚠ There is no delivery code, so the `code` proof method has nothing to verify against

**Finding**: `delivery_code` / `deliveryCode` appears **nowhere** — not in any service, migration,
contract or app. 049 recorded walking a "delivery-code" proof live, but whatever carried it went
with 063's teardown.

**Decision**: **The `code` method is deferred, with its reason recorded.** This slice ships
**photo, signature and contactless**. The service refuses `code` with an explicit, named refusal and
the app does not offer it.

**Rationale**: Verifying a code requires *issuing* one and showing it to the customer in advance —
which is a customer-surface change on both customer surfaces, and FR-027 has just deliberately scoped
customer-facing proof out of this slice. Building a `code` path with nothing to check against would
be a gate that looks enforced and compares a value to itself; 063 refused a per-product volume gate
on exactly that reasoning, and this is the same shape.

**Consequence**: `ProofMethod` keeps `"code"` in the contract (removing it would be a breaking change
for a method that is coming), and the deferral is pinned by a test the way
`DEFERRED_TO_SLICE_D` pins the routes — so the entry must be deleted when the method is built.

⚠ **This narrows US1**: FR-003 is not met by this slice and the spec must record that rather than
have the requirement sit apparently-satisfied.

---

## R5 — ⚠ Proof media is ARCHIVED, never deleted (revised 2026-09-21, operator direction)

**Decision**: An `aws_s3_bucket_lifecycle_configuration` on the existing media bucket, scoped by
`filter { prefix = "proof/" }`, with **a transition and no expiration**:

- `transition { days = 90, storage_class = "GLACIER_IR" }`
- `noncurrent_version_transition { noncurrent_days = 90, storage_class = "GLACIER_IR" }`
- `abort_incomplete_multipart_upload { days_after_initiation = 7 }`
- ⚠ **No `expiration` block of any kind.**

**Rationale**: Proof is evidence. The operator's direction is that it must survive for audit and for
any legal question raised about a delivery, so the lifecycle moves it to cheaper storage at the point
the active dispute window closes (a refund can be rejected up to 30 days later — 055) rather than
removing it.

**Why Glacier Instant Retrieval specifically, and not a colder tier**: GLACIER_IR serves a
`GetObject` in **milliseconds through the ordinary S3 API**, so an existing presigned GET keeps
working unchanged. Glacier Flexible Retrieval and Deep Archive both require an asynchronous
`RestoreObject` call and a wait measured in minutes or hours, which would force **two behaviours into
every read path** — one for recent proof and one for old — plus a restore-and-notify flow, polling,
and a UI state for "your evidence is being retrieved."

The saving does not justify it. A proof photograph is roughly 200 KB; at 500 deliveries a day that is
about 36 GB a year. GLACIER_IR costs about **$0.15/month per year accumulated**; Deep Archive would
save roughly **$0.11/month** and cost an entire asynchronous retrieval subsystem. ⚠ **Archiving this
way costs zero code** — the storage class changes underneath and nothing above it can tell.

**Prefix scoping is mandatory**: the same bucket holds `products/` and `promotions/` media. An
unscoped transition would push the live product catalogue's images into an archive tier, where every
storefront read would still work but cost retrieval fees on every page view.

⚠ **A near-miss worth recording, because the earlier plan had it.** When retention was time-limited
the rule would have been an `expiration`, and `infra/envs/dev/media.tf:39` enables **versioning** on
this bucket — where `expiration` does not delete anything, it writes a delete marker and the object
version persists indefinitely. The platform would have reported every photograph deleted while all of
them remained in S3. It would have passed `terraform validate`, applied cleanly, and shown the right
thing in every console and test. Archiving makes the trap moot, but the shape is the one 058's
`WriteTimeout` and 024's VectorDrawable record: valid, applies, wrong only where it runs.

**Alternatives considered**:
- *A separate archive bucket with a replication rule* — rejected: a second bucket needs its own CORS,
  IAM, SSM parameter and key namespace, and object keys would then mean different things in different
  places. A storage class is a property of an object; it does not need a new home.
- *Keeping everything in STANDARD forever* — rejected as simply more expensive for no benefit, since
  GLACIER_IR is API-identical.

---

## R6 — There is no expiry to derive, and that removes a whole mechanism

**Decision**: Nothing computes whether media still exists. Every proof record with a `media_key` can
produce its media, at any age.

**Rationale**: This follows directly from R5 and it **deletes work** rather than adding it. The
earlier design needed a shared `proof-retention.ts` holding the one definition of the 90-day rule, a
derived "expired" answer on three read paths, and a test asserting the derivation agreed with the
Terraform lifecycle number — because a drift between them would make the platform either report media
it had deleted or hide media it still held. None of that exists now: there is one storage class
transition, invisible to every reader.

⚠ **FR-026 inverts as a result, and the inversion is the point.** Under time-limited retention, a
missing object was an *expected state to render politely*. Now nothing deletes media, so a proof whose
object is absent means something is **wrong** — a failed upload that was recorded anyway, a key
mismatch, or an object removed out of band. It is an alarm (`ProofMediaMissingOnRead`), not an empty
state. A system that renders its own corruption as a normal outcome cannot report it, and that is the
054 "vacuously passing" shape by another road.

The one legitimate proof without media remains **contactless captured without an image**, which is
distinguishable because `media_key IS NULL` was never set rather than pointing at something absent.

---

## R7 — Custody is derived too

**Decision**: "Who holds this package" is a query over existing rows, not a new custody table. A
package is in a driver's hands when its `round_package.state = 'picked_up'` on a round belonging to
that driver, and no `hub_checkin` (collection) or `package_arrival` (delivery) has superseded it.

**Rationale**: Same rule as R6. A custody table would be a second source of truth for a fact the
round rows already state completely, and 063 already found an FK that was "wrong in principle" by
duplicating a fact the order snapshot held.

⚠ **FR-018 (a driver cannot silently end a shift holding packages) is the reason this must be a
first-class query rather than an incidental join.** 056 found that standing a driver down could
strand physical goods permanently and invisibly; this is the read that makes that visible, and it
must be exact.

---

## R8 — ⚠ The camera, signature surface and upload path already exist

**Finding**: `apps/driver-mobile/.../core/platform/` already contains, with **both** Android and iOS
actuals:
- `PhotoCapture.kt` — `expect @Composable fun rememberPhotoCapture(onCaptured: (ByteArray) -> Unit)`,
  returning **null when capture is unavailable** so the caller hides the option.
- `CameraPreviewSurface.kt`, `PngEncode.kt` (`ImageBitmap.toPngBytes()`), `PermissionRequester.kt`.
- `ImageUpload.kt` — `uploadBytes(url, bytes, contentType)`, which deliberately uses a **plain
  platform HTTP client without the driver bearer**, because the presigned signature *is* the
  authorization.

**Decision**: Build none of it. This slice wires what 049 and 060 already shipped.

**Consequence**: the spec's assumption that "platform-specific camera capture is the outstanding item
this slice builds" is **wrong and is corrected**. The mobile work is wiring and state, not capability.
This materially shrinks US1.

---

## R9 — Media bytes must never enter the offline queue

**Decision**: Ordering is **upload media first, then queue the submission**. The offline queue carries
only the small JSON proof body, which references an already-uploaded `mediaKey`.

**Rationale**: `core/offline/OfflineQueue.kt` and `SyncCoordinator.kt` already exist (built for 063's
collection writes) and are reused for FR-008. But a queue that persists multi-megabyte photographs on
a phone is a different thing entirely — unbounded local storage, and a replay that re-uploads bytes.

⚠ **This gives FR-006 for free and is why the ordering matters**: because the media lands before the
submission is queued, a drop can never be marked delivered with proof that failed to upload. The
failure surfaces at capture time, where the driver can retake the photo, rather than silently later.

**Consequence**: with no connectivity the photo cannot be uploaded, so the drop cannot complete
offline. That is honest and is what FR-006 demands; the alternative marks a delivery complete against
proof that may never exist.

---

## R10 — Idempotency follows the established `changeId` pattern

**Decision**: Every write takes `changeId` and is idempotent on it, matching
`apis/edge-api/driver/src/work/complete.ts`, whose header states the rule for this exact service.

**Rationale**: 027's changeId-per-action rule. A driver is on a phone in a loading bay; a request that
arrives without its response reaching them is ordinary. SC-007 (two devices, one completion) is the
proof.

---

## R11 — Hub check-in becomes a real stop

**Decision**: `commitWave` appends a `round_stop` of kind `'hub_checkin'` to every collection round,
and `TodayItemRef.kind` gains `"hub_checkin"`.

**Rationale**: `round_stop_kind_check` **already permits** `'hub_checkin'` and `OrderableStop.zoneId`
is already documented as *"Null for the hub, which is in no zone"* — the design anticipated this stop
and 063 never created it. The consequence was found live on 2026-09-21: once every shop stop went
`done`, `todayView`'s `outstanding` filter emptied, both routes into the round disappeared, and a
driver was left holding thirteen packages with no way back in. A UI patch made the hub row tappable;
this is the model fix behind it.

**Alternatives considered**: Synthesising the hub item in the service without a row — rejected because
the stop also needs a status, a completion time and a position in the ordering, all of which
`round_stop` already provides, and a synthetic item would need each reinvented.

⚠ **`collectionRun`'s DTO maps stops to `CollectionStopSummary`, which expects a shop name and code.**
The hub stop has neither, so the run-detail projection must exclude it explicitly rather than emit a
stop with empty identity — the "renders as nothing with no error" shape `check-token-usage.mjs` exists
for.

---

## R12 — Failure reasons and the orphaned reader

**Finding**: `public.delivery_failure` and `public.collection_task_issue` **do not exist** — confirmed
against the live dev database (0 rows in `pg_tables`). 063's teardown dropped them. The only remaining
trace is a comment at `apps/back-office/src/features/drivers/DriversListScreen.tsx:173`.

**Decision**: A new `public.delivery_attempt_failure`, and US3 rebuilds the reader.

**Rationale**: 056 existed precisely because the driver app "has been recording exceptions for a reader
that does not exist". It built that reader; the teardown removed the tables from under it. ⚠ **The
capability regressed to worse than 056 found it** — there is now neither a writer nor a reader — and
that is why US3 is in this slice rather than a later one.

**Failure reasons stay a closed set** (`nobody_home` / `wrong_address` / `customer_refused` /
`access_blocked` / `other`), already declared in the contract. Free text would be unreportable in
aggregate, which is the entire point of an exception list.

---

## Open items carried into the plan

| # | Item | Disposition |
|---|---|---|
| 1 | FR-003 (code verification) | **Not met by this slice** — R4. Spec to be amended, not quietly left. |
| 2 | Customer notification of a failed delivery | Out of scope, unchanged from 056 and 063. |
| 3 | Re-attempt scheduling | Out of scope, unchanged from 063. |
| 4 | Proof for standard packages after hub | Out of scope — an external carrier holds them. |
| 5 | How long the archive is kept | **Indefinitely, by operator direction.** ⚠ Recorded tension: Australian Privacy Principle 11.2 expects personal information to be destroyed once no longer needed, and these are photographs of people's homes. A defensible bounded alternative is **7 years** — comfortably past the 6-year limitation period for contract and tort actions in Victoria (Limitation of Actions Act 1958) and aligned with the ATO's record-keeping convention. It is one `expiration` block to add later and needs no code change. Raised, not decided. |
