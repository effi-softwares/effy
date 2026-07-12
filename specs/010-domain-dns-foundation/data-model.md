# Data Model — 010 Platform Domain & Per-Environment Namespaces

This slice stores **no application data** — no tables, no migration. Its "data model" is the
**namespace**: which zones exist, which records live in them, who owns each one, and what breaks if
one goes missing. Every record below is Terraform-owned; none is created by hand.

---

## E1 — Platform domain (`effyshopping.com`)

The registered name. Held at **GoDaddy** (registrar), authority **delegated to Route 53**.

| Attribute | Value |
|---|---|
| Registrar | GoDaddy — **outside Terraform**, outside AWS |
| Authority | the parent hosted zone in `infra/global/` |
| Reserved for | **production** (not deployed; the apex serves nothing) |
| Owned by | `infra/global/` — deliberately **not** an env root (research R1) |

**The out-of-code dependency (FR-024)**: control of this name rests on GoDaddy account credentials.
Terraform can rebuild every zone and record below it; it cannot recover the domain itself. This joins
the platform's other hand-maintained values in [infra/envs/README.md](../../infra/envs/README.md).

---

## E2 — Environment namespace (one per environment)

| Environment | Namespace | Zone owned by | Status |
|---|---|---|---|
| dev | `dev.effyshopping.com` | `infra/envs/dev` | **built by this slice** |
| qa | `qa.effyshopping.com` | `infra/envs/qa` | reserved — same module, one variable |
| staging | `staging.effyshopping.com` | `infra/envs/staging` | reserved |
| **prod** | `effyshopping.com` (the apex itself) | `infra/global/` | reserved, **nothing deployed** |

**The isolation invariant (FR-004)**: an environment may write **only inside its own zone**, plus
**exactly one** record in the parent — its own `NS` delegation. It writes nothing else in the parent
and nothing at all in a sibling's zone.

**The lifecycle invariant (FR-005)**: the delegation `NS` record lives in the **environment's**
Terraform state, not the parent's. So `terraform destroy` on an environment removes the delegation
and the zone it points to **in one operation**. A zone can never outlive its delegation → **no
dangling delegation, no subdomain takeover**. This is why the record is placed where it is; it is
the whole reason for the ownership split.

---

## E3 — Records in the **parent** zone (`effyshopping.com`)

| Record | Type | Owner | Purpose |
|---|---|---|---|
| `dev` | **NS** | `infra/envs/dev` ★ | delegates the dev namespace to its own zone |
| *(apex A/AAAA)* | — | — | **deliberately absent** — production is not deployed (FR-006, SC-009) |

★ The one record an env root writes outside its own zone. Everything else in the parent is
production's, and production does not exist yet.

---

## E4 — Records in the **dev** zone (`dev.effyshopping.com`)

The full inventory this slice creates. Nine records, three jobs.

### Addresses (the point of the slice)

| Record | Type | Points at | Purpose |
|---|---|---|---|
| `api` | **A** (alias) | the API Gateway regional custom domain | `edge-api.dev.effyshopping.com` → the shared cold-path API |
| `api` | **AAAA** (alias) | same | IPv6 |

An **alias** record, not a CNAME — it resolves to the gateway's regional target and costs nothing to
query. Because it is an alias, the endpoint behind it can be **destroyed and recreated** and the name
simply repoints (**FR-012 / SC-005**).

### Trust (proves the name)

| Record | Type | Purpose |
|---|---|---|
| `_<acm-token>` | **CNAME** | ACM DNS validation for `*.dev.effyshopping.com` |

**The renewal trap**: ACM renews the certificate automatically **only while this record still
resolves**. Delete it and nothing breaks — until the certificate silently fails to renew and the
endpoint goes untrusted at expiry. This is precisely why research **R9** puts a `DaysToExpiry < 30`
alarm on the certificate: it is the only thing that turns a silent, delayed, total failure into a
warning.

### Sending identity (proves the platform may send as the domain)

| Record | Type | Purpose |
|---|---|---|
| `<token1>._domainkey` | **CNAME** | Easy DKIM key 1 — signs outbound mail |
| `<token2>._domainkey` | **CNAME** | Easy DKIM key 2 (AWS rotates across three) |
| `<token3>._domainkey` | **CNAME** | Easy DKIM key 3 |
| `mail` | **MX** | custom MAIL FROM subdomain → `feedback-smtp.ap-southeast-2.amazonses.com` |
| `mail` | **TXT** | SPF: `v=spf1 include:amazonses.com ~all` |
| `_dmarc` | **TXT** | DMARC policy — **starts at `p=none`** (monitor, do not reject) |

