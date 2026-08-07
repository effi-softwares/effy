# Data Model: Customer Home Redesign (039)

Only ONE new table. No change to any storefront/catalogue table (the visual redesign is read-only over
existing data).

## `public.newsletter_subscriber`

A person's standalone interest in Effy updates. **Deliberately separate from `public.customer`** (research
R8): no foreign key, no `cognito_sub`. Keyed on the normalised email.

| Column          | Type          | Notes                                                                                 |
|-----------------|---------------|---------------------------------------------------------------------------------------|
| `id`            | `uuid` PK     | `gen_random_uuid()`                                                                    |
| `email`         | `citext`      | **UNIQUE**, case-insensitive. Normalised (trimmed, lowercased) before write.          |
| `status`        | `text`        | `CHECK (status IN ('pending','confirmed','unsubscribed'))`, default `'pending'`.       |
| `confirm_token_hash` | `text` NULL | Hash (not plaintext) of the single-use double-opt-in token. NULL once confirmed/expired. |
| `confirm_sent_at`   | `timestamptz` NULL | When the last confirmation email was sent — drives the resend cooldown / hourly cap. |
| `confirmed_at`  | `timestamptz` NULL | Set when the opt-in link is followed. NULL while pending.                          |
| `created_at`    | `timestamptz` | `now()`.                                                                               |
| `updated_at`    | `timestamptz` | `now()`, bumped on every write.                                                        |

**Indexes**: unique on `email` (from the constraint). No other index needed at this scale.

**State transitions**:

```
(new email)  ──subscribe──▶  pending  ──confirm(valid token)──▶  confirmed
pending      ──resubscribe (within cooldown)──▶  pending (no new email, no token rotation)
pending      ──resubscribe (after cooldown)──▶  pending (rotate token, resend email)
confirmed    ──resubscribe──▶  confirmed (idempotent no-op; no email)
any          ──unsubscribe (future slice)──▶  unsubscribed
```

**Timing constants** (pinned 2026-08-07 by the analyze pass — they were referenced by three tasks and
declared nowhere, so the tests asserting them could not be written):

| Constant | Value | Why |
|---|---|---|
| **Confirm-token TTL** | **24 hours** | Long enough to survive an email that lands overnight or in a spam folder checked the next morning; short enough that a link leaked from an inbox is not indefinitely live. Checked against `confirm_sent_at`. |
| **Resend cooldown** | **1 hour** | The window inside which a repeat submission rotates nothing and sends nothing (FR-035). Long enough to defeat a submit-loop, short enough that someone who genuinely lost the first email can retry within a sitting. |

Both are read from environment (declared in `serverless.yml`, covered by the config-contract test) with
these as the defaults, so neither is a literal buried in a query.

**Validation rules** (enforced in the service, not just the DB):
- `email` MUST pass a syntactic email check and length bound before any DB or email work (FR-030).
- Subscribe is **idempotent** on `email` (FR-032): `INSERT … ON CONFLICT (email) DO UPDATE` that only
  rotates the token / resends when `status='pending'` AND `confirm_sent_at` is older than the cooldown.
  ⚠ The predicate is keyed on **`confirm_sent_at`, never `updated_at`** — the latter bumps on every write
  including the no-op upsert a repeat submission performs, so a window keyed on it would reset itself on
  each attempt and cap nothing. (research R4 said `updated_at` and was corrected.)
- Confirm requires a token that hashes to the stored `confirm_token_hash` AND `status='pending'` AND the
  token is within its TTL (checked via `confirm_sent_at`). On success: `status='confirmed'`,
  `confirmed_at=now()`, `confirm_token_hash=NULL`. An invalid/expired/used token → a clear "link expired"
  result, never an error that discloses whether the address exists.

**Non-enumeration**: the subscribe endpoint returns the **same** result for new / pending / confirmed
inputs (FR-032). Only the confirm endpoint distinguishes states, and only for the token holder.

**Migration**: one forward-only Goose file `db/migrations/<timestamp>_newsletter_subscriber.sql`
(`+goose Up` creates the table + `citext` extension guard `CREATE EXTENSION IF NOT EXISTS citext`;
`+goose Down` drops the table — dev-only single-step down per 003). Committed before `make db-up`
(003 commit-guard).

## Reused (not defined here)

- `StorefrontHomeDTO` (banners + rails), `StorefrontCategoryDTO`, `StorefrontProductCardDTO`,
  `BannerDTO` / `BannerTarget`, `PromotionDTO` — all existing in `@effy/shared-types`, consumed unchanged.
