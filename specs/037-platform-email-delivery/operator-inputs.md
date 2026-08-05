# Operator-supplied inputs — 037 Platform Email Delivery

Values that **cannot be derived** and must be supplied by the operator (spec FR-025), plus records
already published by hand that must be **adopted** rather than re-declared (spec FR-024).

⚠ Nothing in this file is secret. A DKIM *public* key and a domain-ownership token are both published
in public DNS by design — that is their entire purpose. Safe to commit.

---

## 1. Mail-service signing key (DKIM) — supplied 2026-08-05

Generated in the Google Workspace admin console
(*Apps → Google Workspace → Gmail → Authenticate email*), selector `google`, 2048-bit.

| Field | Value |
| --- | --- |
| Record name | `google._domainkey.effyshopping.com` |
| Type | `TXT` |
| Selector | `google` |
| Key length | 2048-bit RSA — **verified**: parses as a valid `RSA Public-Key: (2048 bit)` |
| Value length | **410 characters** |

```
v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkyRkUetpWtK7H8qnKdNnYWr9SclhBrpQUKYJJvnTYBcyIheFiSUg5iuO/70BcgDB/4MlZOQDSwkbSh5jy+Zgo/FlMLo1HVbWIwq6zLnFzKNKvTFaMUB+v9vyX4/QX5k7XVNvgm8VxB+Mb6m3XwM3djRATn+eJz2ppb/TyfhyfbbhAdFncGDlri3DpJN001YscPvvVJdkCoWDj3SXeeF6fFAO4ByCv4IHcpLOJCSAbjE5dqHaGm4n5s6JcqPiHIFMHQgFVr45E8FiJG+xpZxS0fR6SzPdDL9ta8eZEBhRE3yDSlrcu4KFTIGkXDxj9jjcetk33RheGAoxxMqaxzbg9QIDAQAB
```

### ⚠ Implementation constraint — this value MUST be split

A single character-string inside a DNS `TXT` record is capped at **255 characters** (RFC 1035
§3.3.14). This value is **410**, so it must be published as **two adjacent quoted strings inside one
record**, which resolvers concatenate back into one value:

```
"v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOC…<first 255 chars>" "…<remaining 155 chars>…IDAQAB"
```

Pasting the raw 410-character value into a console or a naive Terraform string fails with a length
error, and — worse — **splitting it at the wrong boundary or inserting whitespace between the chunks
silently corrupts the key**, so signature verification fails while DNS looks fine. The split must fall
on an exact character boundary with no added characters.

The plan MUST assert the reassembled value equals the original, byte for byte.

### ⚠ Ordering — do NOT activate before the record resolves

The operator must **not** click **Start authentication** in the Workspace console until the record is
live and resolving. Google verifies DNS at that moment; clicking early fails and must be retried.

Sequence: publish (Terraform apply) → confirm `dig +short TXT google._domainkey.effyshopping.com`
returns the reassembled value → *then* click Start authentication in Workspace.

---

## 2. Domain-ownership proof — already published by hand

| Field | Value |
| --- | --- |
| Record name | `effyshopping.com` |
| Type | `TXT` |
| Value | `google-site-verification=5sG_ebnLikgdvMrA5l0szjm7yUM_be34osIkkk2z-3E` |

Published in the console, **not** in the platform's definitions. Must be **imported** (FR-024).

⚠ This record and the future sender-authorisation (SPF) record share the same name and type. Route 53
holds one record set per (name, type), so they are **two strings in one record set**, never two record
sets. Declaring them separately would collide.

---

## 3. Inbound mail route — already published by hand

| Field | Value |
| --- | --- |
| Record name | `effyshopping.com` |
| Type | `MX` |
| Value | `1 SMTP.GOOGLE.COM.` |

Google Workspace's current single-record format (replaced the five `ASPMX.L.GOOGLE.COM` records in
2023). Resolving and working — `hello@effyshopping.com` (an alias on
`workspace-admin@effyshopping.com`) receives mail today.

⚠ Published in the console, **not** in the platform's definitions. Must be **imported** (FR-024), and
inbound MUST be confirmed working before and after every change to this zone (SC-022). This is the one
record in the feature that is already load-bearing in production use.

---

## 4. Still outstanding from the operator

- **Nothing blocking.** All values needed to write the plan are now in hand.
- Post-apply, operator-run: click **Start authentication** in the Workspace console (§1), then confirm
  a message sent *from* `hello@` passes authentication at Gmail and Outlook (SC-009a).

---

## Zone facts (measured 2026-08-05, for the import work)

| Zone | Id |
| --- | --- |
| `effyshopping.com` | `Z0506267W447QBDSL13U` |
| `dev.effyshopping.com` | delegated child, `NS` record present in parent |

Records currently in the parent zone: `SOA`, `NS`, `MX`, `TXT` (ownership proof), and the
`dev.effyshopping.com` `NS` delegation. **No `A`, no SPF, no `_dmarc`, no `google._domainkey`.**
