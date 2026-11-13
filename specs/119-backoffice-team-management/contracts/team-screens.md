# Contract: Team Screens (119, back-office web)

Feature folder: `apps/back-office/src/features/staff-identity/`, renamed **`features/team/`**. All controls come from
`@effy/design-system/ui` (shadcn as-is). Patterns come from `@effy/web-kit` (`PageHeader`, `Panel`, `DataTable`,
`ActivityLogDrawer`, `DetailPageSkeleton`). Every overlay is a `Dialog`/`AlertDialog`.

## `/settings/team` - Team and access (Administrator)

- **Head**: title, the description "Everyone with a back-office account, their role, and what each role is allowed to do.",
  and the primary button **Add person** (`data-tour="access.add"`).
- **Tabs**: People (count = active people) · Roles and permissions (unchanged, FR-033).
- **People**:
  - a **Not on the team** panel (`data-tour="access.attention"`), only when there are any. Each row shows the email, Enabled or
    Disabled, its groups, and two actions: **Add to the team** (opens Add person with the email filled in) and **Delete
    sign-in account** (`AlertDialog`).
  - a `DataTable` with search "Search name or email", a Role facet, and a Status facet (`data-tour="access.status"`): Active ·
    Disabled · Removed · Never signed in · Needs attention.
  - Columns: Person (avatar, name, email) · Role · Status (`StatusWord`: Active done, Disabled quiet, Removed quiet, plus a
    **Needs attention** warning word when `signInIssue`) · Last seen ("Never signed in") · Added.
  - A row opens the person.
- On open, the page calls `sign-in-check`, then reads the list. The live kind `team` re-reads it.

### Add person (Dialog)

- Fields: Work email · Full name · Role (radio group of three, each with one line from the permissions table) · checkbox
  **Email them an invitation** (ticked).
- Buttons: **Add person**, Cancel.
- Refusals are shown in place:
  - `already_on_team` → "This person is already on the team." with an **Open them** link;
  - `disabled_on_team` → "This person is disabled." with a **Re-enable them instead** button (opens Re-enable for that
    person).
- `complete:false` → an error toast "Added, but their sign-in account did not finish. Open them to repair it."

## `/settings/team/$staffId` - A team member (Administrator)

- **Head** (`data-tour="person.head"`): the name, with the email under it, and a status word. **Activity** sits in the More
  menu (`page-activity`). The buttons shown come only from the server's `actions`:
  - **Change role** (`person.role`);
  - **Send invitation** / **Send invitation again** (`person.invite`);
  - **Disable** (`person.disable`) or **Re-enable**;
  - **Remove** (disabled only);
  - **Sign out everywhere**;
  - **Repair** (when `signInIssue`).
- **Details panel**: rows for Role · Status · Added (by, when) · Last seen · Last invitation (when, Delivered / Not
  delivered) · Disabled (by, when) · Removed (by, when).
- **Needs attention panel**, when there is an issue: the `SIGN_IN_ISSUE_WORDS` sentence and the **Repair** button.
- **Rename**: an Edit button on the name row opens a Dialog with one field.
- **Dialogs**, all with the spec's words:
  - **Change role**: radio of three. Lowering a role adds "They will be signed out everywhere."
  - **Disable** (`AlertDialog`): "They will be signed out everywhere and will not be able to sign in. Their name stays on
    everything they did."
  - **Re-enable**: asks for a role only when they have none.
  - **Remove** (`AlertDialog`): "Their sign-in account is deleted. Their name stays on everything they did, and they stay in
    the team's history."
  - **Sign out everywhere** (`AlertDialog`).
- **Yourself** (`isYou`): only Rename is offered, with the line "You cannot change your own access. Ask another
  administrator."
- Every write sends `expectedRevision`. `staff_changed` → "Someone else changed this person. Look again." and the page
  re-reads.
- **Loading**: `DetailPageSkeleton` with the labels written out.

## Your back-office record (shell dialog, every person)

The Name row gains **Edit** (`PATCH /admin/v1/me`). The Role row shows one role.

## Access ended

A 403 `not_on_team` or `staff_disabled` from `/me` (or any route) signs the browser out and shows sign-in with "Your
back-office access has ended. Ask an administrator."

## Tours

The words are in spec FR-036 and copied into 107's spec:
- `admin-access` goes to version 3, with the steps `access.team`, `access.add`, `access.status`, `access.attention` (shown when
  there are any) and `access.roles`;
- `admin-person` is new, with `person.head`, `person.role`, `person.invite`, `person.disable` and `page-activity`, each limited
  as the table says.
