# Quickstart — 010 Platform Domain & Per-Environment Namespaces

Validation/run guide. Design lives in [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/dns-and-address.contract.md). Code steps
are Claude-authored; **operator-run** steps (🧑‍💻) touch live cloud state, the registrar, or AWS
support, per CLAUDE.md.

## ⚠ Read this before you run anything

**The order is not a suggestion — steps 3+ physically cannot succeed before step 2.** ACM
certificate validation and SES DKIM verification both work by AWS **publicly resolving a record in
the dev zone**. Public resolution requires the parent to delegate to it, which requires **GoDaddy to
point at the parent zone**. Apply the dev root too early and `aws_acm_certificate_validation` blocks
until it times out (45 min) and fails with an error that looks like Terraform's fault and is
actually DNS's.

**Nothing breaks while you wait.** No client depends on the domain yet, and the raw `execute-api`
URL keeps serving throughout. The cutover is additive by design (FR-011).

## Prerequisites

- 001–009 applied. The shared HTTP API exists and serves at its `execute-api` URL.
- **GoDaddy account access** for `effyshopping.com` (to change name-servers). This is outside AWS and
  outside Terraform.
- `dig` and `curl` available locally.
- The dev DB running if you intend to re-verify app behavior (`make dev-status`).

## Build (code-verifiable, no cloud)

```bash
make lint            # fmt-check + validate EVERY root (now incl. infra/global) + tflint + trivy
shellcheck scripts/dns-verify.sh scripts/mail-verify.sh
```

Expected: all green. No application code changes ship in this slice, so there is no `pnpm test` delta.

---

## Operator run (🧑‍💻 — live)

### Step 0 — file the SES production-access request FIRST

```
AWS Console → SES → Account dashboard → Request production access
```

It takes **~24h**. File it now and it will be granted by the time you need it. Do it last and you
sit idle. Until it is granted you are in the **sandbox**: 200 emails/day, 1/sec, and **only to
individually verified recipients** — enough to prove the mechanism, not enough for SC-010 on a real
inbox unless you verify your own test address.

### Step 1 — create the parent zone

```bash
make global-init
make global-plan          # expect: 1 hosted zone to add, nothing else
make global-apply         # OPERATOR — interactive approval
make global-output        # → the 4 Route 53 name-servers
```

### Step 2 — 🧑‍💻 repoint GoDaddy, then WAIT

In the GoDaddy DNS console for `effyshopping.com`, replace the name-servers with the four from
step 1. **The registration stays at GoDaddy** — you are changing *authority*, not transferring.

Then verify, and do not proceed until this is true:

```bash
dig +short NS effyshopping.com
# MUST return the four Route 53 name-servers (ns-xxx.awsdns-xx.com …)
# If it still returns GoDaddy's, propagation is not done. Wait. Up to 48h, usually far less.
```

### Step 3 — apply the dev environment

```bash
make plan ENV=dev
```

**Read the plan before approving. Two hard rules:**

1. **ABORT if any Cognito user pool shows `must be replaced` / `-/+`.** A replaced pool destroys
   every account in it — including the 006 first admin and the shop users 009 just provisioned.
   `email_configuration` is an in-place update; a replacement means something else is wrong.
2. Expect roughly: 1 hosted zone, 1 NS record in the parent, 1 ACM certificate + validation, 1 API
   Gateway domain + mapping, A/AAAA aliases, the SES identity + ~6 records, 2 alarms, 2 SSM
   parameters, and **4 Cognito pools updated in place**.

```bash
make apply ENV=dev        # OPERATOR — this blocks while ACM validates (a few minutes)
```

### Step 4 — verify DNS, TLS, and the additive cutover

```bash
make dns-verify ENV=dev
```

Proves, in one shot:

- `dev.effyshopping.com` is delegated to its own name-servers (**SC-001**)
- `edge-api.dev.effyshopping.com` resolves and serves over TLS with **no certificate warning** (**SC-002**)
- the **raw `execute-api` URL still answers identically** — zero callers broken (**SC-004**)

### Step 5 — verify the mail identity, THEN switch the pools

**This is a two-stage gate, and step 3 deliberately left the pools alone.** Cognito **rejects** a
`source_arn` whose SES identity is not yet verified, and verification is **asynchronous** — AWS polls
for the DKIM records minutes *after* the apply that created them returns. Flipping the pools in the
same apply fails, and fails confusingly.

