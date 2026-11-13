# Feature Specification: Back-Office Team Management

**Feature Branch**: `119-backoffice-team-management`
**Created**: 2026-11-13
**Status**: Draft
**Input**: User description: "Back-office team management: administrators manage back-office users from Settings › Team
and access in the back-office web console, so nobody needs the operator command line to add, change or remove a staff
member. Add a person (email, name, one role); an optional invitation email; change role; disable and re-enable; remove for
good (record kept); edit name; a person's page with their activity; server-enforced safety rules (always one active
administrator, no acting on yourself, administrators only); every change recorded; the sign-in account and the platform
record kept in step, with mismatches shown and repairable; a searchable, filterable list; Roles and permissions unchanged;
the tour rewritten; the operator command kept as break-glass."

> Number note: 117 is held for disputes (decided in 116's spec) and 118 is Effy's own toasts, so this is 119.

## Clarifications

### Session 2026-11-13

- Q: Which email addresses may a back-office team member have? → A: Any address; only its shape is checked (FR-009).
- Q (from planning): what happens to a person who holds no role today? → A: they are set Disabled with the reason recorded, and shown under Needs attention (FR-035).

## Background

**Today.** Settings › Team and access is **read-only** and only administrators can open it. It has two tabs:
- **People** - everyone with a back-office record: name or email, role, Active or Disabled, last seen.
- **Roles and permissions** - what an Administrator, a Manager and Customer support may each do, read from the real rules.

What is missing:
- **Nobody can be added from back-office.** The only way in is an operator command run by hand, and it only ever makes
  **Administrators**. There is no way at all to give someone the Manager or Customer support role.
- **A role cannot be changed on the platform.** A person's role is copied from their sign-in account every time they sign
  in, so it can only be changed outside Effy, by hand, and the change waits until they next sign in.
- **Nobody can be disabled.** The record has a Disabled state and every permission already refuses a disabled person, but
  nothing ever sets it. The only way to stop someone is the operator command that deletes them outright.
- **Nothing is recorded.** There is no record of who added, changed or removed whom.
- **There is no page for a person**, no way to sign someone out, and no rule against removing the last administrator
  except inside the operator command.
- **The sign-in account and the platform record can disagree** (one changed by hand, the other not) and nothing shows it.
- People who have never signed in have no name unless the operator gave one, and do not appear until they sign in.

**This feature** makes Team and access the one place where Effy's administrators manage the back-office team: add people
with any of the three roles, change a role, disable, re-enable and remove, see one person and everything that happened to
their access, all of it recorded and with the dangerous mistakes refused. The operator command stays only as the break-glass
way in.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An administrator adds a new team member (Priority: P1)

Priya, an administrator, has hired a customer support agent. In Settings › Team and access she presses **Add person**,
enters the agent's work email and full name, picks **Customer support**, leaves **Email them an invitation** ticked, and
adds them. The agent appears on the list at once as *Never signed in*. The agent receives an email from Effy saying they have
been given access to Effy back-office as Customer support, with the back-office address. They open it, enter their email,
receive a six-digit code and are in, with Customer support's permissions and no more.

**Why this priority**: it is the reason for the feature. Without it, every new person needs someone at a terminal, and the
Manager and Customer support roles cannot be given to anyone.

**Independent Test**: as an administrator, add a person with each of the three roles; each can sign in with a code straight
away and can do exactly what the Roles and permissions tab says for that role.

**Acceptance Scenarios**:

1. **Given** an administrator on Team and access, **When** they add a person with an email, a name and a role, **Then** the person appears on the list as Active, Never signed in, with that role, and can sign in with a six-digit code.
2. **Given** "Email them an invitation" was ticked, **When** the person is added, **Then** they receive one invitation email naming their role and the back-office address, and the email contains no code, password or link that signs them in.
3. **Given** "Email them an invitation" was not ticked, **When** the person is added, **Then** no email is sent, and the person can still sign in.
4. **Given** the email already belongs to an active team member, **When** the administrator adds it, **Then** it is refused with "This person is already on the team." and a way to open them.
5. **Given** the email belongs to a disabled team member, **When** the administrator adds it, **Then** they are offered "Re-enable them instead" rather than a second account.
6. **Given** the email belongs to a removed team member, **When** the administrator adds it, **Then** the person comes back as the same person (their old history continues), with the role chosen now.
7. **Given** a Manager or Customer support person, **When** they try to add someone by any route, **Then** they are refused and nothing is created.

---

### User Story 2 - An administrator stops someone's access at once (Priority: P1)

A manager leaves Effy. Priya opens them from the list and presses **Disable**. She is asked to confirm, with the words
"They will be signed out everywhere and will not be able to sign in. Their name stays on everything they did." She confirms.
From that moment the manager's next action in an open back-office tab is refused and they are taken to sign-in, where they
cannot sign in. On the list the manager is shown greyed as Disabled, and every order note, refund and approval they made
still shows their name. Months later, if they return, Priya presses **Re-enable** and they come back with the role they had.

**Why this priority**: removing access from a leaver is a security duty. Today it needs the operator and deletes the person.

**Independent Test**: sign a person in on one browser; disable them from another; their next action is refused within a few
seconds, they cannot sign in again, and their past actions still show their name. Re-enable them and they can sign in with
their earlier role.

**Acceptance Scenarios**:

1. **Given** an active person signed in on several devices, **When** an administrator disables them, **Then** every one of their requests from then on is refused, and every one of their sessions is ended.
2. **Given** a disabled person, **When** they try to sign in, **Then** they cannot get past the sign-in screen, and no code is sent.
3. **Given** a disabled person, **When** anyone views something they did earlier, **Then** their name is still shown on it.
4. **Given** a disabled person, **When** an administrator re-enables them, **Then** they can sign in again with the role they had when they were disabled.
5. **Given** the only active administrator, **When** anyone tries to disable them, **Then** it is refused with "Effy must always have an active administrator."
6. **Given** an administrator viewing their own page, **When** they look for Disable, Remove or Change role, **Then** those actions are not offered, and the server refuses them if attempted.

---

### User Story 3 - An administrator changes someone's role (Priority: P1)

A customer support agent is promoted to Manager. Priya opens them, chooses **Change role**, picks **Manager** and confirms.
The change is in effect on the agent's very next action, with no need for them to sign out. When an administrator lowers a
person's role, the person is signed out everywhere so nothing they had open keeps the old access. When someone is made an
Administrator, every other active administrator is told by email.

**Why this priority**: today a role can only be changed outside Effy and only takes effect when the person next signs in, so
a lowered role lingers.

**Independent Test**: change a person's role while they have back-office open; their next action follows the new role's
permissions. Make someone an Administrator; the other administrators each receive one notice.

**Acceptance Scenarios**:

1. **Given** a person with one role, **When** an administrator changes it, **Then** the person holds exactly the new role, and their next action is decided by it.
2. **Given** an administrator lowers a person's role, **When** the change is saved, **Then** the person is signed out everywhere and signs in again with the new role.
3. **Given** a person is made an Administrator, **When** the change is saved, **Then** every other active administrator receives one email saying who was made an Administrator, by whom and when.
4. **Given** the only active administrator, **When** anyone tries to give them a lower role, **Then** it is refused with "Effy must always have an active administrator."
5. **Given** two administrators change the same person at the same moment, **When** the second change is saved, **Then** it is refused with "Someone else changed this person. Look again." and nothing is overwritten unseen.

---

### User Story 4 - An administrator finds a person and sees what happened to their access (Priority: P2)

Priya needs to know who gave a contractor Administrator access. She searches the People list for the contractor's name,
opens them, and their page shows their email, role, status, who added them and when, and when they last used back-office.
She opens **Activity** and sees every change to their access: added by, role changed from Manager to Administrator by whom,
invitations sent, disabled and re-enabled.

**Why this priority**: knowing who has access, and how they got it, is what makes the rest trustworthy.

**Independent Test**: make several changes to one person; their page and its activity show every change, by whom and when,
with what it was before and after; searching, filtering and sorting the list all work and survive a page reload.

**Acceptance Scenarios**:

1. **Given** the People list, **When** an administrator searches by part of a name or email, **Then** only matching people are listed.
2. **Given** the People list, **When** an administrator filters by role or by status (Active, Disabled, Removed, Never signed in), **Then** only those people are listed, and the filter is kept in the page's address.
3. **Given** the default list, **When** it opens, **Then** removed people are not shown; choosing the Removed status shows them.
4. **Given** a person's page, **When** the administrator opens Activity, **Then** every change to that person is listed with who did it, when, and what it was before and after.
5. **Given** another administrator changes someone while the list or their page is open, **When** the change is saved, **Then** the open page shows it without being reloaded.

---

### User Story 5 - An administrator removes someone for good (Priority: P2)

A temporary worker's contract ended a year ago and they were disabled. Priya opens them and presses **Remove**. She is told
"Their sign-in account is deleted. Their name stays on everything they did, and they stay in the team's history." She
confirms. They leave the default list; the Removed filter still finds them, and their page still shows their activity.

**Why this priority**: tidiness and data minimisation; disabling already stops access, so this is less urgent.

**Independent Test**: remove a disabled person; they cannot sign in, are hidden from the default list, are found by the
Removed filter, and every past action still shows their name.

**Acceptance Scenarios**:

1. **Given** an active person, **When** an administrator looks for Remove, **Then** it is not offered: a person must be disabled first.
2. **Given** a disabled person, **When** an administrator removes them, **Then** their sign-in account no longer exists and they are shown as Removed.
3. **Given** a removed person, **When** anyone views something they did, **Then** their name is still shown.

---

### User Story 6 - An administrator sends an invitation again, or signs someone out (Priority: P2)

A new person never received their invitation (it went to spam). Priya opens them and presses **Send invitation again**.
Another time, a person reports a lost laptop. Priya presses **Sign out everywhere** on their page: their access is not
changed, but every open session ends and they must sign in again with a code.

**Why this priority**: common, small administrative needs that today have no answer.

**Independent Test**: resend an invitation and receive it; sign a person out everywhere while they are signed in on two
browsers; both must sign in again, and the person's role and status are unchanged.

**Acceptance Scenarios**:

1. **Given** an active person, **When** an administrator sends the invitation again, **Then** one more invitation email is sent and it is recorded in their activity.
2. **Given** an invitation was sent to the same person within the last few minutes, **When** the administrator presses it again, **Then** it is refused with "An invitation was sent a moment ago." so a person is not flooded.
3. **Given** an active person signed in on two devices, **When** an administrator signs them out everywhere, **Then** both sessions end and the person's role and status are unchanged.
4. **Given** the invitation could not be delivered (the address refuses mail), **When** the administrator looks at the person, **Then** they see that the last invitation could not be delivered.

---

### User Story 7 - An administrator repairs a person whose sign-in account disagrees (Priority: P3)

Someone once changed a sign-in account by hand: a person's account is disabled there while their record says Active, and
another person has a sign-in account but no record at all. The People list shows both under **Needs attention**. Priya opens
the first and presses **Repair**, which makes the sign-in account match the record. For the second, she chooses either **Add
to the team** (picking a role) or **Delete the sign-in account**.

**Why this priority**: rare, but when it happens today nobody can see it, and a person can hold access the team list does
not show.

**Independent Test**: make each kind of mismatch by hand; each is shown under Needs attention with what disagrees; each
repair clears it.

**Acceptance Scenarios**:

1. **Given** a person whose sign-in account is disabled, missing or holds a different role from their record, **When** an administrator opens Team and access, **Then** the person is marked Needs attention and their page says what disagrees.
2. **Given** a sign-in account with no record, **When** an administrator opens Team and access, **Then** it is listed under Needs attention as "Not on the team", and that account cannot use back-office until it is added.
3. **Given** a person marked Needs attention, **When** the administrator repairs them, **Then** the sign-in account is made to match the record, the mark clears, and the repair is recorded.
4. **Given** one half of any change fails (for example the sign-in account is updated but the record is not), **When** the change ends, **Then** the administrator is told it did not complete and the person is marked Needs attention, never shown as done.

---

### User Story 8 - A team member keeps their own name right (Priority: P3)

A team member's name is spelled wrong on everything they do. They open **Your back-office record** from the account menu and
correct their name. An administrator can also correct anyone's name from their page.

**Why this priority**: small, but names are what appear on every action in back-office.

**Independent Test**: change your own name from Your back-office record; it is shown on the team list and on your next action.

**Acceptance Scenarios**:

1. **Given** any active team member, **When** they change their own name, **Then** the new name is shown everywhere their name is shown, and the change is recorded.
2. **Given** an administrator, **When** they change another person's name, **Then** the same happens.
3. **Given** anyone, **When** they look for a way to change an email address, **Then** there is none: the page explains that to change an email you add the new address and disable the old one.

---

### Edge Cases

- **The last active administrator** cannot be disabled, removed or given a lower role, by anyone, by any route, including
  two administrators lowering each other at the same moment (only one of the two can succeed).
- **Acting on yourself**: an administrator cannot disable, remove, sign out everywhere, or change the role of themselves.
  They can change their own name.
- **Email in a different case or with spaces** ("Jane@Effy.test ") is the same person as "jane@effy.test".
- **An email that is a customer's, a shop operator's or a driver's** is unrelated: back-office accounts are separate, so the
  same address can be a back-office person too.
- **A person disabled while they are mid-action** (a refund dialog open): the action is refused when they press it; nothing
  half-done is left.
- **A person whose role is changed while they are on a page their new role cannot use**: their next action there is refused
  with the ordinary "not allowed" message, and the page offers to go home.
- **A disabled person who still holds a valid session** is refused by every back-office action, not only sign-in.
- **The invitation email bounces**: the person is still added; their page shows the last invitation was not delivered.
- **Work a disabled or removed person started** (a scheduled message, a draft promotion, an assigned exception) carries on
  as the business's; it is not cancelled or reassigned by this feature.
- **A sign-in account created outside back-office** (by hand, not by the operator command) gives no access until an
  administrator adds it to the team.
- **Every administrator is locked out** (all disabled or removed by mistake is prevented, but the accounts could be lost):
  the operator command is the way back in, and it follows the same rules.
- **Hundreds of people** are not expected; the list still searches, filters and sorts on the server and keeps its state in
  the address like every console list.

## Requirements *(mandatory)*

### Functional Requirements

**Who may manage the team**

- **FR-001**: Only an active Administrator MAY add people, change a role, disable, re-enable, remove, sign someone out
  everywhere, send an invitation or repair a person. The server MUST refuse every one of these from anyone else, whatever
  the screen shows.
- **FR-002**: Team and access MUST remain visible to Administrators only. Managers and Customer support MUST NOT see the
  team list or anyone's page.
- **FR-003**: Any active team member MAY change their own name (from Your back-office record). Nobody MAY change an email.

**The platform record decides**

- **FR-004**: A person's role and status MUST come from Effy's team record only. Signing in MUST NOT change a person's role or
  status, and a role held by the sign-in account but not by the record MUST give no permission.
- **FR-005**: Each person MUST hold **exactly one** role: Administrator, Manager or Customer support. The three roles, and what
  each may do, are unchanged by this feature.
- **FR-006**: A role change or a disable MUST take effect on the person's next request, not at their next sign-in.
- **FR-007**: A sign-in account with no team record MUST give no back-office access, and MUST be shown to Administrators as
  "Not on the team" (FR-030).

**Adding a person**

- **FR-008**: An Administrator MUST be able to add a person with a work email, a full name and one role. The person MUST be
  able to sign in at once with their email and a six-digit code; back-office keeps no passwords.
- **FR-009**: The email MUST be checked for shape and compared ignoring case and surrounding spaces. Any address is
  allowed (contractors may use their own); there is no domain rule.
- **FR-010**: Adding an email that belongs to an active person MUST be refused ("This person is already on the team.") with a
  way to open them. Adding an email that belongs to a disabled person MUST offer to re-enable them instead. Adding an email
  that belongs to a removed person MUST bring back the same person (their history continues) with the role chosen now.
- **FR-011**: A new person MUST appear on the list at once, marked "Never signed in", with who added them and when.

**Telling the person**

- **FR-012**: Adding a person MUST offer "Email them an invitation", ticked by default. The invitation MUST name Effy
  back-office, the person's role and the back-office address, and say they sign in with their email and a code. It MUST
  contain no code, no password and no link that signs them in, and MUST come from the same sender as the sign-in code email.
- **FR-013**: An Administrator MUST be able to send the invitation again to any active person. A second invitation to the same
  person within five minutes MUST be refused ("An invitation was sent a moment ago.").
- **FR-014**: A person's page MUST show when the last invitation was sent and whether it could be delivered.

**Changing a role**

- **FR-015**: An Administrator MUST be able to change another person's role. A lowered role (Administrator → Manager or
  Customer support, Manager → Customer support) MUST also sign the person out everywhere.
