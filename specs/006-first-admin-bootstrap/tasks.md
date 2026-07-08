---
description: "Task list — 006 First Admin Bootstrap (Operator Break-Glass)"
---

# Tasks: First Admin Bootstrap (Operator Break-Glass)

**Input**: Design documents from `/specs/006-first-admin-bootstrap/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md).
Constitution **v1.4.0**.

**Tests**: included (Go module convention + the spec's success criteria demand verification).
**Conventions**: 🧑‍💻 = **operator-run** (touches live Cognito + DB). `[P]` = parallelizable
(different files, no incomplete deps). Everything lives in the **`apis/core-api` Go module** — no
new module, no new deps (its `cognitoidentityprovider` + `config` + pgx are already wired).

---

## Phase 1: Setup

**Purpose**: scaffold the CLI + package + the operator entry point.

- [x] T001 Scaffold the CLI + package skeleton: `apis/core-api/cmd/create-first-admin/main.go` (empty `main` + flag/env stubs) and `apis/core-api/internal/adminbootstrap/{service,cognito,repo}.go` (package + `Input`/`Result` types + the `cognitoClient` interface + empty funcs). Confirm `go build ./...` compiles.
- [x] T002 [P] Add the `create-first-admin` Makefile target (🧑‍💻 OPERATOR) per [contracts/makefile-target.contract.md](./contracts/makefile-target.contract.md): require `EMAIL`+`NAME`, compose `DB_DSN` (`infra/scripts/db-dsn.sh $(ENV)`) + `BACK_OFFICE_POOL_ID` (SSM `/effy/$(ENV)/auth/back-office/user_pool_id`) at invocation, inject as env, `cd apis/core-api && go run ./cmd/create-first-admin --email … --name …`; add to `.PHONY`. Secrets never on argv, never echoed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the schema change + the CLI wiring every story needs.

**⚠️ CRITICAL**: the DB upsert (US1) needs the `name` column; the stories need the wiring.

- [x] T003 Migration (003 workflow): `make db-new name=staff_name`, author `db/migrations/<ts>_staff_name.sql` — `ALTER TABLE admin.staff ADD COLUMN name text;` (Up) / `DROP COLUMN name;` (Down, dev-only). Forward-only. (data-model §2)
- [x] T004 CLI wiring: `apis/core-api/cmd/create-first-admin/main.go` — parse `--email`/`--name`; read env `DB_DSN`, `BACK_OFFICE_POOL_ID`, `AWS_REGION`, `EFFY_ENV` (fail-fast + clear message on any missing required value, no side effects); build `config.LoadDefaultConfig` → `cognitoidentityprovider.NewFromConfig`, a pgx connection from `DB_DSN`, and a zap logger; call `adminbootstrap.Run(ctx, deps, input)`; print the structured result + map errors to a non-zero exit. (plan Project Structure; cli-command contract)

**Checkpoint**: compiles; `create-first-admin` target resolves; the migration is authored.

---

## Phase 3: User Story 1 — Establish the first super-admin, who can sign in and do everything (Priority: P1) 🎯 MVP

**Goal**: one command with email + name → a passwordless CONFIRMED Cognito admin (in the `admin`
group) + an active `admin.staff`/`admin.staff_role('admin')` record keyed on the same `sub` → the
person signs in via EMAIL_OTP and reaches every admin area.

**Independent Test**: quickstart §Run + §Verify — run the command, then sign in as that person and
confirm all admin-gated areas are reachable (SC-002/SC-006).

- [x] T005 [US1] Cognito adapter — create path: `apis/core-api/internal/adminbootstrap/cognito.go` — `AdminCreateUser{ Username: email, MessageAction: SUPPRESS, UserAttributes: [email, email_verified="true", name] }` (**no** `TemporaryPassword` → CONFIRMED — research F2); read `sub` from `User.Attributes` + `username` from `User.Username` (research F3/F5); `AdminAddUserToGroup(username, "admin")`. Behind the `cognitoClient` interface for testing.
- [x] T006 [US1] Repository upsert: `apis/core-api/internal/adminbootstrap/repo.go` — one pgx transaction: upsert `admin.staff (cognito_sub, email, name, status='active') ON CONFLICT (cognito_sub) DO UPDATE …` → id, then `admin.staff_role (staff_id, 'admin') ON CONFLICT DO NOTHING`; explicit param mapping, no ORM. (data-model §4)
- [x] T007 [US1] Service orchestration: `apis/core-api/internal/adminbootstrap/service.go` — `Run`: **Cognito first** (obtain `sub`) → repo upsert keyed on that `sub` → assemble `Result` (data-model §5). This is the FR-006 ordering (plan mechanic).
- [x] T008 [P] [US1] Tests: `internal/adminbootstrap/*_test.go` — `sub`/`username` extraction from a fake `AdminCreateUser` response; the upsert SQL mapping (fake DBTX or local Postgres, gated); the service happy path with a fake Cognito client + repo. (`go test`)
- [ ] T009 [US1] 🧑‍💻 OPERATOR: `make db-up ENV=dev` (the `name` migration) → `make create-first-admin EMAIL=… NAME="…" ENV=dev`; verify per quickstart §Verify — both systems agree (Cognito CONFIRMED + `admin` group; `admin.staff` same `sub`, active, `admin` role) and the person signs in and reaches every admin area (SC-002/SC-006).

**Checkpoint**: the first super-admin exists and can use the back-office end to end.

---

## Phase 4: User Story 2 — Safe and repeatable (Priority: P2)

**Goal**: re-running is safe (idempotent, break-glass restore); bad input is refused with no partial
state; the two systems never end in a half-created state.

**Independent Test**: quickstart §Re-run + §Guardrails — re-run yields no duplicate; a disabled admin
is restored; malformed input refused (SC-003).

- [x] T010 [US2] Idempotent reconcile branch in `cognito.go`: on `AdminCreateUser` → **`UsernameExistsException`** (type-assert the SDK error), `AdminGetUser` (read `sub`, `UserStatus`, `Enabled`) → `AdminEnableUser` if disabled → `AdminAddUserToGroup` (no-op if already a member) → return `{sub, "already-exists"}`. (research F4)
- [x] T011 [US2] Input validation in `main.go`: reject a malformed `--email` and an empty `--name` **before** any Cognito/DB call — clear message, **zero** side effects (FR-005).
- [x] T012 [P] [US2] Tests: the already-exists reconcile branch (fake Cognito raising `UsernameExistsException` → get/enable/add); the repo restoring a `disabled` row to `active` on re-run; validation rejecting malformed email / empty name.
- [ ] T013 [US2] 🧑‍💻 OPERATOR: re-run `make create-first-admin` for the same email → `already-exists`/`updated`, exactly one account/record (SC-003); disable the staff row in SQL, re-run → restored `active` (break-glass); `EMAIL=notanemail` → refused, nothing created.

**Checkpoint**: the tool is safe to re-run and to recover from with confidence.

---

## Phase 5: User Story 3 — Out-of-band, operator-only, and auditable (Priority: P3)

**Goal**: it exists only as an operator command (no API/UI), the grant is auditable, and no secret
material leaks.

**Independent Test**: quickstart §Guardrails — no route/screen exists for it; the grant shows in the
platform record; hygiene grep is clean (SC-004/SC-005).

- [x] T014 [US3] Structured result + logging: the `Result` is printed and zap-logged carrying **`sub` only** as the identity detail (no email/name/DSN/token/password in logs); confirm the make recipe never echoes `DB_DSN`. (FR-008/009; plan telemetry declaration)
- [x] T015 [US3] Verify out-of-band + audit: confirm **no** API route and **no** console screen were added for this (SC-004); the grant is auditable via `admin.staff.created_at` (FR-008); `grep -ri "password\|secret\|BEGIN .*PRIVATE" apis/core-api/cmd apis/core-api/internal/adminbootstrap` → zero literal secrets (SC-005). Record in the sign-off note.

**Checkpoint**: the platform's root-of-admin-trust is minted out-of-band, on the record, cleanly.

---

## Phase 6: Polish & Cross-Cutting

- [x] T016 [P] Lint/test: `make core-lint` (gofmt + `go vet`) + `make core-test` green; `make lint` (repo Terraform) unaffected.
- [ ] T017 Full quickstart pass: SC-001…SC-006 verified + recorded; update CLAUDE.md active-feature status; commit the slice (`apis/core-api/cmd|internal`, the migration, the Makefile delta) alongside `specs/006-first-admin-bootstrap/`.

---

## Dependencies & Execution Order

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks the stories** (T003 migration + T004 wiring).
- **US1 (P3)** → after Foundational. **MVP.** T005→T007 sequential (service needs cognito+repo); T006 ∥ T005 (different files); T008 authored alongside; T009 operator last.
- **US2 (P4)** → after US1 (T010 extends `cognito.go` from T005; T011 extends `main.go` from T004).
- **US3 (P5)** → after US1 (governs how the result/logging is shaped) + US2.
- **Polish (P6)** → last.

### Critical path
Setup → Foundational → **US1 (MVP)** → US2 → US3 → Polish.

### Operator gates (🧑‍💻)
- **T009** — `make db-up` (name migration) + `make create-first-admin` + verify (enables US1).
- **T013** — re-run / break-glass / bad-input verification.

### Parallel opportunities
- Setup: T002 ∥ T001.
- Foundational: T003 ∥ T004.
- US1: T006 ∥ T005; T008 authored in parallel.
- US2: T012 ∥ the code tasks (different test file).
- Polish: T016 ∥ (before T017).

---

## Implementation Strategy

**MVP = US1** (Setup → Foundational → T005–T009): one command establishes a super-admin who can sign
in and do everything — the whole point. Then **US2** (idempotent/break-glass safety) and **US3**
(out-of-band/auditable hygiene) harden it.

---

## Notes
- No new Go dependencies — `apis/core-api` already has `cognitoidentityprovider` + `config` + pgx.
- The `cognito_sub` written to `admin.staff` MUST equal the `sub` from the `AdminCreateUser` response
  (the 005 gate's join key — data-model §3). Read it from the response; never key off email.
- **No `AdminSetUserPassword`** — a no-password user is already CONFIRMED (research F2); adding a
  password would defeat the passwordless design.
- Commit after logical groups; the operator gates (T009/T013) run against live dev.

---

# Amendment: Account Teardown (delete) — appended 2026-07-08

Adds spec **US4 / FR-011–016**. Reuses `internal/adminbootstrap` — **no new deps, no new migration**
(the `admin.staff_role … ON DELETE CASCADE` FK does the record teardown). Plan **Amendment D**;
research **Part G**; data-model **§7**; contracts **cli-delete-command** + **makefile-target**
(delete section). The create tasks (T001–T017) are unchanged.

## Phase 7: User Story 4 — Complete account teardown (delete) (Priority: P2)

**Goal**: `make delete-admin EMAIL=… ENV=dev` completely removes an admin from **both** systems —
confirm-gated, idempotent, and refusing to delete the last active admin without `FORCE=1`.

**Independent Test**: quickstart §Delete — bootstrap a throwaway admin, delete it, confirm it's gone
from both systems + can't sign in (SC-007); re-run → not-found (SC-008); last-admin guard refuses,
`FORCE=1` overrides (SC-009).

- [x] T018 [US4] Cognito delete path in `apis/core-api/internal/adminbootstrap/cognito.go`: extend the `CognitoAPI` interface with `AdminDeleteUser`; add `DeleteAdmin(ctx, email) (sub, username, outcome, err)` — `AdminGetUser(email)` resolves `sub`+`username` (`UserNotFoundException` → outcome `not-found`, empty sub), then `AdminDeleteUser(username)` (`UserNotFoundException` → `not-found`). (research G1)
- [x] T019 [US4] Repo delete + guard in `apis/core-api/internal/adminbootstrap/repo.go`: `IsLastActiveAdmin(ctx, sub) (bool, error)` (true iff the target is an active `admin` and there is no *other* active admin — single query, research G3) + `DeleteAdmin(ctx, sub, email) (outcome, err)` — `DELETE FROM admin.staff WHERE cognito_sub=$1` (role rows cascade), fallback `WHERE email=$1` when `sub` is empty; `0` rows → outcome `not-found`. (research G2; data-model §7)
- [x] T020 [US4] Service delete orchestration in `apis/core-api/internal/adminbootstrap/service.go`: `DeleteResult` type + `Delete(ctx, idp, repo, email, force) (DeleteResult, error)` — validate email → cognito resolve → **guard** (`IsLastActiveAdmin` && !force → refuse with a clear last-admin error) → cognito delete → repo delete → assemble result. Identity-first ordering (plan Amendment D). (FR-014/FR-015)
- [x] T021 [US4] CLI entry `apis/core-api/cmd/delete-admin/main.go`: flags `--email` (required, validated) + `--force`; read env `DB_DSN`/`BACK_OFFICE_POOL_ID`/`AWS_REGION`/`EFFY_ENV` (fail-fast); wire cognito client + pgx + zap (reuse the create wiring); call `adminbootstrap.Delete`; print structured result + non-zero exit on error/guard. Log carries `sub` only (FR-016). (contracts/cli-delete-command)
- [x] T022 [P] [US4] `delete-admin` Makefile target (🧑‍💻 OPERATOR) per [contracts/makefile-target.contract.md](./contracts/makefile-target.contract.md): require `EMAIL`, compose `DB_DSN`+`BACK_OFFICE_POOL_ID` at invocation, **`[y/N]` confirm** (irreversible), pass `--force` when `FORCE=1`, run `go run ./cmd/delete-admin`; add to `.PHONY`.
- [x] T023 [P] [US4] Tests `apis/core-api/internal/adminbootstrap/*_test.go`: `DeleteAdmin` happy path + `UserNotFoundException` idempotency (fake Cognito: get→delete / not-found); `Delete` service — happy, already-gone, and **last-admin guard refuses unless force** (fake idp + fake repo whose `IsLastActiveAdmin` returns true). (`go test`)
- [ ] T024 [US4] 🧑‍💻 OPERATOR: `make create-first-admin` a throwaway admin → `make delete-admin EMAIL=… ENV=dev` → verify gone from Cognito + `admin.staff` + can't sign in (SC-007); re-run → `not-found` (SC-008); with one admin left, delete it → **refused**, then `FORCE=1` overrides (SC-009).

**Checkpoint**: an admin can be completely and safely torn down — the create ↔ delete lifecycle is closed.

## Phase 8: Polish (delete)

- [x] T025 [P] Lint/test: `make core-lint` + `make core-test` green including the new delete unit tests.
- [ ] T026 Delete sign-off: SC-007…SC-009 verified + recorded; update CLAUDE.md 006 status (create ↔ delete lifecycle); commit the delete addition (`cmd/delete-admin`, the `adminbootstrap` delete methods, the Makefile delta) — alongside the create half if not yet committed.

## Delete phase — dependencies & parallelism

- Phase 7 (US4) depends on the create half's Foundational + package (T003–T007) already in place.
- Order: T018 → T020 (service needs cognito+repo); **T019 ∥ T018** (different files); **T021** after T020; **T022 ∥ T023** (Makefile / tests). **T024** operator last.
- MVP of the amendment = T018–T021 + T024 (delete works end to end); T023 tests + T025/T026 harden & close.
- Operator gate (🧑‍💻): **T024** (live delete verification, incl. the last-admin guard).
