# Operator Directives — 010-domain-dns-foundation

These are the **technology-specific directives** the operator gave in the `/speckit-specify`
description. Per constitution Principle I the `spec.md` stays free of implementation detail, so they
are recorded here as **plan-phase input**. `/speckit-plan` MUST resolve each one in `plan.md` (with
its Constitution Check), not the spec.

## Directives captured (verbatim intent)

1. **The domain** — `effyshopping.com`, already purchased, currently registered at **GoDaddy** and
   not pointed anywhere. It is the **production/primary** domain. Production is **not deployed**;
   the apex is reserved.

2. **DNS authority → Route 53.** Attach the domain to a **Route 53 hosted zone**. The registrar
   (GoDaddy) keeps the registration; its NS records are repointed at the Route 53 zone's four
   name-servers. *No registrar transfer.*

3. **Per-environment subdomain delegation.** `dev.effyshopping.com` becomes a **separate hosted
   zone**, delegated from the parent zone via an `NS` record set in the parent. All dev resources
   live under it. **qa** and **staging** repeat the pattern later; the plan MUST make adding one a
   variable, not a redesign.

4. **Attach to API Gateway "and other places."** The shared HTTP API (`infra/envs/dev/edge-gateway.tf`)
   gets a **custom domain name** + **API mapping**, fronted by an **ACM certificate**. "Other places"
   is deliberately vague in the description → this is the spec's **first open question** (spec FR-016).

5. **Region: Sydney (`ap-southeast-2`)**, per the locked region decision.

## ⚠ Correction the plan MUST account for

**Route 53 hosted zones are a global service — there is no "hosted zone in Sydney."** Hosted zones
have no region. Region matters here in exactly one place, and it is a trap:

- **ACM certificates are regional and must live in the region of the thing they front.**
  - A certificate for the **regional API Gateway custom domain** must be issued in
    **`ap-southeast-2`** (same region as the API).
  - A certificate for anything fronted by **CloudFront** — which includes **Amplify Hosting**, the
    intended home of the web consoles — must be issued in **`us-east-1`**, *regardless* of where the
    rest of the platform lives.
  - So this slice may need **two certificates in two regions** for one domain. The plan must state
    this explicitly rather than discovering it at apply time.

This joins the existing set of **values that pin a region outside Terraform** (CLAUDE.md: the Lambda
Parameters-and-Secrets layer ARN, the RDS CA bundle, each `serverless.yml` `provider.region`). The
`us-east-1` certificate provider alias is a **fourth**, and belongs in the same runbook
([infra/envs/README.md](../../infra/envs/README.md)).

## Facts established by survey (2026-07-12)

- **No DNS, certificate, or domain resource exists anywhere in `infra/`.** This is greenfield.
- **Exactly one public endpoint exists**: the shared HTTP API, at the provider-generated
  `https://mbjuqrl5ui.execute-api.ap-southeast-2.amazonaws.com`, **hard-coded** into
  `apps/back-office/.env` and `apps/shop-web/.env` as `VITE_API_BASE_URL`.
- **The web consoles are not hosted.** No Amplify Hosting resource exists; they run on
  `localhost:5173` / `:5174`. The gateway's `cors_configuration.allow_origins` allows **only**
  localhost origins — so any hosted console origin is a **required gateway change** in this slice or
  the one that hosts them.
- **The hot path has never been deployed** (`apis/core-api` is local Docker only). It has no public
  address to name.
- **Cognito sends OTP mail with `email_sending_account = "COGNITO_DEFAULT"`.** The
  `infra/modules/cognito-user-pool` module **already** takes an `email_configuration` object with
  `source_arn` + `from_email_address` and its own variable documentation points at the SES switch for
  higher environments (001 research D6). Domain ownership is the prerequisite that unblocks it.
  - The default sender caps at **~50 emails/day** and sends from a generic AWS address. **EMAIL_OTP is
    the only credential this platform issues, on all four pools** — so this ceiling is a hard limit on
    auth, which is why the spec raises branded email to a first-class user story (US3) rather than a
    footnote.
  - SES starts in the **sandbox** (recipients must be individually verified). Leaving it is a support
    request with a lead time — the plan should surface this as an operator step with a known delay,
    not a surprise.

## The SSM address contract (existing pattern to extend)

The platform already publishes an app↔infra contract in SSM — `/effy/<env>/edge/{http_api_id,
api_endpoint, authorizer/<audience>_id}` (004). The custom domain **belongs in that same contract**
(e.g. `/effy/<env>/edge/api_endpoint` updated, or a sibling key), so clients keep reading their
address from one place rather than a second hand-copied value appearing. Spec FR-014 / FR-015 exist
to force this.

## Operator-run steps (mode of work)

Per CLAUDE.md, Claude authors all Terraform/config; the **operator personally runs** anything
touching live cloud state or third-party accounts:

- **GoDaddy NS repoint** (in the GoDaddy console — outside Terraform entirely, and irreversible-ish:
  a wrong NS set makes the domain unreachable until corrected + propagated).
- `make apply ENV=dev` for the zones, certificates, custom domain, and mappings.
- **ACM DNS validation** — automatic *if* the validation records are created in the zone Terraform
  owns; the operator waits for `ISSUED`.
- **SES sandbox exit** request, if branded email lands in scope.
- Any registrar credential handling.