- **FR-016**: When a person is made an Administrator (added as one, raised to one, or re-enabled as one), every other active
  Administrator MUST receive one email saying who, by whom and when.

**Disabling, re-enabling, removing, signing out**

- **FR-017**: An Administrator MUST be able to disable an active person, after a confirmation that says what will happen.
  Disabling MUST stop sign-in at once, end every open session, and refuse every request the person makes from then on.
- **FR-018**: An Administrator MUST be able to re-enable a disabled person; they return with the role they held when disabled.
- **FR-019**: An Administrator MUST be able to remove a **disabled** person, after a confirmation. Removing MUST delete their
  sign-in account and keep their team record, marked Removed, so their name stays on everything they did. An active person
  MUST NOT be removable.
- **FR-020**: An Administrator MUST be able to sign a person out everywhere without changing their role or status.
- **FR-021**: A disabled or removed person's name MUST keep appearing on every action they took, everywhere it appears today.

**Safety rules (enforced by the server)**

- **FR-022**: There MUST always be at least one active Administrator. Disabling, removing or lowering the role of the last
  one MUST be refused ("Effy must always have an active administrator."), including when two such changes happen at once.
- **FR-023**: An Administrator MUST NOT be able to disable, remove, sign out everywhere, or change the role of themselves.
  The screen MUST NOT offer it and the server MUST refuse it.
