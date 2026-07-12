# Research — 010 Platform Domain & Per-Environment Namespaces

Phase 0 decisions. Each resolves an unknown in [plan.md](./plan.md) § Technical Context. The
operator's technology directives are in [operator-directives.md](./operator-directives.md).

---

## R1 — Where does the *parent* hosted zone live? (the load-bearing decision)

**Decision**: A **new Terraform root, `infra/global/`**, owns the parent zone for
`effyshopping.com`. Each environment root creates **its own child zone** and writes **its own
delegation record** into the parent, which it finds by name with a `data` lookup — not by importing
another root's state.

**Rationale**: The parent zone is a **platform asset, not development's**. Every env root today is a
complete, independently destroyable unit — `make destroy ENV=dev` is a supported, expected
operation, and the 2026-07-12 region relocation actually did it. If `infra/envs/dev` owned
`effyshopping.com`, then destroying dev would destroy the platform's apex zone — taking with it
production's future delegation, every record under it, and (because a re-created zone gets **new
name-servers**) requiring a fresh registrar repoint at GoDaddy to recover. That is a catastrophic
blast radius attached to a routine dev command. A separate root makes it structurally impossible.

The child-writes-its-own-delegation pattern is what satisfies **FR-005** (no dangling delegation)
for free: the `NS` record in the parent is *in the env's state*, so `terraform destroy` on the env
removes the delegation in the same operation that removes the zone it points to. A namespace can
never outlive its delegation, which is exactly the subdomain-takeover hole the spec's edge case
names.

**Alternatives rejected**:

- *Parent zone in the dev root, guarded by `prevent_destroy`.* Encodes the wrong ownership, and
  `prevent_destroy` merely converts the catastrophe into a failed destroy that blocks the env
  teardown the team actually relies on.
- *Parent root also writes each child's delegation record.* Creates a cross-root dependency in the
  wrong direction (the parent would need to know every env that exists) and re-opens the dangling
  delegation hole, since destroying an env would leave the parent's `NS` record behind.
- *Reuse `infra/bootstrap/`.* That root has **local state** by design (it creates the state bucket —
  the chicken-and-egg). DNS belongs in remote state like everything else.

**Consequence**: the Makefile's `ENV=dev|qa|staging|prod` workflow does not fit a root that is not
an environment (`infra/envs/_shared` validates `env ∈ {dev,qa,staging,prod}`). `infra/global/` gets
its own three targets (`global-init` / `global-plan` / `global-apply`) and joins `TF_ROOTS` so
`make lint` validates it.

---

## R2 — "A hosted zone in Sydney" does not exist

**Decision**: Hosted zones are created **without a region**. The region-sensitive resource in this
slice is the **ACM certificate**, and it must be issued in **`ap-southeast-2`** — the region of the
API Gateway it fronts.

**Rationale**: Route 53 is a global service; a hosted zone has no region and its record data is
served from a global anycast fleet. The operator's phrasing ("hostedzone in sydney") reflects a
common and reasonable misconception, and it matters because the *neighbouring* resource genuinely
**is** regional and gets it wrong in the opposite direction:

| Resource | Regional? | Where it must live |
|---|---|---|
| Route 53 hosted zone | **No** — global | anywhere; region is not a property |
| ACM cert for a **regional** API Gateway custom domain | **Yes** | **same region as the API** → `ap-southeast-2` |
| ACM cert for anything behind **CloudFront** (incl. **Amplify Hosting**) | **Yes** | **`us-east-1` only**, regardless of where the platform lives |

**Consequence for this slice**: only the `ap-southeast-2` certificate is created — the frontends are
not hosted (FR-016), so nothing is behind CloudFront yet. The `us-east-1` certificate, and the
`provider "aws" { alias = "us_east_1" }` it requires, belong to **the slice that hosts the
consoles**. This is recorded as a **fourth region-pinned value outside Terraform's single
`var.aws_region` knob**, joining the Lambda layer ARN, the RDS CA bundle, and each `serverless.yml`
`provider.region` in [infra/envs/README.md](../../infra/envs/README.md).

