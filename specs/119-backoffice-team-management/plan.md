# Implementation Plan: Back-Office Team Management

**Branch**: `119-backoffice-team-management` (work on `dev`) | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/119-backoffice-team-management/spec.md`

## Summary

Settings › Team and access becomes the place where Administrators manage the back-office team. It covers adding people with
any of the three roles (with an optional invitation email), changing a role, disable and re-enable, remove (the record is
kept), sign out everywhere, rename, and a person's page with their activity. The safety rules are enforced on the server:
always one active administrator, never act on yourself, Administrators only, stale changes refused. A check compares the
sign-in pool with the records and shows every disagreement, with a Repair.

The pivot is **R1**. Today `/me` creates a record for any token and rewrites the person's roles from the token's groups on
every load, so a role set on the platform would not survive the next page load. After 119 the **record is the origin and the
authority**. `/me` only reads it and marks last seen. The pool group is written by the same writer at the same time, as a
mirror.

The pieces:
- **Backend.** One writer, `@effy/edge-shared/team` (R12), used by a new stack **`admin-team`** (13 new routes, plus the moved
  list route; staff gateway 240 → **253/300**, R11) and by the operator tool, which moves onto it. One migration covers single
  role, the `removed` status, the revision, invitation fields, sign-in issues, the orphan table and former subjects, with a
  backfill that disables people who hold no role (R3).
- **Web.** The People list becomes 103's `DataTable` with facets. There is a new person page with dialogs. Add person,
  Rename in Your back-office record, access-ended handling, the live kind `team`, and two tours (one rewritten, one new).
- **Email.** Two `@effy/email-kit` templates (invitation, new administrator), with delivery read from the existing SES events.

## Technical Context

**Language/Version**: TypeScript (Node 22 Lambdas; React 19 + Vite back-office), SQL (PostgreSQL 16, Goose), Terraform

**Primary Dependencies**:
- `@aws-sdk/client-cognito-identity-provider` (already in `admin` and `ops`);
- `@effy/email-kit`;
- `@effy/edge-shared`: `list-query`, `activity`, `live`, and the new `team`;
- `@effy/web-kit`: `data-table`, `activity-log`, `patterns`, `tour`;
- `@effy/design-system/ui`, TanStack Query and Router.

**Storage**: PostgreSQL, schema `admin`:
- `staff` gains columns (single role via `staff_role UNIQUE(staff_id)`, `removed` status, revision, added/disabled/removed by,
  invitation, sign-in issue);
- new tables `staff_former_subject`, `sign_in_orphan` and `team_check`.

See [data-model.md](data-model.md).

**Testing**:
- vitest units;
- container tests on the local Postgres: the last-admin race, revision, backfill, re-add;
- guards: `team.guard.test.ts` (new), `change-map`, `activity`, `list-query`, `gateway-capacity`, `tours`, `skeletons`,
  `list-screens`, `activity-logs`;
- back-office screen tests.

**Target Platform**: AWS Lambda (ap-southeast-2) behind the staff gateway; back-office on Amplify Hosting

**Project Type**: monorepo (backend + one web console)

**Performance Goals**:
- A disable or role change is in force on the person's next request, which SC-002 bounds at 5 seconds. Every gate reads the
  record per request, so the only delay is the commit.
- The sign-in check makes at most 1 + ⌈users/60⌉ + 3 pool calls and is skipped within 60 seconds of the last one.

**Constraints**:
- No always-on compute.
- No third gateway (headroom stays under 112's ~255 line).
- No scheduled function.
- No `refetchInterval`.
- No change to the three roles or their permissions.
- Every real-world identifier stays operator-supplied: the back-office URL is read from Terraform's own output, never typed.

**Scale/Scope**: tens of people; 14 routes (13 new); 1 migration; 2 email templates; 2 screens plus 6 dialogs; 2 tours;
1 live kind; 1 activity log.

## Constitution Check

| Principle | How this plan complies | Gate |
|---|---|---|
| I. Spec-Driven | spec (with clarifications) → plan → tasks. The no-role decision went back into the spec (FR-035, SC-007) | PASS |
| II. Monorepo, shared contracts | DTOs, status, issue and refusal words live once in `@effy/shared-types` `back-office-team.ts`. The writer lives once in `@effy/edge-shared/team`, used by both the routes and `ops`. The list and log are 103/104's shared pieces | PASS |
| III. Single serverless backend | **Service**: `admin` (the back-office audience, staff domain), deployed as a fourth stack, **`admin-team`**, from the same `admin/src`, because the `admin` stack is at CloudFormation's 500-resource limit (as `admin-promotions` and `admin-messages` were). **Gateway: staff.** 240 → 253/300 (84%), under the 90% stop and 112's ~255 line. No route merged to fit. **The next feature adding staff routes must amend the constitution for a third gateway first** (recorded in path-assignment.md) | PASS |
| IV. Auth isolation | Back-office pool only. The staff record is authoritative: it now also stops `/me` from overriding it with the claim, which IV already requires. The group is still written for every assignment, as the shop pool has done since 009 (R1). Passwordless codes unchanged. No self-signup: only an Administrator or the operator adds people | PASS |
| V. Native feel / design | shadcn controls as-is. Dialog and AlertDialog on the one backdrop. No cards: detail rows and panels. Skeletons in the page's shape. Tours on 106's pieces with the spec's words | PASS |
| VI. Layered architecture | Handler → `team/service.ts` → `@effy/edge-shared/team` writer (raw SQL) + `sign-in.ts` port (pool). Rows are mapped to DTOs in the repository. Wiring is explicit. The web treats the query cache as the source of truth; dialogs hold only form state | PASS |
| VII. Observability | Structured logs per action (no email in log fields: `staffId` only). Metrics `TeamChanges{action, outcome}` and `TeamSignInStepFailures{step}`. **One alarm**: `TeamSignInStepFailures ≥ 1 in 15 min` → the alerts topic (Terraform), because a failed step leaves a disagreement someone must repair. Telemetry `team_member_added` / `team_member_changed` with `{action, role}`, no PII (docs/telemetry/platform-events.md) | PASS |
| Real-World Identifiers | No address is invented. The invitation is sent to the address an administrator typed, from the existing `MAIL_SENDER`. `BACK_OFFICE_URL` is a new SSM parameter written from Terraform's existing `back_office_url` output, required with no default. No new mailbox | PASS |

No violations. Complexity Tracking: none.

## Project Structure

### Documentation (this feature)

```text
specs/119-backoffice-team-management/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R14
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── team-api.md
│   └── team-screens.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/20261114090000_backoffice_team.sql         # schema + backfill (data-model.md)

