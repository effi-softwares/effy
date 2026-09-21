# Data Model — 064 Driver Proof of Delivery & Custody

**Migration**: `db/migrations/<ts>_driver_proof_custody.sql` — forward-only, additive.
Two new tables, one widened CHECK. **No table is dropped and no column is removed.**

---

## `public.delivery_proof` — evidence a drop was completed

One row per completed drop. The row *is* the proof; the image is beside it in S3.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `stop_id` | uuid not null | → `round_stop(id)`, the customer drop |
| `method` | text not null | CHECK in (`photo`,`signature`,`contactless`) — ⚠ **`code` is absent** |
| `media_key` | text null | S3 object key under `proof/`; null for contactless-without-media |
| `note` | text null | |
| `captured_by_driver_id` | uuid not null | → `driver(id)` — FR-029 attribution |
| `captured_at` | timestamptz not null | ⚠ the **only** input to the retention answer (R6) |
| `change_id` | uuid not null | idempotency, R10 |
| `created_at` | timestamptz not null default now() | |

**Constraints**
- `UNIQUE (stop_id)` — ⚠ **this is what makes FR-005 a property of the database.** A drop cannot
  accumulate two proofs, so a retried submission cannot record a second delivery however the service
  behaves.
- `UNIQUE (change_id)` — a replayed action is a no-op.
- ⚠ `CHECK (method <> 'photo' OR media_key IS NOT NULL)` — a photo proof without an image is
  unrepresentable, so FR-006 is enforced by the schema rather than remembered by a service.
- ⚠ `CHECK (method <> 'signature' OR media_key IS NOT NULL)` — same reason.

⚠ **`method` deliberately omits `code`** rather than permitting a value nothing can produce. 063
recorded that a closed CHECK is what turns a rule into a fact; admitting `code` here would leave a
representable state the platform cannot verify (R4). Adding it later is a one-line widening — and the
reader audit that 053, 056, 057 and 059 each shipped a defect through is exactly why it is not
pre-emptively widened now.

⚠ **There is no `media_deleted` flag and no expiry column**, because nothing deletes proof media
(R5). `captured_at` drives the S3 lifecycle *transition* to archival storage, and that transition is
invisible above the storage layer — no reader changes behaviour with an object's age.

⚠ **An absent media object is therefore a fault, not a state.** A `media_key` that resolves to
nothing means a failed upload was recorded anyway, a key mismatch, or an object removed out of band.
It raises `ProofMediaMissingOnRead`; it is never rendered as a tidy empty state. The one proof that
legitimately has no media is **contactless captured without an image**, distinguishable because
`media_key` is NULL rather than pointing at something missing.

---

## `public.delivery_attempt_failure` — a drop that could not be completed

**Many** rows per drop — a drop may be attempted more than once over its life.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `stop_id` | uuid not null | → `round_stop(id)` |
| `reason` | text not null | CHECK in (`nobody_home`,`wrong_address`,`customer_refused`,`access_blocked`,`other`) |
| `note` | text null | ⚠ required when `reason = 'other'` |
| `driver_id` | uuid not null | → `driver(id)` |
| `failed_at` | timestamptz not null | |
| `resolved_at` | timestamptz null | set when back-office closes it (FR-022) |
| `change_id` | uuid not null unique | idempotency |
| `created_at` | timestamptz not null default now() | |

**Constraints**
- ⚠ `CHECK (reason <> 'other' OR (note IS NOT NULL AND btrim(note) <> ''))` — FR-010 in the schema.
  A free-text escape hatch with no text is an exception nobody can act on.
- **No `UNIQUE (stop_id)`** — deliberately. A second attempt is a second row, and collapsing them
  would destroy the history FR-012 exists to keep.

⚠ **This replaces `public.delivery_failure`, which 063's teardown dropped** — confirmed absent from
the live database. It is a new table rather than a restoration because the work model it referenced
(`delivery_task`) no longer exists; this one hangs off `round_stop` (R12).

---

## `public.round_stop` — widened, not changed

No DDL. `round_stop_kind_check` **already permits** `'hub_checkin'` and `commitWave` has simply never
created one. Phase 3 starts creating it (R11).

⚠ Two existing readers must be updated in the same change or they silently misbehave:
- `todayView`'s `outstanding` filter — **gains** the hub stop, which is the fix.
- `collectionRun`'s stop projection — **must exclude** it, because `CollectionStopSummary` requires a
  shop name and code the hub has neither of. Without the exclusion the run detail renders a stop with
  empty identity and no error anywhere.

---

## Derived, never stored

Two facts this slice reports are computed on read. Both follow 027's counted-not-stored rule, whose
fourth and fifth applications these are.

**~~Media expiry~~ — removed.** ⚠ The earlier design derived "has this media been deleted?" from
`captured_at + 90 days`. **Nothing deletes proof media any more** (R5, operator direction), so there
is nothing to derive: every proof with a `media_key` can produce its media at any age. The shared
`proof-retention.ts` this section used to require does not exist.

**Custody (R7)** — who holds a package:

```
picked_up on a round belonging to driver D
  AND no hub_checkin for that round        (collection leg)
  AND no package_arrival for that package  (delivery leg)
⇒ D holds it, since round_package.updated_at
```

⚠ **FR-018 depends on this being exact.** 056 found that standing a driver down could strand physical
goods permanently and invisibly, because the work stayed claimed and every sweep skipped it. This
query is what makes that state visible before a shift ends.

---

## What this slice deliberately does not model

- **A custody table.** The round rows already state the fact completely (R7).
- **A delivery code.** Nothing issues one; a column would be a field nothing writes, which is 059's
  dormant-`device.ts` shape (R4).
- **A re-attempt schedule.** Out of scope, unchanged from 063.
- **Customer visibility of proof.** FR-027 — but the shape above forecloses nothing: exposing method
  and `captured_at` to a shopper later needs no change to how proof is captured or stored.
- **An archive retention limit.** Media is kept indefinitely by operator direction. ⚠ Recorded
  tension: Australian Privacy Principle 11.2 expects personal information to be destroyed once it is
  no longer needed, and these are photographs of people's homes. A bounded alternative — **7 years**,
  past Victoria's 6-year limitation period and aligned with ATO record-keeping — is one `expiration`
  block and needs no schema or code change. Raised in research R5, not decided here.
