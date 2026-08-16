# Contract: Feedback API (046)

Cold path. Two services. Paths follow the `/<service>/v1/...` scheme. DTOs live in
`@effy/shared-types` (`feedback.ts`) so the clients and services share one shape (Principle II).

## Customer service — `apis/edge-api/customer` (submission)

### `POST /customer/v1/feedback` — authenticated (customer authorizer)

Signed-in shopper. The verified `sub` resolves to `customer.id`; the trusted profile email is used.

Request body:
```jsonc
{
  "category": "bug" | "suggestion" | "complaint" | "compliment" | "other",
  "message": "string (1..MAX, required, non-empty after trim)",
  "rating":  1 | 2 | 3 | 4 | 5,          // optional
  "source":  "checkout" | "general" | "other",
  "platform":"web" | "ios" | "android",
  "name":    "string?",                    // optional override; profile name used if omitted
  "wantsReply": true                        // optional; email is taken from the verified profile
}
```
Behaviour: links `customer_id`, sets `email_verified=true`, `submitter_email` = profile email. Sends
`feedback-received` when an email is available. Rate-limited per `sub` (D5).

### `POST /customer/v1/feedback/public` — public (no authorizer)

Guest. Email/name are **unverified** and used only to send the acknowledgement/reply.

Request body: as above, plus:
```jsonc
{ "email": "string?", "name": "string?" }   // email optional; validated with EMAIL_SHAPE/EMAIL_MAX_LENGTH
```
Behaviour: `customer_id` NULL, `email_verified=false`. Rate-limited per `source_ip`
(`requestContext.http.sourceIp`, hashed into `source_key`).

### Shared response (both routes)

```jsonc
// 201
{ "status": "ok", "referenceCode": "FB-XXXXXX" }
// 400 — validation
{ "status": "invalid", "field": "message" | "email" | "category" | ... }
// 429 — rate limited (threshold NOT disclosed)
{ "status": "rate_limited" }
// 500 — stored-but-email-failed is NOT surfaced as failure on the authed/thank-you path:
//        the submission persists and returns ok (FR-015). Only a store failure returns error.
{ "status": "error" }
```

**Invariants**: message required/bounded (FR-006/007); email validated when present (FR-008); text
stored raw, never interpreted (FR-017); thank-you send failure never loses the submission (FR-015);
uniform success shape reveals nothing about account existence (FR-010).

## Admin service — `apis/edge-api/admin` (console)

All routes behind the **back-office authorizer**; RBAC from `admin.staff` (research D7). Fail-closed →
503 on authz error.

### `GET /admin/v1/feedback` — list/search/filter (any active staff incl. csa)

Query params: `q` (text over message + email), `category`, `status`, `rating`, `from`, `to` (date
range), `cursor`/`page`, `limit`. All combinable (FR-020). Returns newest-first, paginated, with a
total/count.
```jsonc
{
  "items": [{
    "referenceCode": "FB-XXXXXX", "category": "...", "status": "...", "rating": 3|null,
    "submitter": { "kind": "customer" | "guest", "name": "?", "email": "?" },
    "preview": "first ~140 chars of message", "source": "...", "platform": "...",
    "hasEmail": true, "createdAt": "ISO"
  }],
  "total": 123, "nextCursor": "?"
}
```

### `GET /admin/v1/feedback/{referenceCode}` — detail (any active staff)

Full message + all context + replies + notes.
```jsonc
{
  "referenceCode": "...", "category": "...", "status": "...", "rating": 3|null,
  "message": "full text", "submitter": { "kind": "...", "name": "?", "email": "?", "emailVerified": bool },
  "source": "...", "platform": "...", "createdAt": "ISO", "updatedAt": "ISO",
  "canReply": true,                       // false when no submitter email
  "replies": [{ "body": "...", "staffName": "?", "sentAt": "ISO" }],
  "notes":   [{ "body": "...", "staffName": "?", "createdAt": "ISO" }]
}
```

### `POST /admin/v1/feedback/{referenceCode}/status` — (any active staff)
```jsonc
{ "status": "in_review" | "resolved" | "archived" | "spam" | "new" }
```
`replied` is not directly settable (system-set on reply). Persists + reflected in list/filters.

### `POST /admin/v1/feedback/{referenceCode}/notes` — (any active staff)
```jsonc
{ "body": "string (1..MAX)" }
```
Records author `sub`/name + timestamp. Never emailed, never shown to the submitter.

### `POST /admin/v1/feedback/{referenceCode}/reply` — (admin | manager only)
```jsonc
{ "body": "string (1..MAX)" }
```
Requires a submitter email (else 409 `no_reply_address`). Sends `feedback-reply`; **only on send
success** writes the reply row + sets `status='replied'` (FR-029/030). A send failure → 502
`reply_send_failed`, no row, no status change. A caller without admin/manager → 403.

## Config contract test

Each edge service adds a `config.contract.test.ts` that reads the real `serverless.yml` and asserts
every env key the service reads (incl. `email-kit`'s `MAIL_ENV_KEYS`) is declared — the 035/038 guard
against the "handler reads an undeclared env var; every unit test passes because it sets the var
itself" defect.
