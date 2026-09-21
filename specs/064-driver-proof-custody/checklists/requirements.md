# Specification Quality Checklist: Driver Proof of Delivery & Custody

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-21
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

**All items pass.** Validated 2026-09-21; re-validated after planning amendments.

### Settled before planning

1. **Proof media retention (FR-025).** ⚠ **REVERSED DURING PLANNING on operator direction.** First
   settled as *90 days then deleted*; now **archived indefinitely** — proof is evidence and must
   survive for audit and legal questions. Media moves to archival storage at 90 days, the point the
   active dispute window closes (055 allows a refund to be rejected up to 30 days later).
   ⚠ The reversal **removed** scope rather than adding it: a shared retention module, a derived
   "has this expired?" answer on three read paths, and the test keeping that derivation in agreement
   with the Terraform number all cease to exist (research R6).
2. **Customer visibility of proof (FR-027).** **Settled: not this slice.** FR-027 additionally
   requires that nothing here forecloses it.

### Found during planning — spec amended in place (Principle I)

Three spec statements were **wrong** and were corrected in `spec.md` rather than worked around:

- ⚠ **FR-001/FR-003 — the `code` proof method is deferred.** No delivery code exists anywhere on the
  platform; `delivery_code` appears in no service, migration, contract or app. Verifying one requires
  issuing one and showing it to the customer, which FR-027 just scoped out. This slice ships **three**
  methods; the service refuses `code` with a named refusal and the deferral is pinned by a test
  (research R4).
- ⚠ **Camera and signature capture already exist.** The spec assumed this slice would build them;
  `PhotoCapture`, `CameraPreviewSurface`, `PngEncode`, `PermissionRequester` and `ImageUpload` are all
  present with both Android and iOS implementations, from 049 and 060. The mobile work is wiring
  (research R8).
- ⚠ **FR-026 inverted.** Under time-limited retention a missing media object was an expected state to
  render politely. Nothing deletes media now, so an absent object means something is **wrong** — it is
  an alarm, not an empty state.

### The finding that most changes the slice's weight

⚠ **A same-day order cannot currently reach `delivered` at all.** The only writer of that status is
053's back-office *manual arrival* path, built for standard carrier packages. The driver who hands the
package over has no way to record it. So the proof route is not an annotation on a completion — **it
is the completion**, and it must write `package_arrival` and call the shared
`enqueueOrderDeliveredIfComplete`, whose own header already names `edge-api/driver` as a caller that
does not yet exist (research R2/R3).

⚠ Note for implementation: `check-no-phantm` and the banned-address rules apply to every artifact in
this directory. No real-world identifier appears in any of them, and none may be introduced without
being asked for.
