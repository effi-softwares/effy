# Implementation Plan: Platform Domain & Per-Environment Namespaces

**Branch**: `010-domain-dns-foundation` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-domain-dns-foundation/spec.md`

## Summary

Make the platform authoritative for `effyshopping.com`, give every environment a **delegated child
namespace** it fully owns, and move the one endpoint that exists today — the shared cold-path HTTP
API — onto a stable, trusted, platform-owned address. Then use that same ownership to fix the
platform's most pressing operational ceiling: **sign-in email**, which currently goes out through
Cognito's built-in sender at ~50/day from a generic AWS address, on a platform where a one-time
email code is the **only credential any of the four audiences ever receives**.

**Technical approach** (all Terraform; no application code changes):

1. A **new `infra/global/` root** owns the parent hosted zone. It is deliberately *not* an
   environment, so that `make destroy ENV=dev` can never take the platform's apex with it (research
   **R1** — the load-bearing decision in this slice).
2. Each env root creates **its own** child zone (`dev.effyshopping.com`) **and its own delegation
   `NS` record in the parent**, which it finds by name. Delegation therefore lives and dies with the
   zone it points at — closing the subdomain-takeover hole by construction (**R1**, FR-005).
3. One **wildcard ACM certificate** per environment (`*.dev.effyshopping.com`) in `ap-southeast-2`,
   DNS-validated from the env's own zone — so every future endpoint is a new record, not a new
   certificate (**R3**).
4. An **API Gateway custom domain** + mapping + Route 53 alias puts the shared API on
   `edge-api.dev.effyshopping.com`. The raw `execute-api` URL is **left alive** — the cutover is additive
   (**R4**, FR-011).
5. An **SESv2 domain identity for the environment's own namespace** (`no-reply@dev.effyshopping.com`)
   with DKIM/SPF/DMARC, and all four Cognito pools switched to it (**R5**).

**The one thing that will bite if ignored**: ACM validation and SES DKIM both require AWS to
*publicly resolve* a record in the dev zone. That cannot happen until GoDaddy's name-servers point
at the parent zone. **The registrar repoint is a hard gate between two applies** (**R6**), not a
tidy-up step afterwards.

## Technical Context

**Language/Version**: HCL — Terraform `>= 1.11.0`, AWS provider `~> 6.0` (existing pins).

**Primary Dependencies**: Route 53 (hosted zones, records), ACM (public certificate, DNS
validation), API Gateway v2 (custom domain, API mapping), SESv2 (domain identity, DKIM, MAIL FROM),
Cognito (email configuration — module already supports it), SSM Parameter Store (the address
contract), CloudWatch (two alarms).

**Storage**: N/A — no database change, no migration. The **first slice since 002 to touch no SQL.**

**Testing**: `terraform validate` + `fmt -check` + `tflint` + `trivy` via `make lint`; `dig` / `curl`
verification scripts for the live acceptance (a DNS delegation and a TLS handshake cannot honestly
be unit-tested — same posture as 007's `scripts/`).

**Target Platform**: AWS `ap-southeast-2` (Sydney) + Route 53 (global — research **R2**).

**Project Type**: Infrastructure. **No application code changes** beyond re-reading two `.env` files
from the SSM contract.

**Performance Goals**: N/A. One DNS lookup and one TLS handshake are added to a client's first call;
neither is a measurable product latency concern.

**Constraints**:
- Additive only — the raw `execute-api` URL must keep working (FR-011/SC-004).
- No Cognito pool may be replaced (would destroy every existing account — see Constitution Check IV).
- Recurring cost < USD 5/mo (SC-012; actual ≈ **$1.00/mo**, research **R8**).
- The registrar repoint is a human step at GoDaddy, outside Terraform, with a propagation wait.

**Scale/Scope**: 2 hosted zones, 1 certificate, 1 custom domain, ~10 DNS records, 4 Cognito pools
reconfigured, 2 new Terraform modules, 1 new Terraform root, 2 CloudWatch alarms.

## Constitution Check

*GATE: passed before Phase 0. Re-checked after Phase 1 — see § Post-Design Re-check.*

| Principle | Verdict | Justification |
|---|---|---|
| **I — Spec-Driven** | ✅ PASS | `spec.md` (tech-free) → this plan → `tasks.md`. The two scope questions were resolved by the operator *before* planning, not patched during it. Tech directives quarantined in [operator-directives.md](./operator-directives.md). |
| **II — Monorepo & Shared Contracts** | ✅ PASS | The **SSM address contract** (`/effy/<env>/edge/*`) stays the single source of truth for "where is this environment's API" — clients read it, nobody hard-codes. The two genuinely reusable multi-resource units become **modules** (`dns-env-zone`, `ses-domain-identity`), so qa/staging is instantiation, not copy-paste (FR-007). |
| **III — Dual-Path Backend** | ✅ PASS (N/A, declared) | This slice adds **no backend code to either path**. It changes the *address in front of* the existing cold path and the *sender* behind Cognito. No handler, service, or repository is touched. Principle III requires a path declaration; the honest declaration is **neither**. |
| **IV — Auth Isolation** | ⚠️ **PASS with a guard** | Four pools, four issuers, four authorizers — **all unchanged**. Cross-pool rejection is untouched. The slice changes only each pool's `email_configuration` (the *delivery channel* for the OTP, not the OTP flow, the token, or its validation). All four pools share **one** sending identity; that is a shared transport, not shared trust — no token, claim, or issuer crosses a pool boundary. **The guard**: `email_configuration` is an in-place update, but a *replaced* pool destroys every account in it (incl. the 006 first admin and the 009 shop users). Every apply step in this slice carries the same hard rule as 007/009 — **read the plan; abort on `must be replaced`.** |
| **V — Design System** | ✅ PASS (N/A) | No UI. The only brand surface is the email sender display name (`Effy`). |
| **VI — Layered Architecture** | ✅ PASS | ARCHITECTURE.md's infra rule holds: **composition happens only in env roots; modules never call `_shared`**. The new `infra/global/` root composes; the two new modules are leaf, reusable, and env-agnostic. |
| **VII — Observability** | ✅ PASS | No user-facing flow → **no product-analytics events**. Two alarms added for the two things this slice makes able to fail *silently and totally*: **ACM `DaysToExpiry < 30`** (a removed validation record makes auto-renewal fail quietly until the endpoint goes untrusted) and **SES bounce > 5% / complaint > 0.1%** (breaching it *pauses sending* — which, since EMAIL_OTP is the only credential the platform issues, means **nobody on any audience can sign in**). Research **R9**. |

**No violations.** One new Terraform root is justified in § Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/010-domain-dns-foundation/
├── spec.md                    # WHAT/WHY (operator-clarified, zero open questions)
├── operator-directives.md     # tech directives + the "hosted zone in Sydney" correction
├── plan.md                    # this file
├── research.md                # R1–R9 (Phase 0)
├── data-model.md              # the DNS record inventory + entity model (Phase 1)
├── contracts/
│   └── dns-and-address.contract.md   # naming convention + the SSM address contract (Phase 1)
├── quickstart.md              # the operator runbook — ordering is load-bearing (Phase 1)
└── checklists/requirements.md # spec quality gate (all pass)
```

### Source Code (repository root)

```text
infra/
├── global/                          # ★ NEW ROOT — platform-wide, NOT an environment (R1)
│   ├── backend.tf                   #   S3 remote state, key: global/terraform.tfstate
│   ├── providers.tf                 #   ap-southeast-2 + the same allowed_account_ids guard
│   ├── versions.tf
│   ├── dns.tf                       #   the parent zone: effyshopping.com
│   └── outputs.tf                   #   → the 4 name-servers the operator pastes into GoDaddy
│
├── modules/
│   ├── dns-env-zone/                # ★ NEW — one environment's namespace, end to end
│   │   ├── main.tf                  #   child zone + NS delegation into the parent + wildcard
│   │   │                            #   ACM cert + its DNS validation records
│   │   ├── variables.tf             #   env, parent_zone_id, parent_domain, tags
│   │   └── outputs.tf               #   zone_id, zone_name, certificate_arn
│   │
│   └── ses-domain-identity/         # ★ NEW — one environment's sending identity
│       ├── main.tf                  #   SESv2 identity + Easy DKIM CNAMEs + custom MAIL FROM
│       │                            #   (MX + SPF) + DMARC TXT + the Cognito sending policy
│       ├── variables.tf
│       └── outputs.tf               #   identity_arn, from_address
│
└── envs/dev/
    ├── dns.tf                       # ★ NEW — instantiate dns-env-zone + ses-domain-identity
    ├── edge-domain.tf               # ★ NEW — API GW custom domain + mapping + A/AAAA alias
    │                                #   + the api_default_endpoint SSM key
    ├── edge-gateway.tf              # ~ EDIT — api_endpoint SSM value → the custom domain (R4)
    ├── auth-*.tf                    #   (4 files) UNCHANGED — email_configuration flows from tfvars
    ├── dev.tfvars                   # ~ EDIT — email_configuration → DEVELOPER + source_arn
    └── variables.tf                 # ~ EDIT — root_domain, api_subdomain

Makefile                             # ~ EDIT — global-{init,plan,apply}; TF_ROOTS += infra/global;
                                     #          dns-verify + mail-verify targets
scripts/
├── dns-verify.sh                    # ★ NEW — SC-001/002/004: delegation live, TLS trusted,
│                                    #   branded and raw URLs both answer identically
└── mail-verify.sh                   # ★ NEW — SC-010: DKIM/SPF/DMARC published and valid

apps/back-office/.env                # ~ EDIT — VITE_API_BASE_URL ← re-read from SSM (SC-003)
apps/shop-web/.env                   # ~ EDIT — same
infra/envs/README.md                 # ~ EDIT — the 4th region-pinned value (us-east-1 cert) + the
                                     #          GoDaddy dependency + the two-apply ordering
```

**Structure Decision**: The existing infra shape is *root-per-environment, modules for reusable
units, composition only in roots* — and env roots duplicate their `.tf` files by design (per
[infra/envs/README.md](../../infra/envs/README.md): a new env copies them in). This plan follows that
grain exactly. The API custom domain lives **in the env root** (`edge-domain.tf`), next to the
gateway it fronts, because that is how `edge-gateway.tf` already works. Only the two units that are
genuinely *identical across environments and multi-resource* — an environment's DNS namespace and
its sending identity — become modules. The one deviation from the existing shape, `infra/global/`, is
justified below.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **A new Terraform root (`infra/global/`)** — the repo has had exactly one root shape (`infra/envs/<env>`) plus `bootstrap` since 001 | The parent zone is a **platform asset that outlives every environment**. Env roots are *designed* to be destroyable — `make destroy ENV=dev` is supported and was actually used during the 2026-07-12 region relocation. | *Parent zone inside `infra/envs/dev`*: `make destroy ENV=dev` would then destroy `effyshopping.com` itself — every record, production's future delegation, and (because a re-created zone gets **new name-servers**) recovery would require a manual GoDaddy repoint. A routine dev command must not be able to do that. `prevent_destroy` only converts the catastrophe into a blocked teardown, breaking the workflow the team relies on. *Reusing `infra/bootstrap`*: that root is **local-state** by design (it creates the state bucket); DNS belongs in remote state. |

## Post-Design Re-check (after Phase 1)

Re-evaluated against the constitution with the design artifacts complete:

- **Principle II holds and got stronger.** Designing `contracts/dns-and-address.contract.md` forced
  the `api_endpoint` semantics decision (**R4**) into the open: the key keeps its name and its
  meaning ("where do I call this environment's API") and simply gets a better *value*. No key
  renames → no breaking change to the 001 contract → every existing reader (two `.env` files, two
  Makefile targets, `README.md`) picks up the branded address for free. Had this been designed
  sloppily — a *new* key alongside the old — the platform would have grown two competing answers to
  one question, which is precisely the drift Principle II exists to prevent.
- **Principle IV's guard was strengthened, not weakened, by the design.** Writing the data model made
  explicit that all four pools share **one** SES identity. That is a shared *transport*, not shared
  *trust*: no issuer, audience, claim, or authorizer changes, and a token from one pool remains
  structurally rejected by a service scoped to another. The pool-replacement abort rule is now an
  explicit precondition on every apply task, not a footnote.
- **Principle VII's alarms are the design's own safety net.** Both alarms exist because Phase 1
  surfaced *silent, total* failure modes that the happy path hides: a removed ACM validation record
  breaks auto-renewal quietly (and SC-006 *promises* renewal needs no human), and an SES reputation
  breach pauses sending — which on this platform means **auth stops working for everyone**. Adding
  them is what makes SC-006 and SC-010 honest claims rather than hopes.
- **No new violations.** The complexity entry above is unchanged and remains the only one.

**Gate: PASS.** Ready for `/speckit-tasks`.