- **FR-024**: A change made against an out-of-date view of a person MUST be refused ("Someone else changed this person. Look
  again.") rather than overwrite another administrator's change.

**The record of changes**

- **FR-025**: Every change to a person - added, invitation sent, role changed, disabled, re-enabled, removed, signed out
  everywhere, name changed, repaired - MUST be recorded with who did it, when, and what it was before and after. The record
  MUST never be edited or deleted.
- **FR-026**: A person's page MUST show their activity in the platform's one activity drawer (search, type, dates, paging,
  export), opened from the page head like every other log.

**The list and a person's page**

- **FR-027**: The People list MUST be the console's standard list: search by name or email; filter by role and by status
  (Active, Disabled, Removed, Never signed in, Needs attention); sort by name, role, last seen and date added; state kept in
  the page's address. Removed people MUST be hidden unless the Removed status is chosen.
- **FR-028**: A person's page MUST show their name, email, role, status, who added them and when, last seen ("Never" before
  their first sign-in), last invitation, and the actions FR-008 to FR-020 allow for them, offering only the ones that apply.
- **FR-029**: The list and a person's page MUST show another administrator's change without being reloaded, and MUST NOT
  refresh on a timer.

**Keeping the sign-in account and the record in step**

- **FR-030**: Team and access MUST show, under **Needs attention**, every person whose sign-in account disagrees with their
  record (missing, disabled while Active, enabled while Disabled or Removed, holding a different role), and every sign-in
  account that has no record ("Not on the team"). A person's page MUST say what disagrees.
