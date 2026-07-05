# Effy API Error Envelope (RFC 9457 Problem Details)

**Binding on**: every failure response from `core-api` and `edge-api`, all versions.
This file is the cross-backend single source of truth (constitution Principle II);
each service enforces it with conformance tests. Origin: specs/004-backend-bootstrap
(research decision A6).

## Media type

`Content-Type: application/problem+json` on every response with status ≥ 400.

## Shape

```json
{
  "type": "https://effyshopping.com/problems/validation-failed",
  "title": "Request validation failed",
  "status": 400,
  "detail": "body.name must be a non-empty string",
  "instance": "/v1/back-office/ping",
  "request_id": "6a1f9c2e-…",
  "errors": [ { "field": "name", "message": "must be a non-empty string" } ]
}
```

- `type`, `title`, `status`, `instance`, `request_id` — always present.
- `detail` — present when it adds information; **never** stack traces, SQL, dependency
  hostnames, or library error strings.
- `errors[]` — only on `validation-failed`.
- The envelope is **version-neutral**: identical shape under `/v1`, `/v2`, and future
  versions (a v1-only client parses errors from any era).

## Type vocabulary (initial)

| Slug (`…/problems/<slug>`) | Status | Used when |
|---|---|---|
| `validation-failed` | 400 | malformed JSON, wrong types, failed field validation |
| `unauthenticated` | 401 | missing/expired/tampered/wrong-audience credential — deliberately **one** type for all four (no oracle: the response never reveals which check failed) |
| `forbidden` | 403 | authenticated but lacking the required group/role |
| `no-route` | 404 | unknown path — including a **never-existed API version** (`/v3/...`) |
| `method-not-allowed` | 405 | known path, wrong method |
| `version-retired` | 410 | a retired API version (policy-bound; none exist yet) — body names the successor; response also carries `Deprecation`/`Sunset` headers |
| `rate-limited` | 429 | reserved (no limiter this slice) |
| `internal` | 500 | any unexpected error/panic — generic detail; the real cause is only in the service log, joined by `request_id` |
| `unavailable` | 503 | a dependency (database) is down and the request cannot be served |

Adding a slug is **additive** (allowed anytime, documented in `docs/api/`); changing the
meaning or status of an existing slug is **breaking** (versioning policy applies).

## Status-code semantics

- 401 vs 403: 401 = "we don't know who you are (here)" — includes cross-pool tokens;
  403 = "we know who you are; you may not do this".
- 404 vs 410: 404 = never existed (typo'd path, unknown version); 410 = existed and was
  deliberately retired.
- 5xx never leaks internals; every 5xx has a correlated log record.

## Conformance (each service must prove)

1. Every non-2xx response parses as this shape with a vocabulary `type`.
2. `request_id` in the body equals the `X-Request-ID` response header and the log
   record's id.
3. A forced panic/unhandled rejection produces `internal` with no stack trace in the
   body.
4. An invalid credential and a valid-but-wrong-pool credential produce **byte-identical
   `type`/`title`** (`unauthenticated`).
