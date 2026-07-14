# Data Model — 011 Customer Storefront Web

**Phase 1 output.** One new table. **No commerce entities are designed here** — catalog, cart, order
and payment are deliberately *not* pre-shaped, so the slice that builds them is not boxed in by guesses
made today (spec § Assumptions).

## E1 — `public.customer`

The platform's own record of a customer — **distinct from their Cognito credential**, and the authority
on their standing with Effy (FR-023, FR-025).

It is the platform's **first record of a person who is not an Effy employee**. It lives in `public`
(the operational schema, beside `shop`), **not** `admin` — whose designated purpose is back-office
accounts and audit.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | The platform's own identifier. |
| `cognito_sub` | `text` **UNIQUE NOT NULL** | The join key. **Survives account linking** — see below. |
| `email` | `citext` **UNIQUE NOT NULL** | The verified email. `citext` because email is case-insensitive in practice and `username_attributes = ["email"]` treats it so. |
| `display_name` | `text` NULL | Customer-maintainable (FR-026). Nullable: the OTP route never asks for it. |
| `status` | `text NOT NULL DEFAULT 'active'` | `CHECK (status IN ('active','barred'))`. **Platform-owned.** |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

```sql
CREATE TABLE public.customer (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub   text        NOT NULL UNIQUE,
  email         citext      NOT NULL UNIQUE,
  display_name  text,
  status        text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','barred')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

Forward-only, per constitution (Goose; no down migration relied upon).

### Why `cognito_sub` is the key, and why that is safe

FR-011 requires that a person who registers by one route and returns by another is **one customer**.
That guarantee rests on a specific Cognito behaviour (research **D16**):

> After a federated identity is linked into a native profile, "the user's JWTs always carry the **same
> `sub`** regardless of how they sign in."

So the key holds across all three credential routes — **but only if the native profile is always the
link destination**. If Cognito is allowed to auto-create a `Google_…` profile first, that person has
**two profiles, two `sub`s, and there is no retroactive merge** (linking requires the federated user to
not yet exist). The pre-sign-up trigger exists to make that impossible; the schema simply trusts it.

**Keying on `email` instead was rejected**: a signed-in user who can change their own email would then
be able to walk onto another customer's record. Email is a *lookup*, never the identity.

### Status is platform-owned (FR-025)

`status` is written **only** by the platform, never from token data. A **barred** customer holding a
perfectly valid, unexpired credential is **refused** — the record decides, the claim never overrides it
(SC-011). This is the same claim-as-origin / record-as-authority rule that 005/007/009 established for
staff, applied to the first non-employee audience.

The customer pool defines **no RBAC groups**, so there is no role column and none is coming. That is
deliberate on two counts: Principle IV assigns groups only to the admin and shop pools, and a lean token
is also a **cookie-size safety measure** — id + access + refresh tokens already total ≈4.5 KB against a
~4 KB browser limit, and a fattened claim set would silently truncate the session cookie (research
**D21**).

### E2 — Idempotent JIT upsert (FR-024)

The record is created **the first time the customer appears** with a valid token, and reused forever
after — the same Cognito-first→DB pattern as 006/007/009.

```sql
INSERT INTO public.customer (cognito_sub, email, display_name)
VALUES ($1, $2, $3)
ON CONFLICT (cognito_sub) DO UPDATE
  SET email      = EXCLUDED.email,   -- the verified email can legitimately change at the IdP
      updated_at = now()
RETURNING id, cognito_sub, email, display_name, status, created_at, updated_at;
```

`ON CONFLICT` makes it **safe under concurrent sign-ins** (SC-007, SC-010) — two simultaneous first
requests produce one row, not a duplicate or a crash.

⚠ **`status` is deliberately absent from the `DO UPDATE` set.** A barred customer signing in again must
**not** be silently reset to active by their own sign-in. This is the single most important line in the
migration and it is easy to get wrong by writing a lazy `SET (email, status) = …`.

## Non-entities (explicitly not modelled)

- **Deferred intent** (spec Key Entities) is **not a table.** It is a validated, same-origin relative
  path carried in a `next` query parameter and resolved in-process. Persisting it would be a needless
  attack surface for zero benefit.
- **Credential route** is **not a table.** It is a property of Cognito's profile (`identities` claim),
  not of Effy's record. The platform stores *who* someone is, not *how they got in*.
- **Cart / order / product** — out of scope (spec § Out of Scope).

## Relationships

None yet. `public.customer` is a root record with no foreign keys in either direction. The catalog and
cart slices will add `cart.customer_id → customer.id`; the shape of that is theirs to decide, not ours
to pre-empt.
