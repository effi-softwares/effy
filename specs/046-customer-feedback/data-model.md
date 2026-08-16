# Data Model: Customer Feedback (046)

One forward-only Goose migration (`<ts>_customer_feedback.sql`) adds three `public`-schema tables. Raw
SQL, no ORM (Principle VI). Rows are mapped explicitly to domain models in each repository; wire shapes
never leak past the data layer.

## Entities

### `public.feedback_submission`

One thing a shopper told Effy. The context half is **immutable once written** (spec FR-040); only
`status` mutates on this row.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `reference_code` | `text` UNIQUE NOT NULL | opaque short code (`FB-XXXXXX`), shown to shopper + in emails (research D10) |
| `category` | `text` NOT NULL | CHECK ∈ (`bug`,`suggestion`,`complaint`,`compliment`,`other`) (D3) |
| `message` | `text` NOT NULL | CHECK `length(btrim(message)) BETWEEN 1 AND <MAX>`; stored raw, rendered inert everywhere |
| `rating` | `smallint` NULL | CHECK `rating BETWEEN 1 AND 5`; optional |
| `submitter_name` | `text` NULL | optional; for a signed-in customer, snapshot of profile name |
| `submitter_email` | `citext` NULL | optional; **unverified** for guests; drives whether a reply/thank-you is possible |
| `email_verified` | `boolean` NOT NULL DEFAULT false | true only when set from an authenticated customer profile |
| `customer_id` | `uuid` NULL → `public.customer(id)` | linked ONLY via the authenticated route; NULL = guest |
| `source` | `text` NOT NULL | CHECK ∈ (`checkout`,`general`,`other`); origin context (FR-011) |
| `platform` | `text` NOT NULL | CHECK ∈ (`web`,`ios`,`android`) |
| `status` | `text` NOT NULL DEFAULT `'new'` | CHECK ∈ (`new`,`in_review`,`replied`,`resolved`,`archived`,`spam`) (D3) |
| `source_key` | `text` NULL | hash of the rate-limit source (sub or IP); NOT the raw IP (PII) — for the cooldown window only (D5) |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | bumps on status change |

**Indexes**: PK; UNIQUE(`reference_code`); an index on `created_at DESC` (default newest-first list);
an index supporting `status`/`category` filtering; a `pg_trgm` GIN index on `message` (and/or a
`tsvector`) for full-text search (FR-019); an index on (`source_key`, `created_at`) for the rate-limit
window (D5). ⚠ `submitter_email` is searchable (FR-019) — a plain btree on `citext` suffices for
exact/prefix email search.

**Validation rules** (enforced in SQL where possible, in the service otherwise):
- `message` non-empty after trim, ≤ max length (FR-006/FR-007) — CHECK.
- `submitter_email`, when present, passes shared `EMAIL_SHAPE` + `EMAIL_MAX_LENGTH` — service layer
  (the shape regex is not in the DB).
- `customer_id` and `email_verified=true` are set **only** by the authenticated submit path (D2).

### `public.feedback_reply`

A message Effy sent back to the submitter. Append-only; multiple per submission (FR-031).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `submission_id` | `uuid` NOT NULL → `feedback_submission(id)` ON DELETE CASCADE | |
| `body` | `text` NOT NULL | CHECK length 1..<MAX>; stored raw, rendered inert (FR-034) |
| `staff_sub` | `text` NOT NULL | the replying back-office `sub` (no cross-schema FK — D4) |
| `staff_name` | `text` NULL | snapshot of the staff display name at send time |
| `sent_at` | `timestamptz` NOT NULL DEFAULT `now()` | recorded only on successful send |
| `delivery_ok` | `boolean` NOT NULL DEFAULT true | a reply row exists only when the email send succeeded (FR-030); false reserved for future partial states |

**Index**: (`submission_id`, `sent_at`) for the per-submission history view.

**Rule**: a reply row is written **only after** the `feedback-reply` email send succeeds; the same
transaction sets the parent submission `status = 'replied'` (FR-029). A send failure writes nothing and
does not change status (FR-030).

### `public.feedback_note`

A staff-only annotation. Never leaves the console; never in any email (FR-024/FR-038).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `submission_id` | `uuid` NOT NULL → `feedback_submission(id)` ON DELETE CASCADE | |
| `body` | `text` NOT NULL | CHECK length 1..<MAX>; rendered inert |
| `staff_sub` | `text` NOT NULL | author |
| `staff_name` | `text` NULL | snapshot |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

**Index**: (`submission_id`, `created_at`).

## Relationships

```
public.customer (0..1) ──< feedback_submission (0..*)      -- nullable link; guests have none
feedback_submission (1) ──< feedback_reply (0..*)          -- staff replies, append-only
feedback_submission (1) ──< feedback_note  (0..*)          -- staff notes, append-only
admin.staff  ⋯ (by sub string, NOT a FK) ⋯ reply.staff_sub / note.staff_sub
```

## State transitions (`feedback_submission.status`)

```
                 ┌─────────────► spam        (staff; hides from default view, keeps evidence)
   new ──► in_review ──► replied ──► resolved
    │          │            │            │
    └──────────┴────────────┴────────────┴──► archived   (staff; any state may be archived)
```

- `new` → set on insert.
- Any staff-set transition among {`new`,`in_review`,`resolved`,`archived`,`spam`} is allowed (triage
  is non-linear); the console offers the sensible set per current state.
- `replied` is **system-set** when a reply email succeeds (not directly selectable), and a submission
  may be replied to more than once while remaining `replied`/`resolved`.

## Retention & privacy

- Submissions are retained so staff can read/act on them (FR-040). `submitter_email` is PII →
  never logged (FR-039); `source_key` stores a hash, never the raw IP.
- Immutable context vs mutable staff-owned fields: the migration comment records which columns may
  change (`status`, and the child `reply`/`note` rows) and which never do (category, message, rating,
  submitter identity as recorded, source, platform, `customer_id`, `email_verified`).
