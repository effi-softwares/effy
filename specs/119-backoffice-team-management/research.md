# Research: Back-Office Team Management (119)

Each entry is a decision the plan rests on, what it was measured against, and what was rejected. Facts quoted from the tree
were read on 2026-11-13.

## R1 - Where the role comes from (the record, not the sign-in account)

**Found.** `back-office-me-v1-get.ts` calls `recordAndLoad(sub, username, groups(event))` →
`staff/repository.ts` `upsertOnContact`, which **inserts a record for any token it has not seen** and **deletes every
`staff_role` the token's `cognito:groups` does not carry**. So today:
- a role changed on the platform would be undone on the person's next `/me` (every back-office load calls it);
- any account in the back-office pool gets an Active record on first contact; `isActiveStaff` (the read gate in
  `shared/src/lib/back-office-authz.ts`) then lets it read every page, even with no role.

**Decision.** `/me` stops writing roles and stops creating records. It reads the record and touches `last_seen_at` only
(an `UPDATE … WHERE cognito_sub = $1 AND status = 'active'`). No record → `/me` answers 403 `not_on_team`, and every gate
already refuses (they all read `admin.staff`). The record becomes the origin AND the authority for a back-office role; the
pool group is written by the same writer at the same time, as a mirror (R5), so the claim never says something the record
does not.

**Constitution IV.** "The claim is the origin of role assignment; the platform record is authoritative." This is the
arrangement the shop pool has had since 009: back-office writes the operator's record and calls `setUserGroups` in the same
action (`admin/src/shops/cognito.ts`). The group is still written for every assignment; it simply no longer overrides the
record on contact, which IV already requires ("a valid claim never overrides it"). No amendment.

**Rejected.** Keeping the token reconcile and writing the group first: the change would still wait for the person's next
token refresh (60 minutes, `access_token_validity_minutes`), and a stale or hand-edited group would keep rewriting the
record.

## R2 - One role per person

**Found.** `admin.staff_role` is `PRIMARY KEY (staff_id, role_key)`, so a person can hold several. 25 files read it
through `JOIN admin.staff_role … role_key = ANY(…)`. The Team screen shows `roles.join(", ")`.

**Decision.** Keep the table and every reader; add `UNIQUE (staff_id)`. The migration first collapses a person with
several roles to the highest (`admin` > `manager` > `csa`), recording each collapse in `admin.audit_log` (actor
`system:119`). The DTOs keep `roles: BackOfficeRole[]` (always one element, or none for a disabled person with no role) so
no client of `/me` changes shape; the new team DTOs carry `role: BackOfficeRole | null`.

**Rejected.** Moving the role to a `role` column on `admin.staff`: correct in the end, but it rewrites 25 readers for no
behaviour change. A later clean-up can do it.

## R3 - People with no role today

**Found.** R1's auto-insert creates records with no role for anyone who signs in without a group.

**Decision.** The migration sets every Active record with no role to `disabled`, recording `team.disabled` with
`detail.reason = 'no_role'` (actor `system:119`). They show under Needs attention ("No role"); re-enabling asks for a role
(`contracts/team-api.md`, status route). Spec FR-035 and SC-007 were updated to say this.

**Rejected.** Leaving them Active: they keep read access to every page that no administrator ever gave them.

## R4 - Removing a person and keeping their name on old actions

**Found.** Past actions name staff by **subject**: `staffNameSql(sub)` (`shared/src/lib/activity.ts`, "Former staff" when the
record is gone) plus ad-hoc joins `admin.staff ON cognito_sub = actor_sub` in `delivery/override.ts`,
`admin/deliverability/repository.ts`, `fleet/dispatch/sql.ts`, `catalog` repositories and others. Deleting a sign-in
account frees its `sub` forever; a returning person gets a new one.

**Decision.**
- Removing **never deletes the record**: `status = 'removed'`, `removed_at`, `removed_by_sub`; the role row stays. Every name
  reader keeps working with no change.
- The sign-in account is deleted (`AdminDeleteUser`).
- A removed person who is **added again** keeps the same record (FR-010). The new sub replaces `cognito_sub`, and the old one
  is written to the new `admin.staff_former_subject (cognito_sub PK, staff_id)`. `staffNameSql` falls back to it, so every log
  drawer names them. The ad-hoc name joins that do not go through `staffNameSql` (listed in tasks) are moved to it in this
  feature. Before that move they would show the record's email or "Former staff" for that one person's older actions, which
  only matters once someone actually returns.

