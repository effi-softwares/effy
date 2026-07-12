# Research & Decisions: Cost-Minimized Development Database

Phase 0 output. Every decision resolves a "how" left open by the spec, under two binding
inputs: the constitution's locked standards (PostgreSQL 16, Terraform/multi-env/remote
state) and the operator's verbatim cost mandate in
[operator-directives.md](./operator-directives.md). Format: **Decision → Rationale →
Alternatives considered**.

---

## D1 — Engine & version: RDS PostgreSQL, major 16, auto minor upgrades

**Decision**: `aws_db_instance` with `engine = "postgres"`, `engine_version = "16"`
(major-version pinning — RDS tracks the latest 16.x minor), `auto_minor_version_upgrade =
true`.

**Rationale**: PostgreSQL 16 is the constitution-locked engine. Major-only pinning + free
auto minor upgrades keeps the instance inside **standard support** indefinitely during the
platform's early life — which is precisely what makes the operator's "no expert support"
directive (RDS **Extended Support**, billed per-vCPU-hour once an engine major passes EOL)
structurally unbillable: PG16 standard support runs well past this platform's horizon, and
minors apply themselves.

**Alternatives considered**:
- **Pin an exact minor (e.g. `16.6`)** — *Rejected.* Deterministic but rots: each minor bump
  becomes a manual chore, and drift toward EOL is how Extended Support charges sneak in.
- **PostgreSQL 17** — *Rejected.* Constitution locks 16; a bump is a constitution amendment,
  not a cost decision.

## D2 — Instance & storage: db.t4g.micro, 20 GB gp3, no autoscaling

**Decision**: `instance_class = "db.t4g.micro"` (2 vCPU Graviton, 1 GiB) on-demand;
`allocated_storage = 20`, `storage_type = "gp3"`; **no** `max_allocated_storage` (storage
autoscaling off).

**Rationale**: Directives #1–#4 verbatim. t4g is the cheapest instance family RDS offers
for PostgreSQL; 20 GB is the RDS minimum for gp3. **gp3 over gp2** (the directive allowed
either): same-or-lower per-GB price, 3,000 baseline IOPS + 125 MB/s included regardless of
size — gp2 at 20 GB would earn only 100 IOPS. Autoscaling stays off so cost is a fixed
number; storage growth is a deliberate tfvars change (the spec's US3 lever), and RDS storage
can only ever grow, so starting at the floor is the safe direction.

**Cost estimate (ap-southeast-1, on-demand, 2026 pricing — verify in the AWS Pricing
Calculator per SC-001)**: instance ≈ $0.026/hr ≈ **$19/mo**; 20 GB gp3 ≈ **$2.5/mo**;
managed master secret ≈ **$0.40/mo** (D5); KMS default key $0; basic CloudWatch metrics $0.
**Total ≈ $22/mo ≤ the $25 ceiling**, with ~$3 headroom for pricing drift.

> ⚠️ **These rates are Singapore rates.** `dev` moved to **ap-southeast-2 (Sydney)** on 2026-07-12
> and the figures above have **not** been re-priced — see [cost-evidence.md](./cost-evidence.md).
> The *posture* (every paid lever off) is region-independent and still holds; only the rates, and
> hence the $25-ceiling margin, need re-checking.

**Alternatives considered**:
- **db.t3.micro** — *Rejected.* x86 costs more than Graviton for the same size; nothing in
  the stack needs x86.
- **Aurora Serverless v2** — *Rejected.* Minimum capacity (0.5 ACU) already exceeds the
  ceiling (~$44/mo in apse1) unless auto-paused, and pause/resume latency + engine variance
  is needless novelty for a dev box. Plain RDS is the boring, cheap, locked-standard choice.
- **gp2** — *Rejected* (allowed but inferior): same-ish price, 30× fewer IOPS at 20 GB.

## D3 — The all-off cost posture (directives #5–#9, spec FR-005)

**Decision**: every separately-billed option explicitly off in the module, each surfaced as
a variable so promotion can flip it per env:

| Lever | Setting (dev) | Billed feature avoided |
|---|---|---|
| `multi_az` | `false` | standby instance (~2× cost) |
| `backup_retention_period` | `0` | automated backup storage |
| `skip_final_snapshot` / no manual snapshots | `true` / none | snapshot storage |
| snapshot exports | none configured | export-to-S3 tasks |
| `performance_insights_enabled` | `false` | Performance Insights retention |
| `database_insights_mode` | `"standard"` (free tier of Database Insights) | Advanced Database Insights |
| `monitoring_interval` | `0` | Enhanced Monitoring (per-metric CloudWatch ingest) |
| `enabled_cloudwatch_logs_exports` | `[]` | CloudWatch Logs ingest/storage |
| RDS Proxy | no resource created | proxy hourly per-vCPU charge |
| Extended Support | unreachable (D1) | per-vCPU-hr EOL surcharge |
| `deletion_protection` | `false` (dev) | n/a — disposability, spec edge case |

**What stays ON because it's free**: storage encryption at rest (default `aws/rds` KMS key —
no monthly key charge), basic CloudWatch metrics (CPU, connections, free storage — satisfies
the spec's "observe capacity at no extra cost"), forced TLS (D7).

**Rationale**: this is the directive, mechanically. Making each item a module variable with
the cheap default turns the spec's US3 ("grow later") into tfvars edits, and the
[cost-posture contract](./contracts/cost-posture.contract.md) makes US2 ("verifiably off")
a checklist of `describe-db-instances` fields.

**Alternatives considered**: none — this set is mandated. The only judgment call is
`deletion_protection = false` in dev (disposable data, teardown must stay one command);
promotion flips it true.

## D4 — Network placement: default VPC + strict allowlist + forced TLS (the $0 design)

**Decision**: place the instance in the account's **default VPC** (data-sourced, never
created by this slice), `publicly_accessible = true`, guarded by a dedicated security group
whose **only ingress is TCP/5432 from `var.db_allowed_cidrs`** (the operator's IPs, set in
tfvars; empty default = nobody), no egress rules, TLS forced via parameter group (D7). A DB
subnet group over the default subnets (RDS requires ≥ 2 AZs even for single-AZ instances).

