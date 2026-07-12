# Data Model: Cost-Minimized Development Database

For this infra slice the "entities" are Terraform resources, the module shape, and the
runtime contract values. Maps the spec's Key Entities (Database Instance, Cost Posture,
Access Credential, Connection Contract Values, Network Boundary) onto concrete constructs.
Exact attributes live in the module files; this fixes shapes, relationships, and rules.

---

## E1 — Database Instance (`aws_db_instance` via `modules/rds-postgres`)

| Field | Value (dev) | Rule / Source |
|---|---|---|
| identifier | `effy-dev-db` | `<name_prefix>-db` (001 naming D9) |
| engine / version | `postgres` / `16` (major-pinned) | constitution lock; auto minor upgrades ON (research D1) |
| instance_class | `db.t4g.micro` | directive #1; tfvars lever |
| allocated_storage / type | `20` / `gp3` | directives #2; grow-only lever; no autoscaling |
| multi_az | `false` | directive #3; promotion lever |
| db_name / master username | `effy` / `effy_admin` | created at provision |
| manage_master_user_password | `true` | password never in code/state (research D5) |
| storage_encrypted | `true` (default KMS) | free; always on |
| publicly_accessible | `true` (dev ONLY) | research D4; promotion flips false |
| deletion_protection | `false` (dev) | disposable data; promotion lever |
| parameter group | E5 (forced TLS) | research D7 |

**Relationships**: joined to E2 (boundary), E5 (parameter group); emits E3 (credential) and
feeds E4 (contract values). **State transitions**: `authored → planned → applied (dev)`;
promotion = re-instantiation per env with levers flipped.

## E2 — Network Boundary (`aws_security_group` + `aws_db_subnet_group`)

| Field | Value | Rule |
|---|---|---|
| SG name | `effy-dev-db` | ingress: TCP/5432 from `var.db_allowed_cidrs` ONLY |
| default ingress | none (`db_allowed_cidrs = []` ⇒ nobody) | deny-by-default (FR-006) |
| egress | none defined | RDS initiates nothing |
| subnet group | default-VPC subnets (data-sourced) | ≥2 AZs required by RDS; override seam `vpc_id`/`subnet_ids` for the network slice (research D8) |

**Rule**: `0.0.0.0/0` (or `::/0`) in `db_allowed_cidrs` is rejected by variable validation —
the module cannot express "open to the internet" (FR-006 structurally).

## E3 — Access Credential (RDS-managed secret)

| Field | Value | Rule |
|---|---|---|
| location | Secrets Manager (RDS-owned secret) | never in code, state, logs, SSM values (FR-007) |
| encryption | default KMS | $0 |
| published as | ARN pointer in E4 | consumers fetch by ARN with their own IAM |
| rotation | available, OFF in dev | promotion lever; $0 while off |

## E4 — Connection Contract Values (SSM, written by the dev root)

| Parameter | Type | Example |
|---|---|---|
| `/effy/dev/db/endpoint` | String | `effy-dev-db.xxxx.ap-southeast-2.rds.amazonaws.com` |
| `/effy/dev/db/port` | String | `5432` |
| `/effy/dev/db/name` | String | `effy` |
| `/effy/dev/db/master_username` | String | `effy_admin` |
| `/effy/dev/db/master_secret_arn` | String | `arn:aws:secretsmanager:…` (pointer, not secret) |

**Rules**: `String` only — no secret material; the ARN is a reference. Adding keys =
backward-compatible; renaming = breaking (001 contract law). Writer: dev root `db.tf` only.

## E5 — Engine Parameter Group (`aws_db_parameter_group`)

| Field | Value | Rule |
|---|---|---|
| family | `postgres16` | tracks engine major |
| `rds.force_ssl` | `1` | non-TLS connections refused (research D7) |

## E6 — Cost Posture (the verifiable all-off set)

The flag set from research D3, exposed 1:1 as module variables with cheap defaults; its
live verification procedure is
[contracts/cost-posture.contract.md](./contracts/cost-posture.contract.md). This entity IS
spec US2 — configuration as a checkable object, not a hope.

---

## Entity → requirement traceability

| Entity | Satisfies |
|---|---|
| E1 Instance | FR-001, FR-002, FR-003, FR-004, FR-011 |
| E2 Boundary | FR-006 |
| E3 Credential | FR-007 |
| E4 Contract values | FR-008 |
| E5 Parameter group | FR-006 (in-transit) |
| E6 Cost posture | FR-005, FR-010 |
| 001 default_tags (inherited) | FR-009 |
