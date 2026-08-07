# Sign-off: 039 — Customer Web Home, Merchandised Landing Redesign

**Date**: 2026-08-07 · **Status**: **CODE-COMPLETE, PARTIAL BY DESIGN** — 84/94 tasks.
**Not committed. Not deployed. Not walked by a person.**

Every buildable task is built and machine-verified. What remains is ten tasks: five deferred UI
reviews, three operator deploy steps, the commit, and this record.

---

## The Success Criteria, walked honestly

⚠ **"Proven" below means a machine proved it.** No human has looked at this page outside the
screenshots taken during construction. Where a criterion needs a person, it says so.

| SC | Claim | Verdict | Evidence / what is missing |
|---|---|---|---|
| **SC-001** | Guest understands the hero within the first screen; no broken image, no layout shift | ⚠ **PARTIAL** | Machine: hero in raw SSR HTML, both actions, placeholder path with no `<img>`, identical band height in both states, crop anchored to the flat zone. ⚠ "Understands within the first screen" is a **judgement about a person** and needs T020. |
| **SC-002** | Category listing in one tap; full set in one more | ✅ **PROVEN** | e2e takes both taps against a production build and asserts the destination URLs. |
| **SC-003** | ≥3 distinct merchandised sections, each using the unchanged product card | ✅ **PROVEN** | e2e counts rail actions (≥3) and resolves every "view all"; `ProductCard.tsx` is under the FR-002 lock guard, so "unchanged" is enforced, not asserted. |
| **SC-004** | 100% of chrome on the ramp; guards pass with zero new tokens | ⚠ **PROVEN, WITH ONE RECORDED EXCEPTION** | `check-tokens`, `tokens:check`, `check-no-emerald`, `check-no-jade` all green and **`tokens.css` untouched**. ⚠ The three value-panel fills are a deliberate Principle V exception (FR-005a) — component-local, never tokens. That `tokens:check` passes *unchanged* is the mechanical proof it did not leak. |
| **SC-005** | Renders correctly across full data · no promotions · no categories · empty catalogue · catalogue error | ⚠ **4 of 5 PROVEN** | The composer is a pure function, so the first four are unit-driven and exhaustive (19 assertions). ⚠ The **catalogue-error** state was not exercised end-to-end — it needs `core-api` stopped mid-run. |
| **SC-006** | Legible and correct in light and dark across desktop, tablet, phone | ⚠ **PARTIAL** | Machine: four viewport × appearance combinations asserted for no empty-section headings and no horizontal overflow, plus screenshots at 1440 light/dark, 820, 390 and Pixel 7. ⚠ "Legible" is a human judgement. Deferred to T020/T028/T038/T048/T055. |
| **SC-007** | Guest page stays within the page-weight budget | ✅ **PROVEN** | `/` **172.7 KB / 174 KB**; `/newsletter/confirm` **168.2 KB**, added to the gate in the same change that created the route. Net **+1.0 KB** across six sections. |
| **SC-008** | Newsletter: valid → confirmation email; invalid caught before any request; already-subscribed non-leaking; never reveals account existence | ⚠ **CODE-PROVEN, NOT LIVE** | Machine: 30 service tests, 5 config-contract, 16 e2e; non-enumeration pinned by byte-comparing three results; native validation proven by asserting **no request is sent**. ⚠ **No email has ever been sent** — blocked on T082/T083/T084. |
| **SC-009** | Every target meets the minimum; exactly one h1 with correct order; no meaning by colour alone | ⚠ **PROVEN FOR 039's OWN WORK** | e2e asserts one visible `h1`, no skipped heading level, ≥44×44 on every standalone target, alt on every image, and that the app badges announce "coming soon" in their accessible name. ⚠ **Two pre-existing offenders excluded by name** — `SaveControl` (36×36, 39 instances) and carousel dots (8×8). |
| **SC-010** | Each section delivered and reviewable independently, in order | ✅ **PROVEN BY CONSTRUCTION** | Six sections landed in order, each verified before the next. The page stayed coherent throughout because every section self-hides. |

---

## What this slice actually found

Fourteen defects, and the pattern in them is worth more than the count.

**Two would have shipped silently and broken a real flow.**