---

## R3 — Certificate shape: one wildcard per environment namespace

**Decision**: One ACM certificate per environment, for **`*.dev.effyshopping.com`**, DNS-validated
via records Terraform writes into that environment's own zone.

**Rationale**: A wildcard covers `api.dev…` today and `back-office.dev…`, `shop.dev…`,
`shop-api.dev…` when those slices land — with **no new certificate, no new validation wait, and no
change to this slice's code**. That is FR-007 (a new endpoint is a repetition, not a redesign) at
the certificate layer. Validation is fully automatic because Terraform owns the zone the validation
records go into.

**Caveat carried forward**: a wildcard matches **exactly one label**. `edge-api.dev.effyshopping.com` ✅;
`a.b.dev.effyshopping.com` ❌. The naming convention (R4) therefore mandates **single-label** names
under an environment namespace. If a future endpoint ever needs two labels, it needs its own
certificate — cheap, but it must be a deliberate choice, not a surprise at apply time.

**Alternative rejected**: a SAN certificate listing each name explicitly. More precise (a wildcard
is a broader credential), but every new endpoint would then require re-issuing the certificate and
re-validating — turning "add an address" into a certificate migration. For a private platform
namespace the wildcard's blast radius is acceptable; for the **production apex** this decision
should be revisited, since a leaked wildcard key there is worth far more.

---

## R4 — The naming convention, and what `api_endpoint` means

**Decision**: `<endpoint>.<env>.effyshopping.com`, single label, environment-scoped. Production uses
the apex namespace directly.

| Endpoint | dev | prod (reserved) | Attached by |
|---|---|---|---|
| **Cold path** — shared edge API | `edge-api.dev.effyshopping.com` | `edge-api.effyshopping.com` | **this slice** |
| **Hot path** — core API (Go/Fargate) | `core-api.dev.effyshopping.com` | `core-api.effyshopping.com` | the slice that deploys it |
| Back-office console | `back-office.dev.effyshopping.com` | `back-office.effyshopping.com` | the slice that hosts it |
| Shop console | `shop.dev.effyshopping.com` | `shop.effyshopping.com` | the slice that hosts it |
| Customer storefront | `www.dev.effyshopping.com` | `www.effyshopping.com` + apex | the slice that hosts it |

**Amended 2026-07-12 (operator, before the address was published to any client): `api` → `edge-api`.**
The platform has **two** backends by constitutional design (Principle III). A bare `api.` would have
quietly awarded the generic word to one of them and left the other needing a subordinate-sounding
name. `edge-api` / `core-api` keeps the pair symmetric, matches the directories each fronts
(`apis/edge-api/`, `apis/core-api/`), and means no future slice has to relitigate it. The change is
free at this moment and would not have been later — the wildcard certificate already covers any
single label, and no client had been pointed at the old name yet.

**The SSM contract changes meaning, not shape.** `/effy/<env>/edge/api_endpoint` keeps its key and
becomes **the address callers should use** — i.e. it now holds
`https://edge-api.dev.effyshopping.com`. A new sibling `/effy/<env>/edge/api_default_endpoint` holds
the raw `execute-api` URL.

**Rationale**: every existing reader of `api_endpoint` (the two web `.env` files, the `Makefile`
verification targets, `README.md`) means *"where do I call this environment's API"* — so updating
the **value** gives all of them the branded address with **zero key renames** (a rename is a
breaking change to the 001 contract) and zero client edits beyond re-reading SSM. That is SC-003
(no provider-generated hostname in any client config) satisfied by construction. The raw URL is
still published under its own key, so nothing loses the fallback — which is what makes FR-011's
"additive, never a switch" real rather than aspirational.

**Critical corollary**: the API's `disable_execute_api_endpoint` MUST remain `false` (its default).
Setting it true is the one-line change that would silently violate FR-011 and SC-004 by killing the
raw URL. This is called out in tasks and in the contract.

---

## R5 — Branded sign-in email (SES), per environment