- **FR-031**: An Administrator MUST be able to **Repair** a person, which makes the sign-in account match the record. For a
  sign-in account with no record they MUST be able to **Add to the team** (choosing a role) or **Delete the sign-in account**.
- **FR-032**: When one half of any change fails, the Administrator MUST be told it did not complete, and the person MUST be
  marked Needs attention - never shown as done. Retrying the same change MUST be safe.

**What stays**

- **FR-033**: The Roles and permissions tab MUST stay as it is: it is read from the real rules.
- **FR-034**: The operator command MUST stay as the break-glass way to create an Administrator (the first one, or when every
  Administrator is locked out). It MUST write the same team record and the same record of changes (by "Operator"), and its
  delete MUST be refused for the last active Administrator unless forced, as today.
- **FR-035**: The existing team members MUST keep their roles and status when this feature arrives: each person's role is
  taken once from what they hold today. A person who holds more than one role today keeps the highest. A person who holds
  **no** role today (made automatically by an earlier sign-in, never given a role by anyone) is set Disabled, with the
  reason recorded, and is shown under Needs attention so an Administrator can re-enable them with a role.

**Guided tours**

- **FR-036**: The Team and access tour MUST be rewritten to the words below and its version raised, so everyone who saw the
  old one is shown it again. A person's page MUST have its own tour, with the words below.

