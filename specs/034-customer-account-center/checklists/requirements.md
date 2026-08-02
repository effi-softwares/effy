# Specification Quality Checklist: Customer Account Centre

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-02
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — **both resolved by the operator, 2026-08-02**
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

## Notes

**Validation iteration 1 — findings and resolutions**

1. **UI-pattern vocabulary ("bottom sheet", "drawer", "floating action button") is retained.** These are
   product decisions the operator specified by name, not technology choices, and feature 022's committed
   spec uses the same vocabulary. Consistent with house style.

2. **A conflict with the brief was found, researched, and resolved in the brief's favour.** An initial
   reading suggested that blocking deletion during an active order risked App Review rejection. Completed
   research showed no store rule either way, and that **both named reference platforms (Uber, eBay) plus
   Instacart block on active obligations**. The rejections on record are *deactivation-only flows with a
   support agent in the loop* — a different shape. FR-042 therefore implements the brief, with the
   "unnecessarily difficult" clause converted into three testable conditions (name the blocker, route to
   it, say when it clears) and a prohibition on dead ends.

3. **Three requirements amend or settle earlier committed artifacts.** Recorded rather than applied
   silently, per constitution Principle I:
   - **FR-032 amends feature 022's FR-007**, which mandates the floating action button being removed.
   - **Feature 012's FR-001–FR-005 (initials avatar) are NOT amended** — see item 4.
   - **FR-030 settles an existing disagreement** between customer-web and customer-mobile over whether
     sign out is styled destructive.

4. **Two [NEEDS CLARIFICATION] markers were raised and resolved by the operator on 2026-08-02.** Neither
   had a reasonable default — the survey confirmed no phone exists on the customer record and no stored
   image exists anywhere on the platform, so both were net-new data named in the brief.
   - **Phone: added, explicitly UNVERIFIED.** FR-060a forbids any verified indicator and bars the value
     from every identity path, because a value shown as confirmed when it is not is a lie a shopper will
     rely on. FR-060b additionally forces the relationship with the per-address delivery phone to be
     explicit, so two fields cannot disagree about who a driver should call.
   - **Avatar: stays generated from initials.** No upload, so **feature 012's FR-001–FR-005 stand
     unamended** — the tension noted in item 3 is dissolved rather than resolved by amendment.

4a. **A third question was asked and materially widened the feature: scope is BOTH customer surfaces**,
   not mobile-only as first assumed. FR-058/058a/058b, SC-016 and SC-017 were added, the deferred-parity
   assumption was deleted, and a note at the head of User Scenarios binds every story to both surfaces.
   ⚠ The guest bundle budget becomes a live constraint (`/search` and `/cart` sit 0.5 KB and 0.2 KB from
   the gate), which is why FR-058a and SC-017 exist.

5. **Unverifiable reference details were demoted, not deleted.** The spec carries an explicit
   "NOT treated as fact" table so that a later reader does not reinstate the green verified tick, the
   "Connected social apps" row, or a claim that Uber uses a bottom sheet — none of which research could
   confirm.

6. **One store-compliance risk is accepted and recorded** rather than resolved: placing deletion inside a
   Privacy sub-screen is one navigation level deeper than the "account settings" location both stores
   endorse. It matches the verified Uber path, so it is judged acceptable, and SC-007 makes a
   fresh-account reviewer the test.

7. **A promise-vs-capability gap is recorded as a blocking dependency, not a caveat.** The soft delete
   without the erasure job makes FR-040's disclosure unkeepable, so FR-041 and SC-011 forbid store
   submission until the erasure slice ships.

---

**Validation iteration 2 — post-plan cross-artifact analysis (2026-08-02)**

A consistency pass across spec/plan/tasks/research/data-model/contracts found **four critical issues**,
all clustered on the same knot: closure vs. restore vs. re-registration vs. the blocking window. All
four are resolved, and the spec now carries **seven** amendments rather than five.

8. **⚠ FR-042 was wrong a SECOND time, and the second error was mine.** Phase 0 fixed "ever paid ⇒ never
   deletable" by bounding the paid-order block at 30 days — matched to the grace period. But Effy is a
   **weekly-re-buy grocery platform**, so a shopper buying every week is always within 30 days of an
   order: the fix merely replaced one permanent block with another, for exactly the platform's most
   active customers. The window is now **7 days**, fulfilment-shaped, and explicitly decoupled from the
   grace period — the two answer different questions and should never have shared a number.

9. **FR-041 and the grace window contradicted each other outright.** "Refused on every surface" plus
   "signing in restores" required the same authenticated request to be both refused and honoured.
   Resolved by FR-041a: restore is an **explicit call**, not an inference from any authenticated read —
   which is also the safer design, since a stolen token must not silently un-delete an account.

10. **FR-048 forbade something the design requires.** Keying on the provider subject, leaving the
    provider account intact for restore, and converging one verified email onto one subject mean the
    same email *necessarily* reaches the closing record during the window. The prohibition now binds
    **after erasure** (FR-048), and FR-048a states that during the window the same email is the same
    person returning.

11. **Six requirements had no task at all** (FR-023, FR-031, FR-046's entry point, FR-055, plus SC-002
    and SC-018's second half), and **FR-055 named no number** — the precise shape of the 033 defect where
    a 32 dp control shipped beneath a comment claiming compliance. FR-055 now says **48 dp**.

12. **The one security-critical backend change had no verification.** T013 edits Go, and neither the
    machine sweep nor the quickstart ran `go build`/`vet`/`test`. Both now do, plus a unit test (T013a).

13. **Three `[P]` markers contradicted notes in the same document** (T008, T015, T016 — all sharing a
    file with a sibling task). Removed: a marker an agent will follow beats a caveat it will not read.

14. Mechanical corrections: three stale task IDs in the preamble, a self-referential dependency note, a
    5-vs-4 route count, two conflicting bundle-headroom figures, and `both mobile apps` (which reads as
    shop+customer) → `iOS and Android`.