**Decision**: An **SESv2 domain identity for `dev.effyshopping.com`** (the environment's namespace,
not the apex), in `ap-southeast-2`, with Easy DKIM, a custom MAIL FROM subdomain, and SPF/DMARC
records — all written into the dev zone. All four Cognito pools then switch to
`email_sending_account = "DEVELOPER"` with `from_email_address = "Effy <no-reply@dev.effyshopping.com>"`.

**Rationale**: Verifying the *environment's* namespace rather than the apex means development's
sending reputation is contained in its own namespace — a burst of bounced dev OTPs can never spend
the production domain's reputation, which is a real and hard-to-reverse asset. It is the same
isolation principle as the DNS delegation, and it is what the operator asked for.

**The Cognito module needs no change.** `infra/modules/cognito-user-pool` already accepts
`email_configuration = { email_sending_account, source_arn, from_email_address,
reply_to_email_address }` and wires all four into the pool. The 001 slice anticipated exactly this
(its research D6). This is a **tfvars change plus a `source_arn`**, nothing more.

**⚠ Replacement guard (the T067 lesson).** `email_configuration` is an **in-place update** on
`aws_cognito_user_pool` — it must not replace the pool. But a replaced pool means **new pool ids,
new issuers, and every existing account destroyed** (including the 006 first admin and the 009 shop
users just provisioned). The apply step therefore carries the same hard rule as 007/009: **read the
plan; if any pool shows `must be replaced` / `-/+`, abort.**

**Records required in the dev zone** (all Terraform-owned):

| Record | Purpose |
|---|---|
| 3 × `CNAME` (Easy DKIM) | proves the platform controls the domain; signs outbound mail |
| `MX` on the MAIL FROM subdomain | custom MAIL FROM → SPF alignment for DMARC |
| `TXT` (SPF) on the MAIL FROM subdomain | authorizes Amazon SES to send |
| `TXT` `_dmarc` | DMARC policy — start at `p=none` (monitor), tighten later |

**Sending-authorization policy**: an SES identity policy granting the `cognito-idp.amazonaws.com`
service principal `ses:SendEmail` / `ses:SendRawEmail` on the identity, conditioned on the pool
ARNs. Same-account Cognito→SES *may* work without it; it is included because it is harmless,
explicit, and the failure mode without it (silent send failures on the only credential the platform
issues) is severe.

**⚠ AMENDED DURING IMPLEMENTATION — the pool switch needs its own stage.**

**Cognito rejects a `source_arn` whose SES identity is not yet VERIFIED**, and verification is
**asynchronous**: AWS polls for the DKIM records *after* the apply that creates them returns. So the
obvious single-apply design — create the identity and flip the pools together — **fails**, and fails
confusingly (the Cognito API error names the identity, not the DNS records that have not propagated
yet).

The fix is a `ses_sender_enabled` flag (default `false`), which makes the gate **explicit** rather
than a mystery:

```
apply (flag false)  → identity + DKIM/SPF/DMARC records created; pools stay on the built-in sender
make mail-verify    → until this is green, SES has not verified the domain
set flag true       → apply again; the four pools switch sender IN PLACE
```

This mirrors the registrar gate (**R6**) exactly: both are "AWS must publicly resolve a record before
the next step can succeed", and in both cases the honest design is to *name the wait* rather than
hide it inside an apply that will time out.

**⚠ The SES sandbox is an operator step with an external lead time.** A new SES account is
sandboxed: **200 emails/day, 1/sec, and only to individually verified recipients**. Note that 200/day
*already beats* Cognito's ~50/day default ceiling — so **SC-011 is met on the sandbox alone** — but
until production access is granted, mail to an unverified address is **rejected, not delivered**.
That is FR-021's "must not fail silently": the restriction is real, it is named here, and leaving
the sandbox is an AWS support request that should be **filed at the start of the slice**, not at the
end, because it takes ~24h. SC-010 (verified on a real consumer inbox) needs either production
access or a verified test recipient.

**Deliberately not built**: inbound mail. `hello@…` is not established (FR-022) — the platform
cannot receive, and an address that bounces replies is worse than none.

---

## R6 — Apply ordering: the registrar repoint gates everything