**Team and access (Administrator)** - replaces "AA - Team and access" in 107's spec:

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | People tab | The team | Everyone with a back-office account, their role, and when they last opened back-office. | |
| 2 | Add person | Adding someone | Give a person access: their work email, their name and one role. They sign in with a code sent to that email. | |
| 3 | Status filter | Who you see | Active and disabled people are shown. Choose Removed to see people who have left. | |
| 4 | Needs attention | Needs attention | Someone whose sign-in account does not match their record. Open them to repair it. | There are any |
| 5 | Roles and permissions | Roles and permissions | What Administrators, Managers and Customer support may each do. The platform's staff record decides. | |

**AP - A team member (Administrator)** - new:

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | This person | Their role, whether they can sign in, and when they last opened back-office. | |
| 2 | Change role | Their role | Change what they may do. It takes effect on their next action. | Not yourself |
| 3 | Send invitation | Telling them | Email them that they have access, with their role and where to sign in. | Active |
| 4 | Disable | Stopping access | Disable stops sign-in at once and signs them out. Their name stays on everything they did. | Active, not yourself |
| 5 | Activity | Activity | Who added them, and every change to their access since. | |

### Key Entities

- **Team member**: one person with back-office access. Name, email (their sign-in, never changed), exactly one role, status
  (Active, Disabled, Removed), added by and when, last seen, last invitation (when, delivered or not). Never deleted: a
  removed person stays so their name stays on their actions.
