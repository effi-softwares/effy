# Quickstart: Customer Mobile Home — Sectioned Merchandising & Search Entry

**Feature**: 028-mobile-home-merchandising | **Phase**: 1

The runnable validation walk. §1–§2 are what a machine can prove. §3–§5 are the **live** walk on a
device, which is where this feature is actually judged — a home screen is a thing you look at.

**⚠ Operator-run steps are marked.** Claude authors the migration and the code but does not run
`db-up`, `edge-deploy`, or anything touching live AWS.

---

## Prerequisites

- Local `core-api` running (`make core-run`) against the dev database
- A seeded catalogue with **at least two top-level categories that have products** — without it,
  neither SC-004 nor a multi-section Home can be judged
- Android emulator or device (API 24+) and/or an iOS simulator
- Back-office console access as an `admin` or `manager` (for §4)

---

## 1. Machine-verifiable gates

Run from the repo root. All must pass before the live walk means anything.

```bash
# Contracts and drift — Principle II
make cm-contract-check          # generated Kotlin matches shared-types
make cm-tokens-check            # Compose theme matches tokens.css (must be UNCHANGED — this slice adds no token)
pnpm --filter @effy/design-system mobile-assets:check   # new icons synced; no STALE/MISSING/ORPHANED

# Design law — no retired brand values may enter with new assets
bash scripts/check-no-emerald.sh
bash scripts/check-no-jade.sh
make cm-guard                   # escape-hatch ban + no secret-shaped keys

# Workspace
pnpm -r typecheck
pnpm -r test                    # includes edge-api admin + back-office promotions
turbo build                     # the three web surfaces; customer-web must still build with the new BannerDTO

# Hot path
cd apis/core-api && go build ./... && go vet ./... && gofmt -l . && go test ./...
```

**Mobile:**

```bash
cd apps/customer-mobile
./gradlew :shared:allTests          # commonTest on Android + iOS targets
./gradlew :androidApp:assembleDebug
./gradlew :shared:compileKotlinIosSimulatorArm64
```

**⚠ `cm-tokens-check` must pass UNCHANGED.** This feature adds no design token. If it reports a diff,
a colour has been introduced somewhere — which is a Principle V violation, not a token update.

---

## 2. Unit-level proofs worth naming

These are the pieces that carry logic rather than layout, and each is testable without a device:

| What | Where | Proves |
|---|---|---|
| `composeHome(home, categories)` | mobile `commonTest` | Banner interleaving by position; **out-of-range position clamps to the end** (never drops a live promotion); empty rails skipped; category row omitted when empty |
| `categoryIcon(key)` | mobile `commonTest` | Every known key resolves; **an unknown key returns the fallback glyph**, never null |
| The nav focus one-shot | mobile `commonTest` | `requestSearchFocus()` then `consumeSearchFocus()` returns true once and false thereafter |
| `CustomerNavKeySerializationTest` | mobile `commonTest` | The new `Results` route round-trips. ⚠ **An omission here fails on iOS only and passes every Android test.** |
| Banner visibility predicate | `go test ./internal/features/storefront/...` | Window, exhaustion, disabled and not-advertised each exclude; a live promotion includes |
| Advertising validation | Vitest (edge-api admin) | Advertised-without-title refused with a field-level message |
| FR-068 value immutability | **existing 027 tests, unmodified** | The advertising facet did not weaken the redeemed-code guard |

---

## 3. Live walk — the shopper (device)

Run `make core-run`, point the app at it, and open the app **signed out** (Home is public — FR-047).

### §3.1 Search entry (US1 · SC-001)

1. Tap the search entry on Home.
   - **Expect**: Search appears with the field focused and **the keyboard already up**. One tap, no second.
2. Type `milk`, press the keyboard's search action.
   - **Expect**: results for `milk`; the keyboard dismisses so results are not obscured.
3. Press Back.
   - **Expect**: Home, **at the scroll position you left it**, with no reload flash.
4. Tap the search entry, submit with the field empty.
   - **Expect**: nothing happens; the field keeps focus.
