# Specification Quality Checklist: Refunds & Order Cancellation

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-29
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

## Notes

- **The payment provider is deliberately unnamed throughout.** The spec says "the payment provider" and
  "the payment method the customer originally paid with" — the vendor is a plan-level fact. What is
  *not* deferred is the vendor-independent behaviour every card refund has: it is asynchronous, it can
  fail days later, and partial refunds accumulate against a ceiling. Those are in the requirements
  because a spec that omits them produces an implementation that gets them wrong.

- **Three findings from the research pass shaped the scope and are recorded in the spec body rather
  than left for planning:**
  1. **There is no free cancellation window.** Effy captures at payment, so the provider's cancel
     operation never applies and a cancellation *is* a full refund (A1). The published policy's framing
     hides this.
  2. **The published refunds policy already promises four outcomes the platform cannot deliver**, and
     tells customers to "use the app" to cancel when no such control exists. SC-010 walks that table.
  3. **A2 narrows the policy's "before it is dispatched" to "before any shop begins preparing."** The
     spec flags that the *prose* should be reconciled rather than the code stretched to match a looser
     promise — a legal document is not a requirement source when it describes something unbuilt.

- **US4 (a refund that fails) is P1 on purpose.** It is the requirement most likely to be dropped as
  polish, and dropping it produces a platform that confidently tells customers their money is coming
  when it is not. Marked as such in the story's own rationale.

- **Zero clarification markers.** Every open question had a defensible default drawn from the
  published policy, the existing payment integration, or industry-standard refund behaviour; each is
  recorded in Assumptions with its reasoning. The three most worth challenging in `/speckit-clarify`
  are **A2** (when the cancellation window closes), **A5** (nothing refunds automatically, not even a
  recorded shortfall), and **A10** (partial refunds do not return the delivery fee).

- **Re-validated 2026-08-29 after `/speckit-clarify`** — 16/16 still passing, no item changed state.
  Five questions asked and answered; the spec grew from 32 to **44 functional requirements**, 11 to
  **16 success criteria**, and 5 to **6 user stories**.

  Two answers changed the slice's shape rather than filling a gap:
  1. **A customer refund request is now in scope** (new US3, FR-005a–c). It replaces "email support and
     hope" with an ask attached to the order — but it is explicitly **not** a message thread, and it
     moves no money.
  2. **A pick shortfall now proposes a refund** (FR-004a–c). The platform already has its own staff's
     evidence that a customer paid for something they did not receive; making them ask for it was the
     failure G3 describes. A person still decides.

  One answer put a **prose correction inside this slice's definition of done**: FR-016a and SC-010a
  require the published cancellation wording to be fixed, because A2 is narrower than what is
  published. A live legal document disagreeing with the product is the defect — not the requirement.

  The three assumptions flagged for challenge were all confirmed (A2 narrower window, A5 nothing
  refunds automatically, A10 delivery fee excluded from partial refunds) — but A5 was **refined**
  rather than merely upheld: nothing refunds automatically, and a shortfall now pre-fills the decision.

- **Re-validated 2026-08-29 after `/speckit-analyze`** — 16/16 still passing; **46 FRs** (was 44) and
  **105 tasks** (was 100). Twenty-two findings, none CRITICAL. All four HIGH ones were verified against
  the real files before acting, and all four were real:
  1. **SC-010 was unachievable as written.** The live policy's outcome table has **four** rows, two of
     which promise a *replacement* — which this slice explicitly does not build. ⚠ This spec had
     reproduced only **three** rows and then counted four, which is exactly how a promise goes
     unnoticed. The table is now complete and SC-010 is scoped to the refund arm.
  2. **Editing the policy would have turned the whole workspace suite red.** `@effy/legal-content`'s
     `test` script runs a drift check first; a markdown edit without `legal:gen` fails with
     *"src/generated/documents.ts is stale"*. T055a now regenerates and commits both derived
     artifacts (TS and the mobile Kotlin).
  3. **The policy is now SUPERSEDED, not edited.** The 045 system is version-file based precisely so a
     document a customer has already read keeps its text and its date; T055 authors `v2.md` and marks
     v1 superseded.
  4. **Two shop surfaces were missing from the plan** despite T076 building on them.

- **⚠ One correction to this project's own record**: data-model and research both claimed the
  `shop_fulfillment.status` CHECK had been widened by 053. It was not — 053's migration header says
  *"No new state, no widened CHECK"*. Corrected in both.

- **Three requirements had no builder and now do**: FR-011 (no fee deducted from the customer),
  FR-023 (fully-refunded identifiable), FR-006 (no destination accepted — now a negative proof).
  FR-005b's decline outcome had no channel; it is now shown on the order and deliberately **not**
  emailed.

- **T009 could not have completed** — its negative proof referenced a route built three phases later.
  Split: the customer→admin direction stays in Phase 2, the reverse becomes T053a beside the route it
  needs.