- **Role**: Administrator, Manager or Customer support - fixed; what each may do is the Roles and permissions table.
- **Sign-in account**: what a person signs in with. Must agree with the team member; the team member decides.
- **Team change**: one recorded change to a team member - what, who, when, before and after. Never edited or deleted.
- **Invitation**: an email telling a person they have access. Sent at most once per five minutes per person; its delivery
  is known.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Administrator can add a person with any of the three roles in under one minute, and the person can sign in
  within two minutes of being added, with no one using the operator command.
- **SC-002**: A disabled person's next action is refused within 5 seconds of the disable, on every device they were signed in
  on; a lowered role is in force on the person's next action.
- **SC-003**: In every attempt - one administrator or two at once, by the screen or directly - the platform is never left with
  no active Administrator.
- **SC-004**: 100% of team changes appear in the person's activity with who, when, before and after.
- **SC-005**: Every person shown Active can sign in and every person shown Disabled or Removed cannot; every disagreement made
  by hand is shown under Needs attention the next time Team and access is opened, and a Repair clears it.
- **SC-006**: After this feature, the operator command is needed only to create an Administrator when none can sign in.
- **SC-007**: Existing team members who hold a role keep exactly the access they had the moment before the feature arrived;
  no one keeps access that no administrator gave them.

## Assumptions

- Back-office stays passwordless with six-digit email codes; this feature adds no passwords, second factor or single sign-on.
- The three roles and their permissions are fixed. Custom roles, per-permission grants and limiting a person to some shops or
  areas are out of scope.
- Shop operators and drivers are managed where they already are; they are not part of this team.
- Only Administrators manage the team (as asked). A Manager cannot add Customer support people.
- The invitation and the "new Administrator" notice are emails in Effy's existing email style; back-office has no inbox, so
  there is no in-app notice.
- The invitation does not expire: it carries nothing that signs anyone in, so there is nothing to expire.
- Work a person started is the business's and carries on when they are disabled or removed.
- No one is disabled automatically after a period without signing in; the Last seen column and sort let an Administrator
  find them. (Possible later feature.)
- Bulk import of staff and exporting the team list (other than the activity export) are out of scope.
- The team is small (tens of people), but the list behaves like every console list regardless.
- The existing "Your back-office record" view is where a person changes their own name.