1. ⚠⚠ **Every email's plain-text part was HTML-escaped.** Handlebars turns `=` into `&#x3D;`, so a
   tokenised URL rendered as `…/confirm?token&#x3D;ABC`. Harmless in HTML — clients decode entities in
   attributes. **In text/plain nothing decodes it.** Double opt-in would have failed for every
   plain-text reader with no error anywhere: send succeeds, mail arrives, link is visible, confirmation
   never happens. It lived in the shared `render.ts` and was invisible until a template first needed a
   URL with a query parameter.
2. ⚠ **The offers block was wired to a placement that does not exist.** The spec, the contract and the
   tasks all said `placement === "offers"`; `BannerPlacement` is `"carousel" | "inline"`. The filter
   would have matched nothing and the block would have rendered as **absent** — a *valid* state under
   FR-018, so it would not have looked like a bug.

**Four were caught only by looking at the page.** The orphaned divider, the backwards phone layout
(`order-first` applying at every breakpoint while `lg:` made desktop look right), the CTA hierarchy
vanishing in dark mode, and the scrim bleaching the artwork. Every unit test was green for all four.
These were not tests agreeing with the code — they asserted true things. **Layout, contrast and visual
hierarchy are not properties a DOM assertion can see.**

**Two were requirements that had implementation and no coverage.** FR-035's abuse resistance had no
test at all until T069a. FR-033's input preservation was *broken* — React resets an uncontrolled form
once its action completes, so the field cleared on every outcome including the failure whose whole
point is that the address survives. The error message read "your address is still here" while it
demonstrably was not.

**One was mine repeating this repo's oldest lesson.** A fixture invented three DTO fields — `slug`,
`price`, `compareAtPrice` — and `as`-cast them into shape. That is 033's recorded failure mode verbatim.

**And the guards did their job.** `make email-check` refused a template with no fixture. 024's
brand-check flagged the hero photograph as an orphaned asset. Both were correct.

---

## Decisions that went against the plan, and why

- **The newsletter form is a client component.** Research R3 preferred a param-driven result.
  **FR-033 requires the visitor's input to survive a failure**, and a redirect cannot carry it back
  without putting an email address in the URL — server logs, `Referer`, history. **+0.9 KB** was the
  better trade than turning a transient form value into PII written to three places.
- **Four of five telemetry events dropped.** Each needed a client boundary on a page with ~2 KB of
  headroom, and **PostHog has never been initialised on this surface** — they would have cost real
  bytes to record nothing. The plan now says so instead of implying measurement.
- **FR-035's gateway throttle was unbuildable where it was placed** — HTTP API throttling is a
  Terraform-owned *stage* property, and this service attaches via an external `httpApi.id`. Narrowed to
  the per-address cooldown, with the residual gap (per-source, not per-address) recorded rather than
  hidden.
- **Three hues entered UI chrome**, on operator direction — the platform's first. Bounded exactly as
  024 bounded the splash grounds, and `tokens:check` passing unchanged is the proof.

---

## Machine verification

`pnpm -r typecheck` **14/14** · `pnpm -r test` **14/14** · customer-web **351** · edge-customer **134**
(+35 newsletter) · email-kit **52** · `make email-check` **8 templates** · e2e **44** across
`home.spec.ts`, `newsletter.spec.ts`, `a11y.spec.ts` on a production build · `make storefront-locks`
(proven by breaking it) · `brand-check` · `check-tokens` · `tokens:check` · `check-no-emerald` ·
`check-no-jade` · bundle gate **10 routes**.

⚠ **The e2e suite is load-sensitive locally** — three tests flake at 4 workers against one server.
All pass at `--workers=2 --retries=1`, and `playwright.config.ts` already sets `retries: 2` in CI.

---

## Open (10 tasks)

**Operator, blocking the newsletter**: T082 commit the migration + `make db-up ENV=dev` · T083
`make edge-deploy SERVICE=customer ENV=dev` · T084 the live walk (gated on 038 being deployed).
⚠ Also needs `/effy/dev/web/site_url` in SSM, or the confirm link points at localhost.

**Deferred UI reviews**: T020 · T028 · T038 · T048 · T055.

**Remaining**: T095 commit.

Full detail — including six findings that are **not** 039's and must not be mistaken for it — is in
[quickstart.md](quickstart.md).