4a. Run a search, press Back to Home, then tap the search entry again and type.
   - **Expect**: the previous query is **still there** and **selected**, so typing replaces it in one action
     (FR-012a). A retained query the shopper has to delete character by character is worse than a cleared one.

### §3.2 Sections (US2 · SC-002, SC-003, SC-005, SC-006, SC-007)

5. **Without scrolling**, look at Home.
   - **Expect**: at least one **real product** is visible. ⚠ This is SC-002 and it is the criterion the
     026 reversal is most likely to break. If merchandise is below the fold, the layout is wrong.
6. Count the named sections.
   - **Expect**: **≥ 3** distinct named sections; **zero** empty sections or headings above nothing.
7. Drag a section sideways.
   - **Expect**: the row scrolls; **the page does not move vertically**.
8. Look at a section at rest.
   - **Expect**: a **partial next tile** at the trailing edge. A row that ends flush reads as complete.
9. Measure a section against the screen.
   - **Expect**: **no section exceeds half the viewport** (SC-005).
10. Swipe down to the last section, counting swipes.
    - **Expect**: **≤ 4** (SC-006).
11. Screenshot two adjacent section boundaries and compare.
    - **Expect**: **identical** gaps (SC-007).
12. Tap a section's **See all**.
    - **Expect**: that section's full contents, scope stated on screen; **Back returns to Home**, not to
      the Search tab.

### §3.3 Category shortcuts (US3 · SC-004)

13. Look at the category row.
    - **Expect**: icon-above-label entries, horizontally scrollable, covering **at least 30–40%** of the
      store's top-level categories, and spanning **genuinely different** kinds of product before any scroll.
14. Tap one.
    - **Expect**: products restricted to that category, with the scope stated.
15. Create a category with no icon (or point one at an unmapped key).
    - **Expect**: the **fallback glyph** and a readable label. Never a blank tile or a broken frame.

### §3.4 Resilience and accessibility (SC-010, SC-011)

16. Pull to refresh.
    - **Expect**: content refreshes **in place** — no blanking, no lost scroll position.
17. Kill the network, then cold-launch.
    - **Expect**: a retry the shopper can act on — **not** a permanently empty store.
18. Restore the network, load Home, then kill the network and pull to refresh.
    - **Expect**: **what is on screen stays**. "We couldn't check" must never read as "there is nothing here".
19. Turn on the platform screen reader. Traverse Home end to end.
    - **Expect**: every element announced; each horizontal section announced as a **bounded, named group**
      you can move past without getting stuck (SC-010).
20. Turn on **reduced motion**. Swipe the banner; navigate.
    - **Expect**: transitions suppressed or reduced; navigation still works.
21. Switch to **dark**, then to the **largest system text size**, then rotate a **tablet to landscape**.
    - **Expect**: no clipped text, no overlap, **no horizontally scrolling page body** (SC-011).

### §3.5 Empty store (SC-012)

22. Point at a store with no products, categories or promotions.
    - **Expect**: **exactly one** empty state. No section headings, no banner, no placeholder.

---

## 4. Live walk — the operator (back-office → device)

**⚠ Operator-run.** Requires the migration applied and the admin service deployed:

```bash
# OPERATOR — commit the migration first (003 commit-guard), then:
make db-up ENV=dev
make edge-deploy SERVICE=admin ENV=dev
```

23. In the console, open a promotion. Turn on **Advertise on storefront**, give it a banner title, save.
24. Reload Home on the device.
    - **Expect**: the banner appears, showing the title, the code, and — if the promotion has a minimum —
      its **terms sentence** (FR-037d). SC-014.
24a. Upload banner artwork to that promotion, save, and reload Home.
    - **Expect**: the artwork renders **behind readable text** — the headline and terms must stay legible over
      it (FR-033: real text, never baked into the image). Then **clear** the artwork and save.
    - **Expect**: the promotion is still valid and still advertised, now text-only. Artwork is optional, so
      removing it must never invalidate a live promotion.
25. Create a **second** advertised promotion with a different position.
    - **Expect**: both appear, swipeable, with a position indicator, at the declared positions **between
      sections** — not stacked at the top (FR-030).
