# Tasks: Back-Office Team Management (119)

**Input**: `specs/119-backoffice-team-management/`:
- plan.md, spec.md;
- research.md (R1–R14), data-model.md, quickstart.md;
- contracts/team-api.md, contracts/team-screens.md.

**Tests**: included. The safety rules (last admin, not yourself, stale views, one writer) are only proven by tests, and the
repo's guards require them.

**Rules carried in every task**:
- Claude never runs migrations, `terraform apply` or deploys; those go in the hand-off.
- No real-world identifier is guessed. `BACK_OFFICE_URL` comes from Terraform's own output.
- Do not git commit.
- Never edit a committed migration.
- Words shown to people come from the spec, through `@effy/shared-types` `back-office-team.ts`, and nowhere else.

## Phase 1: Setup

- [X] T001 Migration `db/migrations/20261114090000_backoffice_team.sql`, per data-model.md:
  - `admin.staff`:
    - `email` → citext, lower-cased, UNIQUE;
    - status CHECK + `removed`;
    - new columns `revision`, `added_by_sub`, `disabled_at`/`_by_sub`, `removed_at`/`_by_sub`, `invited_at`,
      `invitation_message_id`, `sign_in_issue` (CHECK list), `sign_in_checked_at`;
    - indexes `staff_status_name_idx`, `staff_attention_idx`.
  - New tables `admin.staff_former_subject`, `admin.sign_in_orphan` and `admin.team_check` (one row).
  - Backfill, in this order, each change audited with actor `system:119`:
    1. collapse to the highest role;
    2. add `UNIQUE (staff_id)` on `admin.staff_role`;
    3. disable no-role Active people (`no_role`);
    4. mark non-email `email` rows `email_differs`;
    5. stop with a named error on a duplicate email.
  - `REVOKE ALL … FROM effy_shopper` on the new tables.
  - A full Down.

  Run Goose up / down / up against the local Postgres (memory "Container tests without Docker").
- [X] T002 [P] Terraform, no apply:
  - `infra/envs/dev/amplify-consoles.tf`: add `aws_ssm_parameter` `/effy/dev/web/back_office_url` from the existing
    `back_office_url` value;
  - new `infra/envs/dev/team-alarms.tf`: alarm `TeamSignInStepFailures` (namespace as the edge metrics helper writes it,
    Sum ≥ 1 over 15 min) → the alerts topic;
  - `terraform fmt` + `validate`.