**Rejected.** Keeping the sign-in account (disabled) on removal so the sub survives. It leaves an account behind that the spec
says is deleted, and the pool keeps every leaver's email forever.

## R5 - A change that touches two systems (record + sign-in account)

There is no transaction across the database and the sign-in pool. The ordering is chosen so that **a half-done change never
grants access**:

| Change | First (in the DB transaction, under the team lock) | Then (after commit) | If "then" fails |
|---|---|---|---|
| Add | - | create sign-in account (needs the sub) | - |
| Add (cont.) | insert record + role + `team.added` | add to group, invitation | Needs attention: "Group not set" (harmless: R1) |
| Change role | role + `team.role_changed` | swap group; if lowered, global sign-out | Needs attention: "Group differs" |
| Disable | status + `team.disabled` | `AdminDisableUser` + `AdminUserGlobalSignOut` | Needs attention: "Sign-in still enabled" (every request is already refused) |
| Re-enable | status (+ role) + `team.enabled` | `AdminEnableUser`, group | Needs attention: "Sign-in still disabled" (cannot sign in: safe) |
| Remove | status + `team.removed` | `AdminDeleteUser` | Needs attention: "Sign-in account still exists" (disabled already) |
| Sign out everywhere | `team.signed_out` | `AdminUserGlobalSignOut` | the route answers 502 `sign_in_unavailable`; the record says it was asked |

If the add's sign-in step succeeds but the record insert fails, an **account with no record** is left behind. It gives no
access (R1) and shows as "Not on the team". Retrying the add **adopts** it: `UsernameExistsException` → `AdminGetUser` →
use its sub. So a retry is always safe (FR-032).

Each "then" step writes its outcome to `admin.staff.sign_in_issue` (NULL = in step) in a second short statement. The
response says `complete: false` when a step failed, and the screen shows the "did not complete" message (FR-032).

## R6 - Finding disagreements (Needs attention)

**Decision.** `POST /admin/v1/staff/sign-in-check` compares the pool with the records:
- `ListUsers` (paged, 60 a page);
- `ListUsersInGroup` × 3.

It rewrites `admin.staff.sign_in_issue` for every record, and the table `admin.sign_in_orphan` (accounts with no record), in
one transaction. The page calls it when it opens, and the server skips the check if one ran within the last 60 seconds
(`admin.team_check.checked_at`). It is also run for one person after each action (R5) and by Repair. The list then filters
`Needs attention` in SQL like any other status.

There is no scheduled check. An account with no record cannot do anything (R1), and a disagreement only matters to an
administrator who is about to act, and that administrator is on this page.

**Rejected:**
- Comparing on every list read: a GET that writes, and it costs 4+ pool calls per page view.
- An hourly scheduled check: one more function and alarm for nothing a person can act on between page views.

## R7 - The last administrator, and two administrators at once

**Decision.** Every team write takes `pg_advisory_xact_lock(hashtext('admin.team'))` first; team writes are rare, so one lock
serialises them all. Under the lock, a change that would leave zero `active` + `admin` records is refused (409
`last_admin`). Two administrators lowering each other at once: the second waits, sees one admin left, and is refused. "Not
yourself" (FR-023) is checked against the caller's sub before the lock. Stale views (FR-024): each write sends
`expectedRevision`; `admin.staff.revision` is bumped by every write; a mismatch is 409 `staff_changed`.

## R8 - Ending sessions

**Found.** Back-office access tokens live 60 minutes (`infra/modules/cognito-user-pool`), and the staff gateway's JWT
authorizer accepts them until then. `AdminUserGlobalSignOut` revokes refresh tokens (and access tokens for Cognito's own
APIs) but not a JWT already in a browser.

**Decision.** Access does not depend on the token. Every gate reads `admin.staff` on every request, so a disable or a
lowered role is in force on the person's next request, whatever token they hold (SC-002). Global sign-out stops the token
being *renewed*. In the console, a 403 whose problem type is `not_on_team` or `staff_disabled` signs the browser out and
shows sign-in. The live channel already drops a disabled person at their next ten-minute epoch (`opsScope` requires
`active`).

## R9 - Invitation and "new administrator" emails

**Found.** `@effy/email-kit` sends platform mail with an `audience: "back-office"` profile ("Effy Back-Office", internal
reply-to). The `admin` service already sends feedback replies through it. `notify()` has **no back-office audience** (110/111
are customer, driver, shop), and back-office has no inbox. Delivery is known from `public.email_delivery_event` by
`message_id` (SES configuration set → deliverability).