```bash
make mail-verify ENV=dev
```

Proves DKIM (3 CNAMEs), SPF, and DMARC resolve, and that SES reports the domain **verified**. Re-run
until green — it usually takes a few minutes.

Then, and only then:

```bash
# infra/envs/dev/dev.tfvars
ses_sender_enabled = true
```

```bash
make plan ENV=dev     # ⚠ ABORT if ANY Cognito pool shows "must be replaced" / "-/+"
make apply ENV=dev    # the four pools switch sender IN PLACE
```

A replaced pool destroys **every account in it** — the 006 first admin and the 009 shop users
included. `email_configuration` is an in-place update; a replacement means something else is wrong.

### Step 6 — re-read the client config from the contract

```bash
AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/edge/api_endpoint \
  --query Parameter.Value --output text --region ap-southeast-2
# → https://edge-api.dev.effyshopping.com
```

Update `VITE_API_BASE_URL` in `apps/back-office/.env` and `apps/shop-web/.env` from that value
(**SC-003**: zero provider-generated hostnames left in client config). Then:

```bash
make bo-dev     # :5173 — sign in, load Shops. Note: CORS needs no change (research R7) —
make shop-dev   # :5174   the origin is still localhost; only the target changed.
```

### Step 7 — prove the sign-in email

Request an OTP on either console. The mail must arrive **from `no-reply@dev.effyshopping.com`**, pass
the receiving system's domain checks, and land in the **inbox, not spam** (**SC-010**).

> In the SES sandbox this only works for a **verified recipient**. If production access (step 0) has
> landed, use any real address on a major consumer provider.

---

## Acceptance validation (maps to spec SC)

| Scenario | Steps | Expect | SC |
|---|---|---|---|
| Delegation live | `dig NS effyshopping.com`, `dig NS dev.effyshopping.com` | parent → Route 53; dev → its own zone's NS | SC-001 |
| Branded API, trusted | `curl https://edge-api.dev.effyshopping.com/admin/v1/...` with a valid token | 200, no TLS warning, same body as the raw URL | SC-002 |
| No raw hostnames left | grep both `.env` files + the Makefile targets | zero `execute-api` hostnames in client config | SC-003 |
| Additive cutover | call the **raw** `execute-api` URL | still 200 — nothing broken | SC-004 |
| Name survives replacement | destroy + recreate the API Gateway; re-apply | the alias repoints; **no client change** | SC-005 |
| Renewal is hands-off | inspect the certificate | renewal automatic; validation record present; expiry alarm armed | SC-006 |
| A new env is a repetition | instantiate `dns-env-zone` with `env = "qa"` (plan only) | plans clean with **no structural change** | SC-007 |
| No dangling delegation | `terraform plan -destroy` on dev | the parent's `NS` record is destroyed **with** the zone | SC-008 |
| Apex serves nothing | `dig effyshopping.com`, `curl https://effyshopping.com` | no dev endpoint, no dev content | SC-009 |
| Branded sign-in mail | request an OTP | from `no-reply@dev.effyshopping.com`, DKIM+SPF pass, inbox | SC-010 |
| Past the old ceiling | send beyond ~50/day | delivery continues (sandbox allows 200/day) | SC-011 |
| Cost bounded | AWS billing → Route 53 + SES | ≈ **$1.00/mo** — under the $5 bar | SC-012 |
| Runbook updated | read `infra/envs/README.md` | GoDaddy dependency + the **4th region-pinned value** (`us-east-1` cert) documented | SC-013 |
| Dev mail isolated | inspect the SES identity | dev sends as `dev.effyshopping.com`, **never** the apex | SC-014 |

## Rollback

Genuinely safe, because the cutover is additive:

- **The API address**: set `/effy/dev/edge/api_endpoint` back to the raw URL (it is preserved in
  `api_default_endpoint`) and re-read the two `.env` files. Nothing else moves.
- **Sign-in email**: set `email_configuration = { email_sending_account = "COGNITO_DEFAULT" }` in
  `dev.tfvars` and apply. The pools revert to the built-in sender in place — **no pool replacement,
  no account loss**.
- **The namespace**: `make destroy ENV=dev` removes the dev zone and its parent delegation together.
- **The parent zone**: do **not** destroy casually. Recreating it mints **new name-servers** and
  requires another manual GoDaddy repoint plus a fresh propagation wait.
