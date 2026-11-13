# Contract: Team API (119)

**Gateway: staff.** **Stack:** `admin-team` (`apis/edge-api/admin/serverless.team.yml`, source `admin/src/team/`).
**Authorizer:** back-office.

Every route except `PATCH /admin/v1/me` requires an **active Administrator**, decided from `admin.staff` (`hasStaffRole(sub,
["admin"])`). Anyone else gets 403 `forbidden` and nothing is written. Problem bodies are the platform's usual problem shape;
`type` is the machine word below, and `detail` is the spec's sentence from `TEAM_REFUSAL_WORDS`.

Every write route:
- takes the team lock (research R7) and checks `expectedRevision` (where a person is named);
- writes `admin.audit_log`, commits, and runs the sign-in step;
- calls `announce("team")`;
- answers `{ member: TeamMemberDetailDTO, complete: boolean }`. `complete: false` means a sign-in step failed: the person is
  marked Needs attention and the screen says the change did not complete (FR-032).

## Routes (13 new + 1 moved; staff gateway 240 → 253)

| # | Method + path | Purpose | Body | Refusals |
|---|---|---|---|---|
| 1 | `GET /admin/v1/staff` *(moved from `admin`)* | The People list (103) | - query: `q`, `role`, `status` (`active\|disabled\|removed\|never\|attention`), `sort` (`name\|role\|lastSeen\|added`), `dir`, `pageSize`, `cursor` | 400 `validation` |
| 2 | `POST /admin/v1/staff` | Add a person, or adopt a sign-in account with no record | `{email, name, role, invite: boolean}` | 409 `already_on_team` (active), 409 `disabled_on_team` + `{memberId}` (offer re-enable), 400 `validation` |
| 3 | `POST /admin/v1/staff/sign-in-check` | Compare the pool with the records (R6); skipped if run < 60 s ago | `{}` | - |
| 4 | `DELETE /admin/v1/staff/sign-in-accounts/{username}` | Delete a sign-in account that has no record | - | 404, 409 `has_record` |
| 5 | `GET /admin/v1/staff/{staffId}` | A person's page | - | 404 |
| 6 | `PATCH /admin/v1/staff/{staffId}` | Rename | `{name, expectedRevision}` | 409 `staff_changed`, 400 |
| 7 | `PUT /admin/v1/staff/{staffId}/role` | Change role | `{role, expectedRevision}` | 409 `last_admin`, 409 `not_yourself`, 409 `staff_changed`, 409 `not_active` |
| 8 | `POST /admin/v1/staff/{staffId}/status` | Disable or re-enable | `{status: 'active'\|'disabled', role?, expectedRevision}` (role is required when re-enabling a person with none) | 409 `last_admin`, `not_yourself`, `staff_changed`, 400 `role_required` |
| 9 | `DELETE /admin/v1/staff/{staffId}` | Remove (disabled only) | query `expectedRevision` | 409 `not_disabled`, `not_yourself`, `staff_changed` |
| 10 | `POST /admin/v1/staff/{staffId}/sign-out` | Sign out everywhere | `{}` | 409 `not_yourself`, 409 `not_active`, 502 `sign_in_unavailable` |
| 11 | `POST /admin/v1/staff/{staffId}/invitation` | Send the invitation (again) | `{}` | 409 `invited_recently` (< 5 min), 409 `not_active` |
| 12 | `POST /admin/v1/staff/{staffId}/repair` | Make the sign-in account match the record | `{expectedRevision}` | 409 `staff_changed` |
| 13 | `GET /admin/v1/staff/{staffId}/activity` | The person's log (104, `bo-team-member`) | 104's query | 400 |
| 14 | `PATCH /admin/v1/me` | Any active person renames themselves | `{name}` | 403 for a disabled person or one with no record |

### `GET /admin/v1/staff` → 200

```json
{
  "rows": [TeamMemberDTO],
  "page": { "...": "103's page shape" },
  "notOnTeam": [NotOnTeamDTO],
  "checkedAt": "2026-11-14T01:02:03Z"
}
```

`notOnTeam` is the whole of `admin.sign_in_orphan`. It is always small, and the screen shows it in a panel above the table only
when it is not empty.

### Add (route 2) in detail

1. Validate: `email` has a valid shape (any domain, spec Clarifications), `name` is 1–120 characters after trim, `role` is
   one of the three.
2. Under the lock, look up the email:
   - an active record → 409 `already_on_team`;
   - a disabled record → 409 `disabled_on_team` with `{memberId}`;
   - a removed record → **re-add**: the same record.
3. Sign-in account: `AdminCreateUser` (no message, verified email, the name). If the username exists, `AdminGetUser`
   **adopts** it: an orphan, or this person's own half-done add.
4. Transaction: insert or update the record, the role, and `team.added` (or `team.readded`). On a re-add, the old sub is moved
   to `staff_former_subject`.
5. After commit:
   - add to the group;
   - if `invite`, send `staff-invitation` and record `invited_at` and the message id;
   - if the role is `admin`, send `staff-admin-granted` to every **other** active admin (FR-016).

## `GET /admin/v1/me` (existing, `admin` stack - behaviour changes, route unchanged)

- It no longer inserts a record or reconciles roles from `cognito:groups` (research R1).
- It updates `last_seen_at` for an active record and answers as today, plus `name`.
- A sign-in account with no record → 403 `not_on_team`.
- A disabled or removed person → 403 `staff_disabled`.

## Problem types the console acts on

`not_on_team` and `staff_disabled`: on any back-office route, the console signs the browser out and shows sign-in with "Your
back-office access has ended. Ask an administrator." (research R8). Every existing gate keeps answering 403 `forbidden`.
`/me` is the first call on every load, so it is the one that returns these two types.

## Emails (`@effy/email-kit`, audience `back-office`)

| Template | To | Words (variables) |
|---|---|---|
| `staff-invitation` | the person | "You have been given access to Effy Back-Office as {role}. Sign in at {backOfficeUrl} with this email address; we will email you a six-digit code each time." No code, no link that signs in. |
| `staff-admin-granted` | each other active Administrator | "{name} ({email}) was made an Administrator by {actorName} at {when}. If you did not expect this, open Team and access." |

The sender is `MAIL_SENDER` (the same sender as sign-in codes, FR-012). `BACK_OFFICE_URL` comes from SSM
`/effy/<env>/web/back_office_url` and is required, with no default.

## Live

Every write route announces `team`. Back-office maps it to `["back-office", "team"]` (the list and every person page).
