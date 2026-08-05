# Specification Quality Checklist: Platform Email Delivery

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation notes

**Iteration 1 — issues found and fixed before this checklist was marked complete:**

1. *Implementation leakage.* The first draft named the vendor services directly (SES, Route 53,
   Cognito, SNS, Terraform) throughout the requirements. Rewritten to describe outcomes — "sending
   namespace", "identity provider", "mail service", "per-message outcome" — with vendor names confined
   to the verbatim user input and to the Dependencies section, where they are genuine external
   constraints rather than design choices.
2. *An unverifiable premise.* The user's stated problem ("I can only send to addresses I have put in
   SES identities") was measured and found **no longer true** — unrestricted sending is granted. The
   spec records the measured state rather than repeating the premise, and makes re-proving it the first
   acceptance scenario rather than assuming either way.
3. *A conflicting prior decision.* Feature 010's FR-022 forbids a reply address. This feature's FR-022 reverses it and
   states the reason the original rule no longer applies, rather than silently contradicting it.
4. *A conflicting scope note.* `CLAUDE.md` records that bounce visibility "deserves its own slice."
   User Story 4 states explicitly why that position is superseded here, rather than quietly absorbing
   the work.

**Deliberate judgement calls (no clarification requested):**

- **The parent namespace's mail records are in scope.** The user asked for "all the email, ses, domain
  related setup," and the apex currently has *no* mail records at all, so there is nothing live to
  break. Recorded as an assumption, with the two operator-supplied opaque values called out.
- **Bounce/complaint handling is included but priced at P2/P3**, so it is cuttable without invalidating
  P1. Included because the slice's central promise is otherwise unverifiable.
- **Production environment work is excluded** — no production environment root exists yet. The
  requirements are written per-environment so production is a rename.

**Iteration 2 — re-measured after operator clarification (same day):**

The operator clarified that `workspace-admin@effyshopping.com` is the account and
`hello@effyshopping.com` is an alias on it. Re-querying the authoritative servers showed the parent
namespace's records had **changed between sweeps**:

| Record | First sweep | Re-check |
| --- | --- | --- |
| Apex mail-exchanger | absent | **`1 smtp.google.com`, resolving** |
| Apex ownership proof | absent | **published** |
| Apex sender authorisation | absent | **still absent** |
| Signing record for the mail service | absent | **still absent** (no selector responds) |
| Apex alignment policy | absent | **still absent** |
| Apex / `www` address record | absent | **still absent** |

Spec amended accordingly:

1. *Inbound is no longer a gap.* The claim "`hello@` cannot receive mail" was true at first
   measurement and is now false. Replaced with the measured state and a timestamped note, rather than
   silently deleted — the change of state is itself worth recording.
2. *A sharper gap replaced it.* The mailbox can receive but **cannot legitimately send**: nothing
   authorises or signs it. Effy's own human replies fail authentication at the two providers that
   matter most.
3. *A new ordering hazard became visible and is now a requirement (FR-021).* Publishing the parent's
   alignment policy before authorising and signing the mail service would quarantine Effy's own
   replies. Getting these two in the wrong order breaks support mail in a way nobody would attribute to
   a DNS change.
4. *A new gap: the records exist only in the console* (new §2a, FR-024). The platform's definitions for
   the parent namespace declare the zone and no records at all, so they must be **adopted**, not
   re-declared — a second declaration of the same name collides instead of taking ownership. SC-021
   proves adoption by requiring a clean no-op dry run.
5. *Do-no-harm criterion added* (SC-022): inbound must be confirmed working before **and** after every
   change to the parent namespace. It works today and this feature must not be what breaks it.
6. Requirements renumbered — the human-mailbox block grew from 5 to 7, shifting the remainder to
   FR-026…FR-044. All cross-references updated.