packages/shared-types/src/back-office-team.ts            # DTOs, TEAM_STATUS_WORDS, SIGN_IN_ISSUE_WORDS, TEAM_REFUSAL_WORDS
packages/shared-types/src/live.ts                        # + "team"
packages/shared-types/src/activity-log.ts                # + "bo-team-member"
packages/email-kit/src/templates/staff-invitation.mjml   # + catalog entries
packages/email-kit/src/templates/staff-admin-granted.mjml

apis/edge-api/shared/src/team/                           # @effy/edge-shared/team - ONE writer
├── writer.ts            # add/readd/role/status/remove/rename/signed-out/repair/orphan; lock; last-admin; revision; audit
├── sign-in.ts           # back-office pool port (create/get/enable/disable/delete/groups/global sign-out/list)
├── check.ts             # pool ↔ records comparison (R6)
├── rules.ts             # actionsFor(member, caller) - the same rules the writer enforces
├── team.guard.test.ts
└── *.test.ts, team.container.test.ts
apis/edge-api/shared/src/lib/activity.ts                 # staffNameSql falls back to staff_former_subject

apis/edge-api/admin/serverless.team.yml                  # NEW stack admin-team (staff gateway)
apis/edge-api/admin/serverless.yml                       # - backOfficeStaffListV1 (moved)
apis/edge-api/admin/src/team/                            # service, list (ListSpec), activity source, mail, handler-support
apis/edge-api/admin/src/functions/team-*.ts              # 14 thin handlers
apis/edge-api/admin/src/staff/                           # /me: read + last seen only (R1); recordAndLoad removed
apis/edge-api/ops/src/admin-bootstrap.ts                 # onto @effy/edge-shared/team (FR-034)

