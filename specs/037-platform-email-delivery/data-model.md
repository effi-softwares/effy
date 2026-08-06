# Phase 1 Data Model — 037 Platform Email Delivery

**One forward-only Goose migration.** Two new tables in `public`. **No column is added to
`public.customer`, `public.shop_staff` or `admin.staff`** — see [research.md](./research.md) R8 for
why the store is keyed by address rather than by person.

Scaffold with `make db-new name=email_delivery`; the file lands as
`db/migrations/<YYYYMMDDHHMMSS>_email_delivery.sql`. ⚠ Commit before `make db-up` — the 003 commit
guard refuses otherwise.

---

## `public.email_delivery_status` — the current conclusion, one row per address

The thing screens and operators read. One row per address the platform has ever had an outcome for.

| Column | Type | Constraints | Why |
| --- | --- | --- | --- |
| `address` | `citext` | **PK** | ⚠ `citext`, matching `public.customer.email`, because Cognito treats email as a case-insensitive sign-in alias and the join must agree. |
| `raw_address` | `text` | `NOT NULL` | ⚠ **The exact bytes SES reported.** The suppression-management API is case-sensitive: a delete that normalises case silently fails to remove an entry that demonstrably exists. This column is what the repair calls SES with. |
| `state` | `text` | `NOT NULL DEFAULT 'reachable'`, `CHECK (state IN ('reachable','soft_failing','undeliverable','complained'))` | The four-way conclusion. |
| `reason` | `text` | nullable | SES's `bounceType`/`bounceSubType` or `complaintFeedbackType`, as reported. |
| `diagnostic` | `text` | nullable | ⚠ The receiving server's own message. Stored because an operator needs it to decide whether a repair is worth attempting; **never logged** (it contains the address). |
| `last_event_at` | `timestamptz` | `NOT NULL` | When the outcome occurred (SES's timestamp, not ours). |
| `last_message_id` | `text` | nullable | The SES message id, so an operator can correlate with CloudWatch. |
| `bounce_count` | `integer` | `NOT NULL DEFAULT 0` | Repeat permanent failures. A second one after a repair means the repair did not hold. |
| `complaint_count` | `integer` | `NOT NULL DEFAULT 0` | Kept separate — a complaint is not a bounce (FR-031). |
| `repaired_at` | `timestamptz` | nullable | Set by the operator repair; cleared to `NULL` by any subsequent failure. |
| `repaired_by` | `text` | nullable | The operator's `cognito_sub`. The audit row is authoritative; this is for the detail view. |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |

**Indexes**: the primary key covers lookup by address. One partial index for the console's default
view — `CREATE INDEX email_delivery_status_attention_idx ON public.email_delivery_status
(last_event_at DESC) WHERE state <> 'reachable';` — because the list that matters is *"who is
currently broken"*, which is a small subset of a table that is itself small.

⚠ **No foreign key to any person table**, deliberately. An address may bounce before its account is
created, after it is deleted, or for an audience that has no platform record at all — the driver pool
exists and `public.driver` still does not. A foreign key would make those events unrecordable, which is
precisely the blindness this feature exists to end.

### State transitions

```
                    ┌──────────────────────── permanent bounce ─────────────────┐
                    │                                                            ▼
  (no row) ──send──▶ reachable ──transient bounce / delay──▶ soft_failing ──▶ undeliverable
                    ▲     │                                       │                 │
                    │     └────────── complaint ──▶ complained ◀──┘                 │
                    │                                   │                           │
                    └────── operator repair ────────────┴───────────────────────────┘
```

Rules:

- **`delivery` resets to `reachable`** and zeroes nothing else — the counts are history, the state is
  now. A successful delivery is the only evidence that an address works.
- **Only a *permanent* failure reaches `undeliverable`** (FR-029). Transient failures and delivery
  delays go to `soft_failing`, which is informational and gates nothing.
- **`complained` is terminal-ish but not blocking** (FR-031): it is recorded and surfaced, and it does
  **not** bar the person from signing in to their own account. ⚠ A complaint often means someone typed
  a stranger's address into sign-in; barring on it would lock out an account the stranger may
  legitimately own.
- **Operator repair returns any state to `reachable`** and stamps `repaired_at`/`repaired_by`.
- ⚠ **A later failure clears `repaired_at`.** A stale "repaired" stamp beside a broken address is the
  kind of half-truth that makes an operator stop trusting the screen.

---

## `public.email_delivery_event` — the append-only log

Every outcome SES reports, kept whether or not it changes the conclusion. This is what makes
"when did this start?" answerable.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK `DEFAULT gen_random_uuid()` |
| `address` | `citext` | `NOT NULL` |
| `raw_address` | `text` | `NOT NULL` |
| `event_type` | `text` | `NOT NULL`, `CHECK (event_type IN ('bounce','complaint','delivery','reject','delivery_delay'))` |
| `sub_type` | `text` | nullable — `Permanent`/`Transient` + SES's sub-type, or the complaint feedback type |
| `reason` | `text` | nullable |
| `message_id` | `text` | `NOT NULL` — SES's message id |
| `occurred_at` | `timestamptz` | `NOT NULL` — SES's timestamp |
| `received_at` | `timestamptz` | `NOT NULL DEFAULT now()` — ours |

**Idempotency (FR-028 in the spec's numbering — the "consumer must be idempotent" rule):**

```sql
CREATE UNIQUE INDEX email_delivery_event_idem_idx
    ON public.email_delivery_event (message_id, event_type, address);
```

The consumer inserts with `ON CONFLICT DO NOTHING` and **only updates the status row when the insert
actually inserted a row**. SES event publishing is explicitly at-least-once, unordered, and may
duplicate — so a redelivered bounce must not increment `bounce_count` twice.

⚠ **One message can legitimately produce several events** (`delivery_delay` then `bounce`, or
`delivery` then `complaint`), which is why the key is `(message_id, event_type, address)` and not
`message_id` alone.

**Index**: `CREATE INDEX email_delivery_event_address_idx ON public.email_delivery_event (address,
occurred_at DESC);` — the detail view's only query.

**Retention**: none in this slice. The table grows by one row per message and the platform sends
single-digit volumes per day. ⚠ Recorded as a carry-forward rather than solved prematurely: at real
volume this wants a retention policy, and the honest time to write one is when there is data to
measure.

---

## Ordering conclusion — how a person's state is derived

There is no per-person column. The console and the account read join:

```sql
-- the customer's own account read (edge-api/customer)
SELECT c.*, s.state, s.reason, s.last_event_at
  FROM public.customer c
  LEFT JOIN public.email_delivery_status s ON s.address = c.email
 WHERE c.cognito_sub = $1;
```

`public.customer.email` is `citext NOT NULL UNIQUE`, so this join is exact and indexed on both sides.

⚠ **The staff joins are weaker and this is stated rather than hidden**: `public.shop_staff.email` is
`text`, **nullable**, with **no unique constraint and no index**; `admin.staff.email` is `text NOT
NULL` with no index. The console therefore matches them with `lower(email) = lower($1)` — a sequential
scan over tables holding tens of rows, which is fine now and would not be at scale. **No index is
added here**: adding a functional index to two tables this feature does not otherwise touch is scope
creep, and the honest note is more useful than a speculative index. Carry-forward.

⚠ **The driver audience has no record to join to at all.** A driver's bounce is recorded against the
address and is visible in the console's address-first view; it simply cannot be attributed to a named
person, because the platform has never had a driver table. This is a pre-existing gap surfaced, not
created, by this feature.

---

## Shared contract delta — `packages/shared-types/src/customer.ts`

```ts
/** How reliably the platform can reach this account's email address. */
export type EmailDeliveryState =
  | "reachable"
  | "soft_failing"
  | "undeliverable"
  | "complained";

export interface CustomerDTO {
  // …existing fields unchanged…
  /**
   * Present only on the authenticated account read. ⚠ MUST NOT be exposed on any
   * unauthenticated surface: delivery state is only knowable for an address the
   * platform has emailed, so disclosing it answers "does this address have an
   * account?" — see plan.md § Spec Amendments (FR-030/FR-030a).
   */
  emailDelivery: EmailDeliveryState;
}
```

⚠ **Defaults to `"reachable"` when no row exists.** Absence of evidence is not evidence of failure, and
the overwhelmingly common case is an address that has simply never had an outcome recorded.

⚠ **`reason` and `diagnostic` are NOT in the DTO.** They are operator data. A receiving server's
rejection text is written for a postmaster, not a shopper, and putting it on an account page would be
noise at best and alarming at worst.

---

## What is deliberately NOT modelled

| Not built | Why |
| --- | --- |
| A per-person `email_delivery_status` column | R8 — three inconsistent email columns, and nowhere to put a driver |
| A foreign key to `customer`/`shop_staff`/`admin.staff` | Would make events unrecordable exactly when they matter most |
| A mirror of the SES suppression list | It is queryable on demand and would be a second source of truth that can disagree with the first — the same defect 027 avoided by counting redemptions instead of storing a counter |
| An `email_delivery_status` row created at sign-up | Rows appear on first outcome. A table of "reachable" rows for every account is a table that says nothing |
| Retention / archival | Nothing to measure yet; carry-forward |
| Suppression state cached in DynamoDB for the send path | R7 — the send path does not branch, so there is nothing to cache |