**Decision.** Two new templates, `staff-invitation` and `staff-admin-granted` (audience back-office, `sentBy: platform`),
sent by `sendEmail` from the team service after commit. `admin.staff.invited_at` and `invitation_message_id` are stored, and
delivery is read by joining `email_delivery_event` on that id (FR-014). The five-minute resend limit (FR-013) compares
`invited_at` under the team lock. The back-office address comes from a new SSM parameter, `/effy/<env>/web/back_office_url`,
written by Terraform from the Amplify console's existing `back_office_url` output. It is required: no default, a deploy
fails without it.

**Rejected:**
- Cognito's own invitation message (`MessageAction` resend): it is built for temporary passwords and goes through
  `custom-message.ts`, which suppresses `AdminCreateUser` on purpose.
- Adding a back-office audience to `notify()`: a whole channel, inbox and preferences system for two emails.

## R10 - The list (103) and its size

**Decision.** The People list becomes `DataTable` over `GET /admin/v1/staff` parsed by `parseListQuery`:
- search: name, email;
- filters: `role`, `status` (`active|disabled|removed|never|attention`);
- sorts: `name`, `role`, `lastSeen`, `added`, each ending in the id.

Removed people are excluded unless `status=removed`. "Not on the team" accounts come from `admin.sign_in_orphan` in a
`notOnTeam` array beside the page, shown in a panel above the table only when there are any; they are not mixed into the
paged rows. It is no longer a `StaticTable`: the team is small, but it now has search and filters, and 103 keeps `StaticTable` for sets
with neither.

## R11 - Where the routes go (gateway and stack)

**Measured** (`gateway-capacity.contract.test.ts`, 2026-11-13): staff gateway **240/300**:
- `admin` 53
- `admin-promotions` 33
- `admin-messages` 19
- `catalog` 38
- `fleet` 50
- `inventory-staff` 7
- `orders` 40

The `admin` stack is at CloudFormation's 500-resource limit (that is why `admin-promotions` and `admin-messages` exist).

**Decision.** New stack **`admin-team`** (`apis/edge-api/admin/serverless.team.yml`): the same `admin/src`, staff gateway,
back-office authorizer, as 112 did. It carries the 13 new routes plus `GET /admin/v1/staff`, which moves from `admin`
(deploy `admin` first to free its route key, then `admin-team`, as the Makefile already says for split stacks).
- Staff gateway after: **253/300 (84%)**, under 112's "third gateway before about 255" line and under the 90% stop.
- ⚠ **The next feature that adds staff routes MUST do the third-gateway constitution amendment first.** This is recorded in
  the hand-off and in `docs/api/path-assignment.md`.

No route was merged to fit. Disable/re-enable share one `status` route only because they are one fact, the same as
`driver-status-v1-post`.

## R12 - Where the logic lives (one writer)

**Decision.** `@effy/edge-shared/team` (`shared/src/team/`):
- `writer.ts` is the ONE writer of `admin.staff`, `admin.staff_role`, `admin.staff_former_subject`, `admin.sign_in_orphan` and
  the `team.*` rows of `admin.audit_log`.
- `sign-in.ts` is the back-office pool port: create, get, enable, disable, delete, groups, global sign-out, list.
- `check.ts` is R6.

It lives in the shared library because two packages write the team: the `admin-team` routes and the operator tool `ops`
(`create-first-admin` / `delete-admin` move onto it, FR-034). A guard (`team.guard.test.ts`) fails:
- an `INSERT`/`UPDATE`/`DELETE` on those tables outside `team/` (the migration and container tests excepted);
- any back-office handler that reads `groups(event)`;
- a `cognito-idp:` action on the back-office pool outside the `admin-team` stack.

## R13 - Live updates

**Decision.** A new live kind, **`team`**, back-office only. `announce("team")` is called after commit by every team
route. `features/live/routes.ts` maps it to `["back-office", "team"]`. `change-map.guard.test.ts` gets the new routes.
`LIVE_KINDS` is closed and the mobile apps ignore kinds they do not know (`parseLiveUpdate`), so nothing ships to them.

## R14 - Tours (106/107)

**Decision.** The words in spec FR-036 replace "AA - Team and access" in `specs/107-backoffice-guided-tours/spec.md`, and a new
"AP - A team member" section is added there, because `tours.test.ts` reads 107's spec. In `tours.ts`:
- `admin-access` goes from version 2 to version 3;
- `admin-person` (path `/settings/team/$staffId`, roles `["admin"]`) is new.

The `data-tour` keys are `access.add`, `access.status`, `access.attention`, `person.head`, `person.role`, `person.invite`,
`person.disable` and `page-activity`.
