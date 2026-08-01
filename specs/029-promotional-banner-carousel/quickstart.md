# Quickstart: Promotional Banner Templates & Home Carousel

**Feature**: 029-promotional-banner-carousel | **Phase**: 1

⚠ **§4 is the point of this feature.** 028 shipped the banner path and signed off without ever running
it, so **no promotional banner has rendered on this platform**. Everything else here is preparation for
that walk.

**Operator-run steps are marked.** Claude authors the migration and the code but does not run `db-up`,
`edge-deploy`, or anything touching live AWS.

---

## Prerequisites

- 028 merged; `20260731072813_promo_advertising.sql` applied (it already is in dev)
- Local `core-api` running (`make core-run`) against the dev database
- Back-office access as `admin` or `manager`
- An iOS simulator **and** an Android device or emulator — ⚠ 028 was only ever seen on iOS
- Any image editor for §2 (or nothing at all — the template is the point)

---

## 1. Machine gates

```bash
make cm-contract-check          # generated Kotlin matches shared-types
make cm-tokens-check            # ⚠ EXPECTED TO CHANGE — see below
pnpm --filter @effy/design-system banner-template:check   # the template matches the constants
make cm-guard
bash scripts/check-no-emerald.sh && bash scripts/check-no-jade.sh

pnpm -r typecheck && pnpm -r test && pnpm turbo build
cd apis/core-api && go build ./... && go vet ./... && gofmt -l . && go test ./...
cd apps/customer-mobile && ./gradlew :shared:allTests :androidApp:assembleDebug
```

⚠ **`cm-tokens-check` output CHANGES in this slice** — unlike 028, which required it to stay identical.
A real token is being added (the banner canvas). Regenerate with `make cm-tokens-gen`, commit the
output, then confirm the check is green. A red guard here is *the change*, not drift — do not "fix" it
by reverting.

---

## 2. The operator's tool (US1)

1. Open a promotion in the back-office and turn on **Advertise on storefront**.
   - **Expect**: a placement control appears, defaulting to **offers carousel**.
2. Download the banner template.
   - **Expect**: a **1200 × 600** file with the **text zone marked lower-left**.
3. Design anything onto it and upload.
   - **Expect**: accepted; the preview shows the artwork with the live message over it.
4. Upload a **square** image instead.
   - **Expect**: a specific refusal naming the required shape, with the template offered. ⚠ **Never a
     silent crop.** An interactive crop tool is deliberately out of scope for this slice, so refusal is
     the whole of the non-2:1 path.
5. Look at the preview at a narrow width.
   - **Expect**: what a phone will show — same proportions, message legible.
6. Save with **no artwork at all**.
   - **Expect**: still valid; the banner will render as legible text at the canonical proportions.

### 2a. ⚠ Prove the console is not the guard

```bash
# OPERATOR — the enforcement claim is only real if it survives bypassing the UI.
# Presign, then PUT a deliberately wrong-shaped image straight to S3, then save the key.
```

- **Expect**: the **save** is refused with a field-level message about dimensions.
- If it succeeds, FR-004 is decorative and the server-side verification is not doing its job.

---

## 3. Rendering (US2, US3) — device

**⚠ Both platforms.** 028's SC-013 was never done because only iOS was ever looked at.

7. Load Home with one advertised carousel promotion.
   - **Expect**: a titled offers section, one banner, **no position indicator**, correct 2:1 shape.
8. Add two more; reload.
   - **Expect**: swipeable, position indicator, **does not auto-advance**.
9. Watch the banner area while artwork loads.
   - **Expect**: the space is already the right shape; **nothing below it moves** when the image lands
     (SC-005).
10. Rotate to landscape / open on a tablet.
    - **Expect**: bounded and centred, **not stretched**. Proportions unchanged (SC-003).
11. Compare the banner's rendered ratio against 2:1 at the narrowest and widest windows.
    - **Expect**: within **1%** and no visible distortion.
12. Switch to **dark**, then to the **largest system text size**.
    - **Expect**: the message stays legible over the artwork in both, no clipping (SC-008).
13. Turn on the screen reader.
    - **Expect**: the message is read as text; the offers section is a bounded named group you can step
      **past** (SC-009).
14. Set one promotion to **between sections**; reload.
    - **Expect**: it appears there and **not** in the carousel (FR-027).
15. Set no placement on a newly advertised promotion.
    - **Expect**: it lands in the **carousel** — never nowhere (FR-027a).
16. Advertise more than six carousel promotions.
    - **Expect**: six shown, and the drop **logged** rather than silent (FR-026).

---

## 4. ⚠ THE LOOP — the first banner ever rendered (US5)

**Operator-run.** Requires:

```bash
make db-up ENV=dev                      # the placement migration (commit it first — 003 guard)
make edge-deploy SERVICE=admin ENV=dev
make core-run                           # rebuilt, for the placement read
```

17. Create a promotion, produce its banner, mark it advertisable, choose a placement, save.
18. Load Home on a **real device**.
    - **Expect**: the banner, with its artwork, message, terms and code. **SC-010** — and the first time
      anyone has seen one.
19. End the promotion (or disable it, or un-mark it). Reload.
    - **Expect**: gone, with no app release.
20. Leave a promotion **active but NOT advertised**.
    - **Expect**: it appears **nowhere** (SC-011). ⚠ The private-credit case — the one that turns one
      customer's goodwill into a storewide discount if it leaks.
21. Exhaust an advertised promotion's `max_redemptions`. Reload.
    - **Expect**: gone — because the redemption count says so, not because anyone flipped a flag.
22. Query every stored banner's dimensions (SC-002).
    - **Expect**: **100%** are exactly 1200 × 600. T003 proved the set started empty and §2a proved the
      bypass is refused; this is the only step that checks the set that actually accumulated.

---

## 5. Measurements and the open question

Pin the same reference device and network profile 028's §5 asks for, and record:

| Metric | Target |
|---|---|
| Banner artwork size after normalisation | **≤ 150 KB** |
| Layout shift when artwork loads | **zero** |
| Rendered aspect ratio vs. 2:1, narrowest and widest | **within 1%** |
| Time for an operator to publish a first banner | **< 5 min** (SC-001) |
| Testers who can say what the current offer is, unprompted | **5 / 5** (SC-012) |

### ⚠ The question this feature exists to answer

Research R9 of 028 asked whether a **hueless** banner draws the eye, and it has been unanswerable
because no banner ever rendered. After §4 it is answerable for the first time.

If the banner reads too quietly, the fix is contrast **within the neutral ramp** and the scrim's
gradient — **never a new colour**. A colour would fail `check-no-emerald.sh` and violate Principle V.

---

## 6. Sign-off checklist

- [ ] §1 gates green, with `tokens:check` regenerated **and committed**
- [ ] §2 walked, including **2a's bypass attempt**
- [ ] §3 walked on **both Android and iOS** — the comparison 028 never did
- [ ] §4 walked: a banner rendered, then disappeared on its own
- [ ] §5 measurements recorded, and **028's** R9 question answered one way or the other
- [ ] **SC-004 noted as satisfied by construction** — no artwork is cropped at any width, because the
      artwork and the render box share one ratio. There are no crop boundaries to inspect; SC-003's
      ratio check is its proof.
- [ ] Parity register updated — [docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md) §029
