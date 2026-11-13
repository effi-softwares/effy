# Data Model: Back-Office Team Management (119)

One migration, `db/migrations/20261114090000_backoffice_team.sql` (a new file: the baseline is never edited). Schema
`admin`. Every write below goes through `@effy/edge-shared/team` `writer.ts` (research R12); the migration's own backfill
is the only other writer.

## admin.staff (changed)

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | unchanged |
| `cognito_sub` | text UNIQUE NOT NULL | the **current** sign-in account's subject. Replaced when a removed person is added again (old one → `staff_former_subject`) |
| `email` | **citext** NOT NULL, **UNIQUE** | was `text`. The sign-in email, lower-cased and trimmed at write; never edited by a person (FR-003). See "Backfill" |
| `name` | text NULL | stays nullable for rows from before 119 (shown by email, as today). The writer requires 1–120 characters after trim on every add, re-add and rename |
| `status` | text | CHECK widened to `active` · `disabled` · **`removed`** |
| `revision` | integer NOT NULL DEFAULT 1 | **new**. +1 on every write; a write sends `expectedRevision` (FR-024) |
| `added_by_sub` | text NULL | **new**. Who added them; `operator` for the break-glass tool; NULL for rows from before 119 |
| `disabled_at`, `disabled_by_sub` | timestamptz, text NULL | **new**. Set by disable, cleared by re-enable |
| `removed_at`, `removed_by_sub` | timestamptz, text NULL | **new**. Set by remove, cleared when added again |
| `invited_at` | timestamptz NULL | **new**. Last invitation sent |
| `invitation_message_id` | text NULL | **new**. Its mail id; delivery is read from `public.email_delivery_event` by it (FR-014) |
| `sign_in_issue` | text NULL | **new**. NULL = in step. CHECK one of: `missing` · `enabled_while_off` · `disabled_while_on` · `group_differs` · `no_role` · `email_differs` |
| `sign_in_checked_at` | timestamptz NULL | **new**. When `sign_in_issue` was last decided |
| `created_at`, `updated_at`, `last_seen_at` | | unchanged; `last_seen_at` NULL = "Never signed in" |

Indexes:
- `staff_status_name_idx (status, lower(coalesce(name, email)), id)`, for the list's default order;
- `staff_attention_idx (id) WHERE sign_in_issue IS NOT NULL`.

**Status transitions** (all under the team lock, research R7):

```
           add ─────────► active ◄──── re-enable (role required if none) ────┐
                            │                                                │
                         disable                                             │
                            ▼                                                │
                         disabled ───────────────────────────────────────────┘
                            │
                          remove
                            ▼
                         removed ──── add again (same email) ────► active (new sub; old sub → former_subject)
```

- `active → removed` is not allowed (FR-019).
- No transition may leave zero rows that are `status = 'active'` with role `admin` (FR-022), and none may target the
  caller (FR-023; a name edit excepted).

## admin.staff_role (changed)

- Gains a **`UNIQUE (staff_id)`**: at most one role per person (FR-005). The primary key is unchanged.
- An `active` person always has exactly one role. The writer enforces it, and `team.container.test.ts` holds it.
- A disabled person keeps their row, so re-enabling restores it (FR-018).
- A person disabled for `no_role` has none.

## admin.staff_former_subject (new)

| Column | Type | Rule |
|---|---|---|
| `cognito_sub` | text PK | a subject this person signed in with before |
| `staff_id` | uuid NOT NULL → `admin.staff(id)` | |
| `until` | timestamptz NOT NULL | when it stopped being theirs |

Read by `staffNameSql`: when no row matches `admin.staff.cognito_sub`, it falls back to this table (research R4).

## admin.sign_in_orphan (new)

A sign-in account in the back-office pool with no team record: "Not on the team" (FR-007, FR-030). The check rewrites the
whole table (research R6).

| Column | Type |
|---|---|
| `cognito_username` | text PK |
| `cognito_sub` | text NOT NULL |
| `email` | citext NULL |
| `enabled` | boolean NOT NULL |
| `groups` | text[] NOT NULL |
| `created_in_pool_at` | timestamptz NULL |
| `found_at` | timestamptz NOT NULL |

## admin.team_check (new, one row)

`id boolean PK DEFAULT true CHECK (id)`, `checked_at timestamptz NOT NULL`. The check is skipped when it ran less than 60
seconds ago.

## admin.audit_log (used, unchanged)

Team changes are written with `target_type = 'staff'` and `target_id = admin.staff.id`. They are appended only: the writer
never updates or deletes a row, and `team.guard.test.ts` fails an `UPDATE`/`DELETE` on `admin.audit_log` anywhere.

| `action` | `detail` (before/after) |
|---|---|
| `team.added` | `{role, invited: bool, adopted: bool}` (adopted = an account with no record was taken into the team) |
| `team.readded` | `{role, formerSub}` |
| `team.invited` | `{messageId}` |
| `team.role_changed` | `{from, to}` |
| `team.disabled` | `{reason?: 'no_role'}` |
| `team.enabled` | `{role}` |
| `team.removed` | `{}` |
| `team.signed_out` | `{}` |
| `team.renamed` | `{from, to}` |
| `team.repaired` | `{issue, steps: [...]}` |
| `team.sign_in_failed` | `{step, error}`: a "then" step from research R5 failed |
| `team.orphan_deleted` | `{username, email}` (`target_id` NULL) |

Actor `actor_sub` is the caller's sub. It is `operator` for the break-glass tool and `system:119` for the migration.

## Backfill (in the migration)

1. Collapse a person with more than one role to the highest (`admin` > `manager` > `csa`), and write `team.role_changed` for
   each one (actor `system:119`). Then add `UNIQUE (staff_id)`.
2. Every `active` person with no role → `disabled`, `sign_in_issue = 'no_role'`, `team.disabled {reason:'no_role'}`.
3. `email` is converted to citext and lower-cased. A row whose email has no `@` keeps its value: R1's old insert stored the
   token `username`, a UUID-shaped value. It is marked `sign_in_issue = 'email_differs'`, so the first check or a Repair
   rewrites it from the sign-in account.
4. If two rows end up with the same email, the migration stops with a named error rather than guess. This cannot happen in
   dev (emails come from the pool, which is unique), but production data is not assumed.

## The DTOs (shared-types `back-office-team.ts`)

- `TeamMemberDTO`:
  - `{ id, subject, name, email, role, status, lastSeenAt, addedAt, addedBy: {name} | null }`
  - `{ invitation: {sentAt, delivery: 'sent'|'delivered'|'bounced'|'complained'} | null }`
  - `{ signInIssue: SignInIssue | null, revision }`
- `TeamMemberDetailDTO` = `TeamMemberDTO` plus `{ disabledAt, disabledBy, removedAt, removedBy, isYou }` and
  `actions: TeamAction[]`. The actions are computed by the server from the same rules it enforces, and the screen offers
  only these.
- `NotOnTeamDTO` = `{ username, email, enabled, groups, createdAt }`.
- `TEAM_STATUS_WORDS`, `SIGN_IN_ISSUE_WORDS` and `TEAM_REFUSAL_WORDS` hold the spec's sentences, in one file.