**Rationale**: FR-006 says "not reachable from the internet at large; allowlisted networks
only" — it does not mandate private IP topology, and the spec's assumptions explicitly defer
the mechanism to the cost mandate. Every private-placement alternative costs more than the
database: a NAT gateway is ~$32/mo + traffic, a bastion ~$4–8/mo + patching, Client VPN
~$75/mo. The allowlisted-public pattern is the standard cheap-dev posture; combined with
deny-by-default SG, forced TLS, encrypted storage, a strong managed password, and disposable
data, the residual risk (endpoint resolvable, connections dropped) is accepted **for dev
only** — the promotion runbook moves higher envs to private subnets when the network slice
exists.

**Alternatives considered**:
- **Minimal custom VPC with private subnets now** — *Rejected.* Either unreachable for the
  operator (no migration/verification path) or reachable only via paid plumbing (NAT/bastion
  > DB cost). Also scope-creeps the future network slice from a cost ticket.
- **EC2 Instance Connect Endpoint as a free tunnel** — *Rejected.* EICE tunnels SSH/RDP
  (ports 22/3389), not PostgreSQL.
- **Publicly open (0.0.0.0/0) with strong auth** — *Rejected outright.* Violates FR-006.

## D5 — Master credential: RDS-managed password in Secrets Manager

**Decision**: `manage_master_user_password = true` (username `effy_admin`, database `effy`).
RDS creates and owns the master secret in **Secrets Manager** (default KMS encryption); the
secret **ARN** — not the value — is published to SSM. No `password` argument exists anywhere
in code or state.

**Rationale**: the password never touches Terraform state (state lives in S3 — keeping
secrets out of it entirely beats guarding them inside it), never appears in code or logs
(FR-007), and rotation becomes a no-code toggle later. Cost: ~$0.40/mo — the one paid
convenience kept, because the alternative saves $0.40 by putting the master password IN the
remote state file. ARCHITECTURE.md's split is honored: **secret material in Secrets
Manager; non-secret config in the parameter store**.

**Alternatives considered**:
- **`random_password` + SSM SecureString (standard tier, $0)** — *Rejected.* $0.40/mo
  cheaper, but the password lands in Terraform state in plaintext; wrong trade even for dev,
  and it normalizes a pattern that must never reach prod.
- **`random_password` + own Secrets Manager secret** — *Rejected.* Same state-exposure
  problem, same $0.40 — strictly worse than the managed option.

## D6 — App↔infra contract: /effy/<env>/db/* in SSM (root-level writes)

**Decision**: extend the 001 SSM contract with five `String` parameters, written as plain
`aws_ssm_parameter` resources in the dev root's `db.tf` (the `region.tf` precedent):

```
/effy/<env>/db/endpoint            # host only
/effy/<env>/db/port                # 5432
/effy/<env>/db/name                # effy
/effy/<env>/db/master_username     # effy_admin
/effy/<env>/db/master_secret_arn   # Secrets Manager ARN (pointer, not secret)
```

