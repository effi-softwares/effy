# Contract: Newsletter Subscribe API (039)

Cold-path, **public** (no authorizer), on the `edge-customer` service. Shapes live in
`@effy/shared-types/src/newsletter.ts` (SSOT, Principle II) and are consumed by both the web Server Action
and the edge handlers.

## Types (`@effy/shared-types`)

```ts
export interface NewsletterSubscribeRequest {
  email: string;
}

/**
 * Uniform, non-enumerating result surface. `ok` covers new AND already-known emails (FR-032).
 *
 * ⚠ THREE variants, not two. `error` was missing from the first draft of this contract while two tasks
 * (T078, T080) already depended on it — a backend failure has to be representable, or FR-033's
 * "friendly, retryable error" has no value to render and the telemetry outcome has nothing to report.
 * There is deliberately NO `already` variant: that is the enumeration oracle FR-032 forbids, and the
 * spec's FR-033 was amended to three states to match.
 */
export type NewsletterSubscribeResult =
  | { status: "ok" }        // recorded (or already recorded); a confirmation email may have been sent
  | { status: "invalid" }   // syntactic validation failed; no record, no email
  | { status: "error" };    // the subscribe path failed; the visitor may retry, input preserved

export interface NewsletterConfirmResult {
  status: "confirmed" | "expired"; // expired covers invalid/used/expired tokens alike (no disclosure)
}
```

## `POST /customer/v1/newsletter`  — subscribe (public)

- **Request**: `{ "email": "person@example.com" }`
- **Behaviour**: validate → normalise → idempotent upsert (pending) → send confirmation email via
  `@effy/email-kit` `newsletter-confirmation` (only when new or cooldown-elapsed) → **always** the same
  success surface.
- **Responses**:
  - `202 { "status": "ok" }` — for new, already-pending, and already-confirmed emails alike (FR-032).
  - `400 { "status": "invalid" }` — syntactic validation failure only.
  - `5xx` → the web layer renders `{ "status": "error" }`. The endpoint itself never returns an `error`
    body; the variant exists so the Server Action can represent a call that did not complete.
- **No `429`.** ⚠ The first draft of this contract specified one, for a per-route gateway throttle that
  **cannot be built here** — HTTP API throttling is a Terraform-owned *stage* property (see research R4
  and the FR-035 amendment). Abuse resistance is the per-address cooldown, which is invisible to the
  caller **by design**: a submission inside the cooldown returns the same `202 { "status": "ok" }` as any
  other, having sent nothing. A distinct 429 would have been a weaker enumeration oracle in its own right.
- **Never**: reveal whether the email already exists, or whether it belongs to a customer account.

## `GET /customer/v1/newsletter/confirm?token=<t>` — confirm (public)

- **Behaviour**: hash `token`, match a `pending` row within TTL → `confirmed`; else `expired`.
- **Responses**: `200 { "status": "confirmed" }` | `200 { "status": "expired" }`.
  (The web `/newsletter/confirm` page calls this server-side and renders the friendly outcome; the raw API
  never needs to render HTML.)

## Web integration

- `app/(shop)/newsletter/actions.ts` — a **Server Action** invoked by the `NewsletterForm` plain `<form>`.
  It re-validates, calls `POST /customer/v1/newsletter` via the existing edge client, and returns the
  result for server-side rendering of the success/already/invalid/error state (no client fetch).
- `app/(shop)/newsletter/confirm/page.tsx` — a **server component** public page. Reads `?token=`, calls the
  confirm endpoint server-side, renders "You're subscribed" or "This link has expired" with a link back to
  the store. Zero client JS. **Added to `bundle-budget.mjs`'s measured route list.**
- The confirmation email's link base is the existing site-URL config; the sender/reply-to come from the
  existing `/effy/<env>/ses/*` SSM contract. No new identifier.

## Config-contract test (035/038 lesson)

A test in `edge-customer` asserts the real `serverless.yml` declares every env key the newsletter service
reads (reusing email-kit's exported `MAIL_ENV_KEYS` plus any new key), so a route cannot silently resolve
"unknown" and send nothing — the failure mode 035/038 hit repeatedly.