**Why a custom MAIL FROM subdomain at all**: without it, the envelope sender is an
`amazonses.com` address, so **SPF aligns to Amazon's domain, not Effy's**. DKIM would still align, so
DMARC would pass — but on one leg instead of two. The MAIL FROM subdomain makes SPF align to
`dev.effyshopping.com` as well, which is what makes the mail look unambiguously legitimate to a
receiving system rather than merely acceptable. On a platform where the *only* credential is an
emailed code, "lands in the inbox" is a functional requirement, not deliverability polish.

**Why DMARC starts at `p=none`**: `p=reject` on day one means any misconfiguration silently
**destroys** sign-in mail platform-wide with no diagnostic. Start in monitor mode; tighten once the
DKIM/SPF alignment is observed working.

---

## E5 — Trust certificate

| Attribute | Value |
|---|---|
| Name | `*.dev.effyshopping.com` (wildcard — research R3) |
| Region | **`ap-southeast-2`** — must match the regional API Gateway it fronts (R2) |
| Validation | DNS, from records in the dev zone Terraform owns → fully automatic |
| Renewal | automatic, **conditional on the validation record surviving** (see E4) |
| Covers | `api.` today; `back-office.`, `shop.`, `core.` when those slices land — **no re-issue** |
| Does **not** cover | the apex; two-label names (`a.b.dev…`); anything behind CloudFront/Amplify (**needs a separate `us-east-1` certificate** — R2) |

---

## E6 — Sending identity

| Attribute | Value |
|---|---|
| Identity | the **domain** `dev.effyshopping.com` (not a single address) |
| Region | `ap-southeast-2` (same region as the Cognito pools) |
| From | `Effy <no-reply@dev.effyshopping.com>` |
| Used by | **all four** Cognito pools — customer, driver, shop, back-office |
| Reply-to | none — the platform cannot receive mail (FR-022) |
| Initial state | **SES sandbox**: 200/day, 1/sec, **verified recipients only** |

**Shared transport, not shared trust (Principle IV).** One identity serves all four pools. No issuer,
audience, claim, or authorizer is shared or changed — a token minted for one pool is still
structurally rejected by a service scoped to another. What is shared is the *envelope the code
arrives in*, which carries no authorization meaning.

**The severe failure mode.** If SES pauses sending — bounce rate > 5% or complaint rate > 0.1% —
then **no one on any of the four audiences can obtain a sign-in code, and therefore nobody can sign
in at all.** There is no password fallback anywhere on this platform by design. Hence the two SES
alarms in research R9; this is the highest-severity risk the slice introduces, and it is invisible
until it is total.

---

## E7 — Address contract (SSM)

The machine-readable answer to "where is this environment's API". Full definition in
[contracts/dns-and-address.contract.md](./contracts/dns-and-address.contract.md).

| Key | Before | After |
|---|---|---|
| `/effy/<env>/edge/api_endpoint` | `https://mbjuqrl5ui.execute-api…` | **`https://edge-api.dev.effyshopping.com`** |
| `/effy/<env>/edge/api_default_endpoint` | — | `https://mbjuqrl5ui.execute-api…` (**new** — the raw fallback, kept alive) |
| `/effy/<env>/edge/http_api_id` | unchanged | unchanged (services attach by id, not URL) |
| `/effy/<env>/edge/authorizer/<audience>_id` | unchanged | unchanged |

**The key is not renamed** — only its value improves. A rename is a breaking change to the 001
contract; a better value is picked up for free by every existing reader (the two web `.env` files,
two Makefile targets, `README.md`). That is how **SC-003** ("zero provider-generated hostnames in
client config") is met without touching a single consumer's code.

---

## State transitions

The namespace has exactly one interesting lifecycle, and its **order is not negotiable** — steps 3+
physically cannot succeed before step 2 (research **R6**):

```
1. parent zone created            (make global-apply)
        │  outputs 4 name-servers
        ▼
2. 🧑‍💻 GoDaddy NS repointed  ────────► WAIT: dig +short NS effyshopping.com
        │                                     must return the Route 53 name-servers
        ▼
3. dev zone + NS delegation       (make apply ENV=dev)
        ▼
4. ACM validation record ─► certificate ISSUED     ← needs public resolution of the dev zone
        ▼
5. custom domain + mapping + alias  →  edge-api.dev.effyshopping.com serves
        ▼
6. SES identity + DKIM/SPF/DMARC ─► domain VERIFIED ← needs public resolution of the dev zone
        ▼
7. Cognito pools → DEVELOPER sender   ⚠ ABORT IF ANY POOL WOULD BE REPLACED
        ▼
8. 🧑‍💻 SES production access (support request, ~24h) — file EARLY, it gates SC-010
```

**Teardown** is the exact reverse and is safe: destroying the dev environment removes its zone **and**
its delegation record from the parent together (E2), leaving the parent clean and the platform domain
intact.