**Rationale**: adding keys is the contract's backward-compatible direction (001 rules).
Future consumers (hot path, Goose migration runner, Lambdas) read config by key and fetch
the secret by ARN — no human hand-off (spec SC-004). Writes stay in the env root because
001's `ssm-parameters` module is deliberately auth-shaped (audience-validated); bending it
would weaken its contract. Full details:
[contracts/ssm-parameters.contract.md](./contracts/ssm-parameters.contract.md).

**Alternatives considered**:
- **Generalize 001's `ssm-parameters` module** — *Rejected.* Its audience validation IS its
  contract; a generic param-writer module adds indirection for three resources.
- **A full DSN/URL parameter (with password)** — *Rejected.* Secret in a String param;
  consumers compose the DSN from config + fetched secret instead.

## D7 — Transport security: dedicated parameter group forcing TLS

**Decision**: a module-owned `aws_db_parameter_group` (family `postgres16`) with
`rds.force_ssl = 1`; instance uses it. Non-TLS connections are refused by the engine.

**Rationale**: free, and it converts D4's public-endpoint posture from "TLS if the client
bothers" to "TLS or nothing" — the in-transit counterpart of FR-006. A dedicated parameter
group also gives promotion a home for future per-env tuning without new plumbing.

**Alternatives considered**: default parameter group — *Rejected*, `rds.force_ssl` defaults
to on only in PG15+ default groups on newer RDS… behavior varies by creation path; an
explicit group is deterministic and greppable.

## D8 — Module boundary: `rds-postgres` owns instance + SG + subnet group + parameter group

**Decision**: one new first-party module `infra/modules/rds-postgres` containing the
`aws_db_instance`, its `aws_security_group`, `aws_db_subnet_group`, and
`aws_db_parameter_group`; default-VPC/subnet discovery via data sources inside the module
(`aws_vpc` default + `aws_subnets` defaults), overridable by explicit ids for the future
private-VPC promotion. Composition (SSM writes, outputs) happens only in the env root.

**Rationale**: ARCHITECTURE.md's "one concern each" — the SG/subnet-group/parameter-group
exist solely for this instance; splitting them into modules would be structure without
reuse. The `vpc_id`/`subnet_ids` override variables are the seam the network slice will use
to re-home the DB without touching the module. Modules never call modules — upheld.

**Alternatives considered**: separate `network-boundary` module — *Rejected*, premature; the
real network module arrives in its own slice with actual requirements.

## D9 — Grow-later runbook (spec US3): every lever is a tfvars flip

**Decision**: document in [quickstart.md](./quickstart.md) (operator runbook section) the
exact tfvars change per lever, each independently applicable: instance size
(`db_instance_class`), storage (`db_allocated_storage`, grow-only), durability
(`db_multi_az = true`), backups (`db_backup_retention_days = 7`), protection
(`db_deletion_protection = true`), observability (`db_performance_insights = true`), and —
at promotion — private placement (`db_publicly_accessible = false` + explicit
`vpc_id`/`subnet_ids`). Preview-only demonstration (plan, don't apply) is the SC-006
acceptance.

**Rationale**: "later we can increase resources" is half the mandate; proving reversibility
by plan-preview costs nothing now and de-risks the exit.

## D10 — Versions, lint, safety rails: inherit 001 wholesale

**Decision**: same pins (`>= 1.11.0`, `aws ~> 6.0`), same Makefile targets, same
`AWS_PROFILE=ef` + `allowed_account_ids` + preflight guard, same `default_tags` (FR-009 →
SC-007 falls out of 001's tagging), same `make lint` gate (tflint + trivy — trivy findings
about public access/missing backups on the dev instance get targeted inline ignores with
rationale, mirroring the 001 KMS precedent, since they ARE the documented decision).

---

## Open items intentionally deferred (not blockers)

- **Schema & Goose migrations** — first data-bearing slice (catalog) brings them; this DB
  ships empty.
- **Private networking** — the network slice re-homes the DB via D8's override seam;
  promotion flips `publicly_accessible`.
- **App-scoped DB roles** (least-privilege users per path) — with the first consumer slice;
  master credential is operator-only until then.
- **qa/staging/prod databases** — at promotion, with backups + Multi-AZ + private placement
  revisited per the runbook.

---

### Sources

- [Terraform Registry — `aws_db_instance`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance) — `manage_master_user_password`, `database_insights_mode`, `backup_retention_period = 0` disables automated backups, gp3 minimums.
- [Amazon RDS pricing](https://aws.amazon.com/rds/postgresql/pricing/) — db.t4g.micro + gp3 rates (ap-southeast-1); Extended Support billing model.
- [Amazon RDS for PostgreSQL versions](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html) — PG16 standard-support window.
- [AWS Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/) — $0.40/secret-month.
- [RDS SSL/TLS — `rds.force_ssl`](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html).
