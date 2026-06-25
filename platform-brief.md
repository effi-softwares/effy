# Effy Platform Brief — Rebuild for a Clean Foundation

> **What this is:** The product/business framing for rebuilding Effy. This is NOT a product
> pivot — Effy stays the same grocery-delivery platform. The rebuild is about a cleaner
> foundation, consistency across surfaces, completing what's unfinished, and adopting a
> disciplined spec-driven process. This brief is the reference every spec and the constitution
> draw from.
>
> **Status:** Draft to refine. Replace any `<...>` and resolve every `OPEN:` before the first
> feature spec.

---

## 1. The one-line summary
Effy stays a **grocery-delivery platform** (customers, drivers, stores, admin). We are
**rebuilding it from a clean foundation** — same product, better built — to fix structural
problems, finish what's incomplete, and work spec-first going forward.

## 2. Why rebuild (the real pains)
1. **Hard to add features** — changing/adding things is slow or fragile in today's codebase.
2. **Inconsistent across apps** — the six surfaces drift apart: duplicated logic, mismatched
   UI, no single source of truth for contracts/design.
3. **Incomplete** — key flows are stubbed/half-done (checkout, orders, dispatch, dashboards).
4. **Want a disciplined process** — adopt spec-driven development (Brief → spec → plan → tasks)
   so the platform is documented and intentional as it grows.

> Honest note: pains #1, #2, #4 are *structure & discipline* problems solvable without a
> rewrite. The user has chosen a fresh start anyway (clean slate, shed baggage). This brief
> respects that decision; the de-risking control is "vertical slice first" (see §8).

## 3. The product (unchanged — for reference)
Grocery delivery across six surfaces:
- **Customers** — browse catalog, build cart, checkout, track orders, reorder.
- **Drivers** — receive dispatched deliveries, navigate, proof-of-delivery.
- **Stores / operators** — manage profile, products, inventory, fulfill orders.
- **Admin / back-office** — manage users/drivers/stores/catalog, RBAC, audit, merchandising.

## 4. What success looks like
**Feature parity with today's platform, but cleaner** — every existing capability rebuilt in
the new structure where adding features is fast and the six surfaces stay consistent via shared
packages. (Completing the currently-stubbed flows is in scope as part of reaching a genuinely
usable platform — checkout, orders, dispatch.)

## 5. What STAYS (keep the stack — lock in the constitution)
The existing architecture is modern and intentional; we keep it:
- Mobile: Kotlin Multiplatform + Compose (shared iOS/Android), Clean Architecture + MVI.
- Web: React 19 + TypeScript, shadcn/ui + Tailwind, TanStack Query, Zustand.
- Backend dual-path: Go (Gin + pgx) on Fargate for the hot path; TS Lambdas for the cold path.
- Data: PostgreSQL 16, raw SQL, Goose migrations (no ORM).
- Auth: 4 isolated AWS Cognito pools (customer/driver/store/admin), per-pool JWT, EMAIL_OTP.
- Infra: Terraform, multi-env.
- Design: Jade brand (#0FB57E / fill #047857), native-feel mobile, dark mode.

## 6. What CHANGES (structurally — the point of the rebuild)
- **Monorepo** instead of ~11 separate repos.
- **Shared packages** as the single source of truth: design-system, api-client, shared-types,
  config. Cross-cutting changes happen once.
- **Spec-driven workflow** for every feature.
- **Finish the incomplete flows** rather than carrying stubs forward.
- OPEN: any specific architecture changes within the kept stack? (e.g. consolidate the two
  backends? change how clients are generated? — decide during /constitution.)

## 7. Constraints & context
- **Not live:** only the dev environment is deployed; light testing in dev. **No production
  users or data → no migration/cutover plan needed.** True clean build.
- **Timeline:** replace the old platform ASAP — favor momentum; the old platform is not a
  long-term parallel system.
- **Team:** solo / very small.

## 8. First slice & sequencing (the de-risking control)
- **First slice: Auth + customer onboarding, end-to-end** (Cognito customer pool → KMP app +
  web → Go hot path → DB profile). Proves the 4-pool auth + dual-path + monorepo + shared
  packages all at once, and unblocks everything else.
- **Second slice:** Customer catalog browse (read-heavy hot path).
- Then port-and-clean the remaining surfaces aggressively, one slice at a time.
- Rule: don't rebuild all six apps in parallel. One vertical slice proves the foundation before
  we scale the pattern — so if "from scratch" proves slow, we learn it in weeks, not months.

## 9. Non-negotiables (these become constitution articles)
- Keep the stack in §5. Native-feel mobile. Jade brand + dark mode. 4-pool auth isolation.
  Dual-path backend discipline. No ORM. Shared contracts are the source of truth.

## Open questions parking lot
- OPEN: Within the kept stack, any consolidation? (two backends → one? client codegen approach?)
- OPEN: Order of surfaces after customer (driver vs store vs back-office) — by business priority.
- OPEN: How aggressively to port existing code vs rewrite per module (decide per slice in /plan).