26. Watch the banner for a minute without touching it.
    - **Expect**: **it does not advance on its own** (FR-032).
27. Tap a banner.
    - **Expect**: it lands where it advertises, and that destination is reachable elsewhere in the app
      without the banner (FR-034).
28. Leave a promotion **active but NOT advertised**.
    - **Expect**: it appears **nowhere** on Home (SC-015). ⚠ This is the private-credit case — the one
      that turns a single customer's goodwill into a storewide discount if it leaks.
29. Set an advertised promotion's `ends_at` to the past (or disable it). Reload Home.
    - **Expect**: **gone**, with no app release (SC-014, FR-037c).
30. Exhaust an advertised promotion's `max_redemptions`. Reload Home.
    - **Expect**: **gone** — because the redemption count says so, not because anyone flipped a flag.
31. Try to save an advertised promotion with an empty banner title.
    - **Expect**: a field-level refusal, not a 500.

---

## 5. Measurements to record at sign-off

### ⚠ Pin the conditions first, or none of this is falsifiable

SC-002, SC-006 and SC-008 all say "a standard phone" and "a typical connection". Those are not
measurements until they name something. **Pin these once, in T003, and reuse them for every later run:**

| Condition | Value | Why it matters |
|---|---|---|
| Reference device (Android) | _record in T003_ — e.g. Pixel 7, portrait | "Four swipes" depends on screen height |
| Reference device (iOS) | _record in T003_ — e.g. iPhone 14, portrait | SC-013's side-by-side needs comparable screens |
| Swipe length | a full-height drag, thumb to top of screen | SC-006 counts swipes; an undefined swipe makes the count meaningless |
| Network profile | _record in T003_ — e.g. 4G Regular throttling | SC-008's 2 s is otherwise a measure of your office wifi |

### Results

| Metric | Target | Baseline (T003, current grid) | After | How |
|---|---|---|---|---|
| Home first meaningful content | **< 2 s** | _record_ | _record_ | Cold launch on the pinned profile (SC-008) |
| Product visible without scrolling | ≥ 1 | _record_ | _record_ | Screenshot the unscrolled screen (SC-002) |
| Swipes to the last section | **≤ 4** | _record_ | _record_ | Full-height drags on the reference device (SC-006) |
| Section images after visible | **< 1 s** | n/a | _record_ | Scroll to an unseen section |
| Home read server time | **well within 3 s** | _record_ | _record_ | `core-api` log for `GET /v1/storefront/home`, with and without an advertised promotion |
| Rail scroll | 60 fps, no jank | n/a | _record_ | Drag a full rail |
| Task completion | **5 / 5** testers open a specific product with no help | n/a | _record_ | SC-009 — see below |

### ⚠ SC-009 needs a script, not just a number

"Five out of five first-time testers" is the **only** in-slice check on research R9's open risk: does a
monochrome banner, stripped of every hue by constitution v1.11.0, actually draw the eye? Before running it,
write down the task each tester is given ("find and open a specific product you have in mind" — they pick it,
not you), whether they are told anything about promotions (they must not be), and what counts as a failure
(opening a menu, or asking for help). An unscripted five-person walk measures the facilitator, not the design.

**⚠ Record the Home read time both with and without an advertised promotion.** The banner query is one
added query on a read that already issues up to seven; 027's cart write timed out at ~14 round trips to
Sydney RDS. One is fine — the number is recorded so the next person adding a query starts from a
measurement rather than an assumption.

---

## 6. Sign-off checklist

- [ ] §1 machine gates all green, `cm-tokens-check` **unchanged**
- [ ] §2 unit proofs green, including the **iOS** serialization round-trip for `Results`
- [ ] §3 walked on **both** Android and iOS; SC-013 side-by-side comparison shows the same sections in
      the same order
- [ ] §4 walked by the operator, including the **not-advertised** case (SC-015) and both automatic
      take-downs (expiry, exhaustion)
- [ ] §5 measurements recorded
- [ ] Parity register updated — [docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md) §028
- [ ] **The open design risk answered**: did the monochrome banner actually get tapped? (R9). If it
      reads too quietly, the fix is contrast **within the neutral ramp** — never a new colour.
