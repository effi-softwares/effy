# Quickstart: Back-Office Team Management (119)

How to prove the feature end to end in dev. The operator runs every step that touches AWS or the database (CLAUDE.md "Mode
of work").

## Prerequisites

- `AWS_PROFILE=ef`.
- Two browsers or profiles, and three mailboxes you can read (A = an existing administrator, B and C = new people).

## Deploy (operator)

1. `make apply ENV=dev`: adds SSM `/effy/dev/web/back_office_url`.
2. `make db-up ENV=dev`: migration `20261114090000_backoffice_team.sql`. Check that
   `SELECT status, sign_in_issue, count(*) FROM admin.staff GROUP BY 1,2;` matches what you expect (no-role people are now
   `disabled` / `no_role`).
3. `make edge-deploy SERVICE=admin ENV=dev`: frees `GET /admin/v1/staff`; `/me` stops reconciling roles.
4. `make edge-deploy SERVICE=admin-team ENV=dev`: the new stack.
5. Push `dev` → back-office builds.
6. `make gateway-usage ENV=dev`: the staff gateway shows 253/300.

Between steps 3 and 4 the People list answers 404 for about a minute. Do it while nobody needs the page.

## Automated checks (Claude runs)

- `pnpm --filter @effy/edge-shared test`: `team/*.test.ts`, `team.guard.test.ts`, `activity`, `change-map`, gateway capacity.
- The team container tests, against the local Postgres (see memory "Container tests without Docker"): the last-admin race,
  revision conflicts, the backfill, re-adding a removed person.
- `pnpm --filter @effy/edge-admin test`, `pnpm --filter @effy/edge-ops test`.
- `pnpm --filter back-office test`: the team screens, `tours.test.ts`, skeletons, list-screens, activity-logs guards.

## Walk (spec acceptance)

| # | Do | Expect (spec) |
|---|---|---|
| 1 | As A: Add person B, Customer support, invitation ticked | B on the list, Never signed in; B's mailbox has one invitation with no code or link (US1-1/2) |
| 2 | B signs in with the code | B sees CSA permissions only (the Roles tab); B cannot open Team and access (FR-002) |
| 3 | A adds B again | "This person is already on the team." (US1-4) |
| 4 | A changes B to Manager while B has a page open | B's next action follows Manager rules, no sign-out (US3-1) |
| 5 | A changes B back to Customer support | B is signed out everywhere and signs in again (US3-2) |
| 6 | A adds C as Administrator | Every other admin (A) gets the "was made an Administrator" email (US3-3) |
| 7 | A disables B while B is signed in on two browsers | B's next click in each is refused within 5 s and lands on sign-in; B cannot get a code (US2-1/2, SC-002) |
| 8 | Open an order B touched | B's name is still on it (US2-3) |
| 9 | A re-enables B | B signs in as Customer support (US2-4) |
| 10 | A disables, then removes B | Hidden by default; Removed filter shows B; activity intact (US5) |
| 11 | A adds B's email again | Same person, history continues (US1-6) |
| 12 | A opens their own page | Only Rename (FR-023) |
| 13 | C and A each try to disable the other at the same moment, leaving one admin | One succeeds, the other gets "Effy must always have an active administrator." (FR-022) |
| 14 | In the console, change B's group in the pool by hand; reopen Team and access | B is under Needs attention ("Group differs"); Repair clears it (US7) |
| 15 | Create a pool user by hand with no record | "Not on the team" panel; that account gets 403 on `/me`; Delete sign-in account removes it (FR-007, FR-031) |
| 16 | A resends B's invitation twice within a minute | The second is refused: "An invitation was sent a moment ago." (US6-2) |
| 17 | Any person renames themselves in Your back-office record | The new name is on the list and on their next action (US8) |
| 18 | Tours | Team and access replays (version 3); the person page has its own tour |
| 19 | `make create-first-admin EMAIL=… NAME=… ENV=dev` for a new address | Creates an Administrator through the same writer; `team.added` by "Operator" in their activity (FR-034) |
