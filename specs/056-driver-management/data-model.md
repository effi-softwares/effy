# Phase 1 — Data Model: Back-Office Driver Management

**Feature**: 056-driver-management · **Migration**: `<ts>_driver_management.sql` (one, forward-only)

House style (007/009/019/047/049/053/055): everything operational in `public`, governance in `admin`;
raw SQL, no ORM; text `CHECK` enums (no native PG enums, no triggers); an index on every FK;
`COMMENT ON` everything. Audit reuses `admin.audit_log`.

**This feature is overwhelmingly a READER.** Of the eleven driver tables 049 created, this migration
alters **three** and creates **none**. Everything else is read as it stands.

---

## 1. `public.driver` — the profile of record (ALTERED)

### 1a. Status widens from two values to three

```
status  text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'offboarded'))
```

- `active` — employed and eligible for work.
- `suspended` — temporarily stood down. Retained, no access, no work. Restorable (FR-018).
- `offboarded` — no longer employed. Retained for audit, permanently no access (FR-019).

**Migration**: `disabled` → `offboarded` before the CHECK is replaced. Both are "no longer working
here"; a suspension has never been representable, so no existing row can mean it.

⚠ **Every existing reader tests `= 'active'`** — six sites, measured in [research R2](./research.md#r2).
None widens silently. A test pins this rather than a comment.

### 1b. New columns

| Column | Type | Null | Requirement | Notes |
|---|---|---|---|---|
| `status_reason` | `text` | yes | FR-016 | Why the current status was set |
| `status_changed_at` | `timestamptz` | no, default `now()` | FR-006 | Effective date shown on the profile |
| `contact_phone` | `text` | yes | FR-007 | ⚠ PII — never in a log, metric or analytics payload (FR-050) |
| `started_on` | `date` | yes | FR-007 | Employment start |
| `emergency_contact_name` | `text` | yes | FR-007 | ⚠ PII |
| `emergency_contact_phone` | `text` | yes | FR-007 | ⚠ PII |
| `notes` | `text` | yes | FR-007 | Administrative note; mirrors `public.shop.notes` (009) |
| `licence_reference` | `text` | yes | FR-008 | A reference, **never a document image** (research R17) |
| `licence_expires_on` | `date` | yes | FR-008/FR-046 | Drives the expiry flag |
| `vehicle_registration_expires_on` | `date` | yes | FR-008/FR-046 | Same |

**Unchanged**: `id`, `cognito_sub`, `name`, `work_email`, `delivery_zone_id`, `vehicle_type`,
`vehicle_plate`, `created_at`, `updated_at`.

### 1c. Indexes

```
CREATE INDEX driver_name_trgm_idx ON public.driver USING gin (name gin_trgm_ops);   -- FR-003
CREATE INDEX driver_status_idx    ON public.driver (status);                        -- FR-003/FR-005
CREATE INDEX driver_register_idx  ON public.driver (name, id);                      -- FR-004 keyset
```

`work_email` is already `citext NOT NULL UNIQUE` — that unique index is what makes **FR-014's refusal**
a database guarantee rather than a service check, and it already exists.

### 1d. Concurrency

`updated_at` is the optimistic-concurrency token (research R12). Updates are
`WHERE id = $1 AND updated_at = $2`; zero rows affected → `409`.

### 1e. Field rules

- `name` — required, trimmed, non-empty.
- `work_email` — required at create, lower-cased, **immutable thereafter** (research R7).
- Every other field is **optional and clearable**. ⚠ FR-010 exists because the current implementation
  uses `COALESCE($n, col)`, which cannot distinguish "leave alone" from "clear". The write must
  distinguish *absent* from *null* in the request and set only the keys present.

---

## 2. `public.delivery_failure` — resolution state (ALTERED)

```
resolved_at      timestamptz
resolved_by_sub  text
resolution_note  text

CREATE INDEX delivery_failure_open_idx
    ON public.delivery_failure (failed_at DESC) WHERE resolved_at IS NULL;
```

Requirements FR-027, FR-031, FR-032, FR-033. **Nothing else on the table changes**; the driver app keeps
writing it exactly as it does. ⚠ Until this feature, **nothing anywhere read this table** — the driver
service is its only toucher, and it only inserts.

---

## 3. `public.collection_task_issue` — resolution state (ALTERED)

```
resolved_at      timestamptz
resolved_by_sub  text
resolution_note  text

CREATE INDEX collection_task_issue_open_idx
    ON public.collection_task_issue (reported_at DESC) WHERE resolved_at IS NULL;
```

Requirements FR-028, FR-031, FR-032. Same shape, same reasoning, and the same "no reader existed" fact.

---

## 4. Read-only entities (no schema change)

| Entity | Table(s) | Read for |
|---|---|---|
| Duty session | `driver_duty_session` | FR-034, FR-037 |
| Run | `driver_run` | FR-035, FR-039 |
| Collection stop | `collection_task` | FR-035, FR-040 |
| Drop | `delivery_task`, `delivery_task_package` | FR-035, FR-040 |
| Proof | `proof_of_delivery` | FR-041, FR-042 |
| Timeline | `driver_task_event` | FR-040 |
| Zone | `delivery_zone` | FR-009, FR-045 |
| Hub | `delivery_settings` | FR-006 |
| Order / package | `order`, `shop_fulfillment`, `order_package_delivery` | FR-030, FR-036 |
| Staff | `admin.staff`, `admin.staff_role` | FR-022, FR-023 |

---

## 5. Derived entities — computed, never stored

### 5a. Stranded work (FR-021, SC-006)

Work claimed by an ineligible driver that the release sweep will not reclaim:

- `collection_task.status IN ('collected','short')` on a run not `completed`/`cancelled`, **or**
- `delivery_task.status IN ('out_for_delivery','en_route','arrived')`,

**and** the owning driver is not `active`, or has no open duty session.

⚠ **Derived, not a flag.** 027's counted-not-stored rule, third application after 028's exhaustion count
and 055's refund proposals: a stored flag and the task rows can disagree, and then nobody knows which is
true. See [research R3](./research.md#r3) for why the sweep leaves this work behind on purpose.

**Releasing** it deletes the task rows the way the sweep does for un-started work, writes a
`driver_task_event`, and writes an `admin.audit_log` row. It is an explicit human action because it
asserts something about the physical world that no query can know.

### 5b. Unassigned work (FR-036)

Reuses the assignment sweep's own candidate predicate, extracted to a shared SQL constant and pinned by
a test asserting the two agree (research R6). If the console computed it independently the screen would
eventually be confidently wrong about the one question it exists to answer.

### 5c. Assignment readiness (FR-044, SC-009)

A driver **cannot receive work** when any holds: `status <> 'active'`; `delivery_zone_id IS NULL`;
`licence_expires_on < today`. The reason is returned as an enumerated cause, not a boolean — "cannot
work" without "why" is not actionable.

### 5d. Zone coverage (FR-045) · 5e. Expiry warnings (FR-046) · 5f. Period summary (FR-043)

Aggregations over the tables above. Counts only — ⚠ **no currency anywhere** (FR-049); the driver
domain has never carried money and does not start here.

---

## 6. `admin.audit_log` — governance (EXISTING, new target type)

`target_type = 'driver'`, `target_id = driver.id`. Actions:

```
driver.created            driver.updated           driver.status_changed
driver.duty_session_ended driver.work_released     driver.exception_resolved
driver.proof.viewed
```

⚠ **FR-024 closes a defect**: `grep -rn "audit_log" apis/edge-api/admin/src/drivers/` returns nothing.
Driver management is currently the **only** privileged back-office domain writing no audit row — shops,
promotions and catalog schema all do.

⚠ **`detail` carries no PII** (FR-050, and the column's own comment). Phone, emergency contact and
licence reference are recorded as **changed**, never as before/after values. A test asserts the detail
payload of a full-profile edit contains none of them.

⚠ `driver.proof.viewed` records the **issuing of a presigned URL**, not the fetch. A URL issued and
never opened still logs. That is the honest limit of presigning (research R4).

---

## 7. State transitions

```
                    ┌──────────── restore (FR-018) ────────────┐
                    ▼                                          │
   (create) ──► active ──── suspend (FR-016) ─────────► suspended
                  │                                          │
                  └──── offboard (FR-019) ──► offboarded ◄────┘
```

- `offboarded` is **terminal for access**. Restoring a departed employee is a deliberate re-hire
  decision; this slice does not offer it, and FR-014's refusal names the offboarded record so the
  operator chooses consciously between a re-hire path and a different address.
- ⚠ Every transition out of `active` is **guarded by the stranded-work check** (FR-020): the operator is
  warned, told what is held and which orders it affects, and must confirm.
- ⚠ **Access ends immediately; work is reclaimed eventually.** The identity account is disabled in the
  same operation, so no session can be obtained. Un-started work returns to the pool on the next sweep,
  and started work becomes *stranded* and needs a human. The screen must say this — implying a suspended
  driver is cleared of work when they are not is precisely the failure this feature exists to prevent.

## 8. Exception lifecycle

```
   (driver app records it) ──► outstanding ──► resolved (note + who + when)
```

Resolution is one-way. A resolved exception stays readable forever (FR-031) — it is never deleted, and
an exception whose order is later cancelled or refunded is not silently removed; the resolution note is
where that connection is recorded.