- [X] T003 [P] `packages/shared-types/src/back-office-team.ts`:
  - types `TeamStatus`, `SignInIssue`, `TeamAction`, `TeamMemberDTO`, `TeamMemberDetailDTO`, `NotOnTeamDTO`,
    `TeamListFilters`;
  - word maps `TEAM_STATUS_WORDS`, `SIGN_IN_ISSUE_WORDS` and `TEAM_REFUSAL_WORDS` (the spec's exact sentences: "This
    person is already on the team.", "Effy must always have an active administrator.", "Someone else changed this person.
    Look again.", "An invitation was sent a moment ago.", "Your back-office access has ended. Ask an administrator.");
  - export from the package index;
  - unit test `back-office-team.test.ts` pins every sentence to the spec.
- [X] T004 [P] `packages/shared-types/src/live.ts`: add `"team"` (comment: back-office only) and update `live.test.ts`.
  `packages/shared-types/src/activity-log.ts`: add `"bo-team-member"`:
  - kinds: `access` "Access", `role` "Role", `invitation` "Invitations", `details` "Details", `sign_in` "Sign-in account";
  - subject: null.
- [X] T005 [P] `@effy/email-kit`:
  - templates `packages/email-kit/src/templates/staff-invitation.mjml` and `staff-admin-granted.mjml` (words from
    contracts/team-api.md);
  - catalog entries (`sentBy: "platform"`, audience back-office, vars `role`, `backOfficeUrl` / `name`, `email`,
    `actorName`, `when`);
  - fixtures in `packages/email-kit/src/fixtures/`;
  - regenerate `generated/`;
  - the package's render/snapshot tests pass.
- [X] T006 [P] Stack scaffolding:
  - new `apis/edge-api/admin/serverless.team.yml`, copied from `serverless.messages.yml`: service `effy-edge-admin-team`,
    staff gateway, back-office authorizer, tag `slice: 119-backoffice-team-management`;
  - environment: DB, LIVE, MAIL_* (every key in email-kit's `MAIL_ENV_KEYS`), `BACK_OFFICE_URL:
    ${ssm:/effy/${sls:stage}/web/back_office_url}` (no default), `BACK_OFFICE_USER_POOL_ID`;
  - IAM: `cognito-idp:` AdminCreateUser, AdminGetUser, AdminEnableUser, AdminDisableUser, AdminDeleteUser,
    AdminAddUserToGroup, AdminRemoveUserFromGroup, AdminListGroupsForUser, AdminUserGlobalSignOut, ListUsers and
    ListUsersInGroup on `/effy/${sls:stage}/auth/back-office/user_pool_arn` only; SES send on the identity and the
    configuration set; `cloudwatch:PutMetricData` as the other stacks.
  - `Makefile`: `EDGE_STACK_DIR_admin-team := admin`, `EDGE_STACK_CONFIG_admin-team := serverless.team.yml`, and
    `admin-team` in `EDGE_ALL_SERVICES` right after `admin-messages`. Add it to the `edge-deploy` / `edge-remove` usage
    strings and to the `case` in the deploy-all loop.

**Checkpoint**: schema, words, templates and the empty stack exist.

## Phase 2: Foundational (blocks every story)

- [X] T007 `apis/edge-api/shared/src/team/sign-in.ts`: the back-office pool port (`SignInPort`):
  - methods `create(email, name)` (no message, verified email; `UsernameExistsException` → `get`), `get(usernameOrEmail)`,
    `enable`, `disable`, `delete`, `setGroup(username, role | null)` (remove the other two groups, add one),
    `globalSignOut`, `listAll()` (ListUsers paged, plus ListUsersInGroup × 3 → `{username, sub, email, enabled, groups,
    createdAt}`);
  - a cached client (module singleton), pool id from `BACK_OFFICE_USER_POOL_ID`, error names mapped to typed errors;
  - unit tests with a fake `send`.
- [X] T008 `apis/edge-api/shared/src/team/writer.ts`: the ONE writer (research R5, R7, R12):
  - `withTeamLock(tx)` (`pg_advisory_xact_lock(hashtext('admin.team'))`);
  - `assertRevision`, `assertNotYourself`, `assertAdminsRemain(tx, change)`;
  - `audit(tx, actor, action, staffId, detail)`, which only INSERTs into `admin.audit_log` with `target_type='staff'`;
  - `recordSignInStep(staffId, step, outcome)`, which sets `sign_in_issue` / `sign_in_checked_at` and writes
    `team.sign_in_failed` plus the metric `TeamSignInStepFailures{step}` on failure;
  - `readMember(tx, staffId)` → row mapped to DTO, including invitation delivery via `public.email_delivery_event` on
    `invitation_message_id`.
  - Export through a new `@effy/edge-shared/team` entry in `apis/edge-api/shared/package.json`.
- [X] T009 [P] `apis/edge-api/shared/src/team/rules.ts`: `actionsFor(member, callerSub)` → `TeamAction[]` (rename always;
  role, disable, sign-out only if active and not you; re-enable if disabled; remove if disabled and not you; invite if
  active; repair if `signInIssue`). The writer calls the same predicates, so the screen and server cannot differ.
  `rules.test.ts` is a table test over every status × you/not-you × issue.
- [X] T010 [P] `apis/edge-api/shared/src/team/team.guard.test.ts` fails on:
  - (a) an INSERT/UPDATE/DELETE on `admin.staff`, `admin.staff_role`, `admin.staff_former_subject` or
    `admin.sign_in_orphan` in any `.ts` outside `shared/src/team/` (tests and migrations excepted);
  - (b) an UPDATE or DELETE on `admin.audit_log` anywhere;
  - (c) `groups(event)` in any staff-gateway handler (use `listStacks()` for which stacks are staff);
  - (d) a `back-office/user_pool_arn` IAM grant in any stack but `admin-team`.

  Prove each by breaking it once.
- [X] T011 `apis/edge-api/shared/src/team/team.container.test.ts` (local Postgres):
  - the T001 migration's backfill on seeded rows (multi-role, no-role, UUID email);
  - two concurrent demotions leaving one admin, where exactly one fails `last_admin`;
  - a revision conflict;
  - the `UNIQUE (staff_id)` refusal.
- [X] T012 R1: stop the token from writing the team:
  - `apis/edge-api/admin/src/staff/repository.ts`: delete `upsertOnContact`; add `touchLastSeen(sub)` (UPDATE `last_seen_at`
    WHERE `cognito_sub=$1 AND status='active'`) and `readBySub(sub)`.
  - `apis/edge-api/admin/src/staff/service.ts`: `recordAndLoad` → `loadAndTouch(sub)`.
  - `apis/edge-api/admin/src/functions/back-office-me-v1-get.ts`: no `groups(event)`; no record → 403 `not_on_team`;
    disabled/removed → 403 `staff_disabled`; answer adds `name`.
  - Update `repository.test.ts`. The old list route (`back-office-staff-list-v1-get.ts`) stays in `admin` until T030 moves
    it, so an MVP deploy keeps a working People list.
- [X] T013 [P] `apis/edge-api/shared/src/lib/activity.ts`: `staffNameSql` falls back to `admin.staff_former_subject` →
  `admin.staff`. Test in the existing activity tests.
- [X] T014 `apis/edge-api/admin/src/team/` base:
  - `handler-support.ts`: `guardAdmin(event, scope)` via `hasStaffRole(sub, ["admin"])`; `mapTeamError` (typed refusals →
    409/400/404 with `TEAM_REFUSAL_WORDS`); `respond(member, complete)` with `announce("team")` after commit.
  - `mail.ts`: `sendInvitation` and `sendAdminGranted` via `sendEmail(…, {audience: "back-office"})`, reading
    `BACK_OFFICE_URL` and throwing if unset.
  - `metrics.ts`: `TeamChanges{action, outcome}`.
- [X] T015 Person detail:
  - `apis/edge-api/admin/src/functions/team-member-get-v1.ts` → `GET /admin/v1/staff/{staffId}` (404 for an unknown id),
    returning `TeamMemberDetailDTO` with `actions` from T009, in `serverless.team.yml`;
  - `apis/edge-api/shared/src/live/change-map.guard.test.ts`: register the team routes as announcing `team` (T020+ add their
    entries as they land).
- [X] T016 [P] Back-office base:
  - rename `apps/back-office/src/features/staff-identity/` → `features/team/` and fix imports (`routes/settings.tsx`, tours,
    tests);
  - `features/team/repo.ts` and `queries.ts` with keys under `["back-office", "team"]`;
  - `apps/back-office/src/features/live/routes.ts`: `team` → `[["back-office", "team"]]`.
- [X] T017 Person page:
  - `apps/back-office/src/features/team/PersonScreen.tsx` per contracts/team-screens.md: head with the name, email and status
    word; More menu → Activity (wired in US4); Details panel rows; the "Yourself" line; `DetailPageSkeleton` with labels;
    buttons rendered only from `member.actions`, each a slot the stories fill;
  - route `/settings/team/$staffId` in `apps/back-office/src/routes/settings.tsx`;
  - list rows link to it;
  - `useTourPage("admin-person", …)` and the `data-tour` keys.
- [X] T018 [P] Access ended: in `apps/back-office/src/lib/api.ts` (or wherever the shell reads `/me` errors), a 403 with type
  `not_on_team` or `staff_disabled` signs out through Amplify and shows sign-in with `TEAM_REFUSAL_WORDS.accessEnded`.
  Add a test.

**Checkpoint**: the record is the only source of roles; a person's page can be opened; nothing yet changes the team.

## Phase 3: User Story 1 - Add a team member (P1) 🎯 MVP

**Goal**: an Administrator adds a person with any role, optionally invited; the person signs in with a code at once.
**Independent test**: quickstart walk rows 1–3, 6 and 11.

- [X] T019 [US1] `writer.ts` `addMember(tx, actor, {email, name, role, sub})` (insert; or re-add a removed record: move the
  old sub to `staff_former_subject`, clear removed fields, `team.readded`), plus `findByEmail`. Refusals:
  `already_on_team`, `disabled_on_team{memberId}`. Unit and container tests, including a re-add keeping the old actions
  named.
- [X] T020 [US1] `apis/edge-api/admin/src/team/service.ts` `add()`:
  1. validate: email shape (any domain), name 1–120 after trim, role;
  2. `SignInPort.create` (adopts on exists);
  3. transaction `addMember`;
  4. after commit: `setGroup` → `recordSignInStep`;
  5. if `invite`: `sendInvitation` → store `invited_at` / `invitation_message_id` + `team.invited`;
  6. if role admin: `sendAdminGranted` to every other active admin.

  Returns `complete`. Service tests with fake port and mail.
- [X] T021 [US1] Handler `apis/edge-api/admin/src/functions/team-member-create-v1.ts` → `POST /admin/v1/staff`
  (`serverless.team.yml`); change-map entry.
- [X] T022 [US1] `apps/back-office/src/features/team/dialogs/AddPersonDialog.tsx`:
  - fields: email, name, role radio (each with one line from `PERMISSIONS`), "Email them an invitation" ticked;
  - in-place refusals: "Open them" link; "Re-enable them instead" opens the Re-enable dialog (US2);
  - `complete:false` toast;
  - the **Add person** button in the `TeamScreen.tsx` head (`data-tour="access.add"`);
  - screen test.

**Checkpoint**: MVP. People can be added with any role without the operator.

## Phase 4: User Story 2 - Disable and re-enable (P1)

**Goal**: access stops at once and comes back with the same role.
**Independent test**: walk rows 7–9 and 13.

- [X] T023 [US2] `writer.ts` `setStatus(tx, actor, staffId, 'active'|'disabled', {role?, expectedRevision})`:
  - lock, revision and not-yourself checks; `assertAdminsRemain` on disable;
  - re-enable requires a role when none is held (`role_required`);
  - sets or clears `disabled_at` / `_by_sub`; audits `team.disabled` / `team.enabled`.

  Container test: disabling the last admin is refused.
- [X] T024 [US2] `service.ts` `setStatus()`: after commit, on disable `SignInPort.disable` + `globalSignOut`; on enable
  `enable` + `setGroup`, then `recordSignInStep`; if re-enabled as admin, `sendAdminGranted`. Handler
  `team-member-status-v1.ts` → `POST /admin/v1/staff/{staffId}/status`, with its change-map entry.
- [X] T025 [US2] `dialogs/DisableDialog.tsx` (AlertDialog, the spec's sentence) and `dialogs/ReenableDialog.tsx` (role radio
  only when `role === null`), wired into `PersonScreen.tsx` (`data-tour="person.disable"`). `staff_changed` → message +
  re-read. Screen test.

## Phase 5: User Story 3 - Change a role (P1)

**Goal**: one role, in force on the next action; lowering signs out; new admins are announced.
**Independent test**: walk rows 4–6.

- [X] T026 [US3] `writer.ts` `changeRole(tx, actor, staffId, role, expectedRevision)`: active only (`not_active`), not
  yourself, `assertAdminsRemain` when leaving admin; replace the single `staff_role` row; `team.role_changed {from, to}`;
  `isLowering(from, to)` helper. Tests.
- [X] T027 [US3] `service.ts` `changeRole()`: after commit `setGroup`; if lowering, `globalSignOut`; if raised to admin,
  `sendAdminGranted`. Handler `team-member-role-v1.ts` → `PUT /admin/v1/staff/{staffId}/role`, with its change-map entry.
- [X] T028 [US3] `dialogs/ChangeRoleDialog.tsx`: the lowering line "They will be signed out everywhere."; `data-tour="person.role"`.
  Screen test.
- [X] T029 [P] [US3] `apps/back-office/src/features/team/TeamScreen.tsx` Roles tab and `components/shell/ShellDialogs.tsx`:
  show a single role (`ROLE_WORDS[role]`), no join. `PERMISSIONS` unchanged (FR-033).

## Phase 6: User Story 4 - Find a person and see their activity (P2)

**Goal**: the standard list, and the person's log in the one drawer.
**Independent test**: walk row 10's filters, plus acceptance US4-1…5.

- [X] T030 [US4] `apis/edge-api/admin/src/team/list.ts`:
  - `TEAM_LIST_SPEC` (`parseListQuery`): search over `name`/`email`; filters `role` and `status` (`never` = `last_seen_at IS
    NULL AND status='active'`, `attention` = `sign_in_issue IS NOT NULL`); sorts `name|role|lastSeen|added`, each ending in
    `id`;
  - removed people are excluded unless `status=removed`;
  - raw-SQL repository; `notOnTeam` from `admin.sign_in_orphan`; `checkedAt`.
  - Handler `team-list-v1.ts` → `GET /admin/v1/staff` in `serverless.team.yml`. In the same change, delete
    `back-office-staff-list-v1-get.ts` and its function from `apis/edge-api/admin/serverless.yml`. Deploy order: `admin`
    first, which frees the route key, then `admin-team`.
  - `list-query.guard.test.ts` passes. Repository container test.
- [X] T031 [US4] `TeamScreen.tsx` People tab → `DataTable` with search "Search name or email", Role and Status facets
  (`data-tour="access.status"`), and columns Person · Role · Status (+ Needs attention word) · Last seen ("Never signed in")
  · Added. URL state through `use-list-state`. The `list-screens.guard` and `skeletons.guard` tests pass.
- [X] T032 [US4] Activity:
  - `apis/edge-api/admin/src/team/activity.ts` `teamMemberActivitySource(staffId)` over `admin.audit_log WHERE
    target_type='staff' AND target_id=$1`, with words for every `team.*` action, actor via `staffNameSql` ("Operator" for
    `operator`, "Effy" for `system:119`);
  - handler `team-member-activity-v1.ts` → `GET /admin/v1/staff/{staffId}/activity` via `activityResponse(…,
    "bo-team-member", …)`;
  - `PersonScreen.tsx` More → Activity opens `ActivityLogDrawer`;
  - the `activity.guard` and `activity-logs.guard` tests pass.
- [X] T033 [P] [US4] The live re-read: a test that a `team` update invalidates the list and the open person page (no
  `refetchInterval`; `scripts/check-no-refresh-timers.sh` passes).

## Phase 7: User Story 5 - Remove for good (P2)

**Goal**: a disabled person is removed; the record and their name stay.
**Independent test**: walk row 10.

- [X] T034 [US5] `writer.ts` `remove(tx, actor, staffId, expectedRevision)`: disabled only (`not_disabled`), not yourself;
  sets `removed_at` / `_by_sub`; `team.removed`. `service.ts` `remove()`: after commit `SignInPort.delete` →
  `recordSignInStep`. Handler `team-member-remove-v1.ts` → `DELETE /admin/v1/staff/{staffId}`, with its change-map entry.
  Tests.
- [X] T035 [US5] `dialogs/RemoveDialog.tsx` (AlertDialog, the spec's sentence); after removal the page shows Removed (by,
  when). Screen test.

## Phase 8: User Story 6 - Send the invitation again, sign out everywhere (P2)

**Goal**: resend with a 5-minute limit and visible delivery; end sessions without changing access.
**Independent test**: walk row 16, plus US6-3/4.

- [X] T036 [US6] `writer.ts` `noteInvitation(tx, actor, staffId, messageId)`, which refuses `invited_recently` when
  `invited_at > now() - interval '5 minutes'` (under the lock), and `noteSignedOut`. `service.ts` `invite()` and
  `signOut()` (`signOut` answers 502 `sign_in_unavailable` if the pool call fails). Handlers `team-member-invite-v1.ts` →
  `POST …/{staffId}/invitation` and `team-member-sign-out-v1.ts` → `POST …/{staffId}/sign-out`, with their change-map
  entries. Tests.
- [X] T037 [US6] `PersonScreen.tsx`:
  - **Send invitation** / **Send invitation again** (`data-tour="person.invite"`);
  - **Sign out everywhere** (AlertDialog);
  - Details row "Last invitation": when, and Delivered / Not delivered from `invitation.delivery`.

  Screen test.

## Phase 9: User Story 7 - Repair disagreements (P3)

**Goal**: disagreements are visible and repairable; accounts with no record are handled.
**Independent test**: walk rows 14–15.

- [X] T038 [US7] `apis/edge-api/shared/src/team/check.ts` `checkSignIn(tx, port, {force})`:
  - skip if `team_check.checked_at` < 60 s ago;
  - `listAll()` → for each record, set `sign_in_issue` (`missing`, `enabled_while_off`, `disabled_while_on`,
    `group_differs`, `email_differs`; `no_role` kept);
  - rewrite `sign_in_orphan`;
  - stamp `team_check`.

  Also `checkOne(staffId)`, used after every action and by Repair. Unit tests over every issue.
- [X] T039 [US7] `writer.ts` `repair(tx, actor, staffId, expectedRevision)`: the steps that make the account match the
  record:
  - create the account if missing (new sub → `former_subject`);
  - enable or disable;
  - `setGroup`;
  - copy the pool's email onto `email_differs` rows;
  - write `team.repaired {issue, steps}`.

  `deleteOrphan(username)` refuses `has_record` and writes `team.orphan_deleted`. The add route (T020) adopts an orphan
  (`team.added {adopted:true}`).
- [X] T040 [US7] Handlers:
  - `team-sign-in-check-v1.ts` → `POST /admin/v1/staff/sign-in-check`;
  - `team-member-repair-v1.ts` → `POST …/{staffId}/repair`;
  - `team-sign-in-account-delete-v1.ts` → `DELETE /admin/v1/staff/sign-in-accounts/{username}`.

  Change-map entries for each.
- [X] T041 [US7] Back-office:
  - `TeamScreen.tsx` calls `sign-in-check` on open, then reads the list;
  - the **Not on the team** panel (`data-tour="access.attention"`) with **Add to the team** (opens AddPersonDialog with the
    email filled in) and **Delete sign-in account** (AlertDialog);
  - `PersonScreen.tsx` Needs attention panel with the `SIGN_IN_ISSUE_WORDS` sentence and **Repair**.

  Screen tests.

## Phase 10: User Story 8 - Names (P3)

**Goal**: anyone fixes their own name; an Administrator fixes anyone's.
**Independent test**: walk row 17.

- [X] T042 [US8] `writer.ts` `rename(tx, actor, staffId, name, expectedRevision?)` → `team.renamed {from, to}`. Handlers:
  - `team-member-rename-v1.ts` → `PATCH /admin/v1/staff/{staffId}` (admin);
  - `team-me-rename-v1.ts` → `PATCH /admin/v1/me` (any active person, their own record).

  Change-map entries. Tests.
- [X] T043 [US8] `dialogs/RenameDialog.tsx`, used by `PersonScreen.tsx` (the Edit button on the name row) and by
  `components/shell/ShellDialogs.tsx` (the Your back-office record Name row). There is no email edit: the line "To change
  an email, add the new address and disable the old one." Screen test.

## Phase 11: Polish & cross-cutting

- [X] T044 FR-034, the break-glass tool:
  - `apis/edge-api/ops/src/admin-bootstrap.ts`, `create-first-admin.ts` and `delete-admin.ts` call `@effy/edge-shared/team`
    (`addMember` / `setStatus` / `remove` with actor `operator`, the `SignInPort`). The last-admin refusal is kept (`--force`
    still overrides delete, through a writer flag that is audited).
  - Update the ops tests.
  - Update the Makefile help text: "create a back-office Administrator (break-glass)".
- [X] T045 [P] Tours:
  - in `specs/107-backoffice-guided-tours/spec.md`, replace "AA - Team and access" with spec FR-036's table and add "AP - A
    team member";
  - in `apps/back-office/src/features/tours/tours.ts`, `admin-access` version 3 with five steps (step 4 shown only when
    there are orphans or issues) and a new `admin-person` (path `/settings/team/$staffId`, roles `["admin"]`, step limits
    as the table says);
  - `tours.test.ts` and `tours.guard.test.ts` pass.
- [X] T046 [P] Name readers that bypass `staffNameSql` (research R4): move the actor-name joins in
  `apis/edge-api/shared/src/delivery/override.ts`, `apis/edge-api/admin/src/deliverability/repository.ts`,
  `apis/edge-api/fleet/src/dispatch/sql.ts`, `apis/edge-api/admin/src/feedback/authz.ts` and the `catalog` repositories (find
  them with `git grep "admin.staff [a-z]* ON .*cognito_sub"`) onto `staffNameSql`. Authz joins stay as they are: they want
  the current subject.
- [X] T047 [P] Telemetry and docs:
  - `team_member_added` / `team_member_changed {action, role}` in `docs/telemetry/platform-events.md` and the back-office
    typed taxonomy, fired from the dialogs;
  - in `docs/api/path-assignment.md`, the `admin-team` row and a note: staff 240 → 253/300, and the next staff-routes
    feature amends the constitution for a third gateway first.
- [X] T048 Run every guard and suite:
  - `pnpm --filter @effy/edge-shared test` (gateway capacity must print staff 253/300);
  - the admin and ops tests;
  - `pnpm --filter back-office test` + typecheck + build;
  - `pnpm --filter @effy/shared-types test`;
  - `pnpm --filter @effy/design-system test`;
  - `scripts/check-no-refresh-timers.sh`.

  Fix what fails.
- [X] T049 Records:
  - add a FEATURE-HISTORY.md entry for 119 (newest first): what changed, the R1 pivot, the backfill's disabled people, deploy
    order from plan.md, "not migrated, deployed or walked";
  - in the CLAUDE.md feature list, add `119-backoffice-team-management`, and change "Auth" to say the staff record is the
    origin of a back-office role and `/me` no longer creates records;
  - update the memory file.

## Dependencies

- **Phase 1 → Phase 2 → stories.** T008 needs T001 and T003; T012 needs T001; T015–T017 need T008, T009 and T014.
- **US1** (T019–T022) needs only Phase 2. It is the MVP.
- **US2, US3, US5, US6 and US8** each need Phase 2 only. They touch `writer.ts`, `service.ts` and `PersonScreen.tsx` in
  separate functions or slots, so work them one after another or merge with care.
- **US4**'s list (T030/T031) moves the list route from `admin` to `admin-team`. Until it lands, the old read-only list keeps
  working (T012 leaves it alone).
- **US7** needs T020 (adopting an orphan) for "Add to the team".
- **Polish**: T044 needs T019, T023 and T034. T045 needs T017, T022, T031 and T041. T048 and T049 come last.

## Parallel examples

- **Phase 1**: T002, T003, T004, T005 and T006 together (different files). T001 alone.
- **Phase 2**: T009, T010, T013, T016 and T018 together once T008 is drafted.
- **After Phase 2**: backend tasks of US2 (T023/T024), US3 (T026/T027) and US6 (T036) can be written side by side in one
  file only by one person. In practice, run the stories in order P1 → P3 and parallelise the web dialogs (T025, T028, T035,
  T043) against the next story's backend.
- **Polish**: T045, T046 and T047 together.

## Implementation strategy

1. **MVP = Phase 1 + Phase 2 + US1.** Administrators can add Managers and Customer support people. The R1 fix ships with it,
   so roles can no longer be overridden by the token.
2. **Then US2 + US3** (the other P1s): stop access and change roles. This is the minimum for running a real team.
3. **Then US4, US5 and US6** (P2), then **US7 and US8** (P3), then Polish.
4. Hand off with plan.md's deploy order. Nothing is deployed by Claude.