**Decision**: Two applies, with a **mandatory human step and a propagation wait between them**.

```
1. make global-apply                 → parent zone exists; outputs its 4 name-servers
2. 🧑‍💻 GoDaddy: repoint NS to those  → then WAIT and verify with dig
3. make apply ENV=dev                → child zone, delegation, cert, custom domain, SES
```

**Rationale — this is not stylistic, step 3 physically cannot succeed before step 2.** ACM DNS
validation and SES DKIM verification both work by AWS **publicly resolving a record** in the dev
zone. Public resolution of `dev.effyshopping.com` requires the parent to delegate to it, which
requires the registrar to point at the parent zone. Until GoDaddy is repointed, the dev zone is
authoritative for a name nobody on the internet can find, `aws_acm_certificate_validation` blocks
until it times out (default 45m), and the apply fails with a confusing error that looks like a
Terraform problem and is actually a DNS problem.

**Verification gate between the steps** (belongs in the quickstart, not in someone's head):

```bash
dig +short NS effyshopping.com        # must return the 4 Route 53 name-servers, not GoDaddy's
```

Propagation is bounded by the registrar's TTL (commonly up to 48h, usually far less). **Nothing
breaks during the wait** — no client depends on the domain yet, and the raw `execute-api` URL keeps
serving. The additive design (R4) is what buys this safety.

---

## R7 — CORS needs no change, and that is not an oversight

**Decision**: `aws_apigatewayv2_api.edge.cors_configuration.allow_origins` is **left exactly as it
is** (the three localhost origins).

**Rationale**: CORS keys on the **caller's `Origin`**, never on the host being called. The consoles
still run at `http://localhost:5173` / `:5174`; pointing them at `https://edge-api.dev.effyshopping.com`
instead of the `execute-api` URL changes the *target*, not the origin. So the existing allow-list
keeps working unchanged.

This is worth stating explicitly because FR-013 *sounds* like it demands a CORS edit here, and
"CORS looks wrong, let me add the new domain to allow_origins" is a natural and incorrect reflex.
Hosted-console origins (`https://back-office.dev.effyshopping.com`, …) get added by **the slice that
hosts them** — at which point they are genuinely new origins.

---

## R8 — Cost

| Item | Rate | This slice (dev) |
|---|---|---|
| Hosted zone — parent | $0.50/mo | $0.50 |
| Hosted zone — `dev.` | $0.50/mo | $0.50 |
| DNS queries | ~$0.40 / million | ≈ $0.00 |
| ACM public certificate | **free** | $0.00 |
| API Gateway custom domain | **free** (no per-domain charge on HTTP APIs) | $0.00 |
| SES outbound | $0.10 / 1,000 | ≈ $0.00 at OTP volume |
| **Total** | | **≈ $1.00/mo** |

**SC-012 (< $5/mo) is met with a 5× margin.** Each further environment adds one hosted zone
(+$0.50/mo). Domain **registration** is a GoDaddy cost, outside AWS and outside this measurement.

---

## R9 — Telemetry (Principle VII)

This slice adds **no user-facing flow**, so it introduces **no product-analytics events**. It does
introduce two things that can fail silently and take auth down with them, so both get alarms:

| Alarm | Why |
|---|---|
| **ACM `DaysToExpiry` < 30** on the cert | SC-006 claims renewal needs zero human actions. Renewal is automatic **only while the DNS validation record still exists** — if it is ever removed, renewal silently fails and the endpoint goes untrusted at expiry. The alarm is what makes the "zero human actions" claim safe to rely on rather than merely hoped for. |
| **SES bounce rate > 5%** and **complaint rate > 0.1%** | Exceeding AWS's thresholds gets sending **paused** — which, since EMAIL_OTP is the platform's only credential, means **nobody on any of the four audiences can sign in**. This is the single highest-severity failure mode the slice introduces, and it is invisible until it is total. |

Both are CloudWatch metric alarms in the dev root, alongside the existing `edge-api-5xx` alarm. No
new dashboard; these belong on the platform's existing Grafana when it lands.