apps/back-office/src/features/team/                      # renamed from staff-identity
├── TeamScreen.tsx       # list, Not on the team panel, Add person
├── PersonScreen.tsx     # a team member
├── dialogs/             # Add, ChangeRole, Disable, Reenable, Remove, SignOut, Rename
├── queries.ts, repo.ts, access.ts
apps/back-office/src/routes/settings.tsx                 # + /settings/team/$staffId
apps/back-office/src/components/shell/ShellDialogs.tsx   # Rename yourself; one role
apps/back-office/src/lib/api errors                      # not_on_team / staff_disabled → sign out
apps/back-office/src/features/live/routes.ts             # team → ["back-office","team"]
apps/back-office/src/features/tours/tours.ts             # admin-access v3, admin-person
specs/107-backoffice-guided-tours/spec.md                # AA replaced, AP added (tours.test reads it)

infra/envs/dev/amplify-consoles.tf                       # + aws_ssm_parameter /effy/dev/web/back_office_url
infra/envs/dev/alarms (team)                             # TeamSignInStepFailures alarm
Makefile                                                 # admin-team in EDGE_STACK_* and EDGE_ALL_SERVICES (after admin)
docs/api/path-assignment.md                              # admin-team rows; staff 253/300; third gateway next
```

**Structure Decision**: extend the `admin` service (the back-office audience's own service for staff and platform settings)
as a new stack `admin-team`, put the writer in the shared library because `ops` writes the team too, and keep the screens in
one back-office feature folder.

## Phases

- **Phase 0**: [research.md](research.md), R1–R14. No NEEDS CLARIFICATION remains. The email-domain question was answered
  "any address"; the no-role question is answered in R3 and in the spec.
- **Phase 1**: [data-model.md](data-model.md), [contracts/team-api.md](contracts/team-api.md),
  [contracts/team-screens.md](contracts/team-screens.md), [quickstart.md](quickstart.md).

### Post-design Constitution re-check

The design adds one stack on the staff gateway (within capacity), one writer in the shared library, one migration, two email
templates, one live kind and one alarm. There is no new compute, gateway or audience. The auth change narrows access: no
token-made records, and no claim overriding the record. **PASS.**

## Risks

- **R1 changes every back-office load.** If `/me` is deployed before the migration, a person with several roles keeps them all
  until the migration collapses them (harmless). If the migration runs first, nothing reads the new columns yet (harmless).
  The order below is still the safe one.
- **The people disabled by the backfill** (no role) lose read access at migration time. List them before migrating (the
  quickstart query) and tell them.
- **Staff gateway at 253/300.** The third-gateway amendment is the next staff-routes feature's first task.

## Deploy order (for the hand-off)

1. `make apply ENV=dev`: SSM `back_office_url`, the team alarm.
2. `make db-up ENV=dev`: `20261114090000_backoffice_team.sql`.
3. `make edge-deploy SERVICE=admin ENV=dev`: drops the list route; `/me` no longer writes roles.
4. `make edge-deploy SERVICE=admin-team ENV=dev`: the new stack (claims `GET /admin/v1/staff`).
5. Any other stack using `@effy/edge-shared` that `staffNameSql` changes reach (orders, fleet, catalog, admin-messages,
   admin-promotions): `make edge-deploy-all ENV=dev` is simplest.
6. Push `dev` → back-office.
7. Walk [quickstart.md](quickstart.md).
