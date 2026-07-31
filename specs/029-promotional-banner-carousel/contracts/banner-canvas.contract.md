# Contract: The Canonical Banner Canvas

**Feature**: 029-promotional-banner-carousel

One shape, defined once, consumed by three things that must never disagree: the operator's tool, the
generated template file, and the storefront renderer.

---

## The definition

| Property | Value |
|---|---|
| Canvas | **1200 × 600 px** |
| Aspect ratio | **2 : 1** |
| Accepted formats | `image/jpeg`, `image/png`, `image/webp` (unchanged from the shared media helper) |
| Normalised file size | **≤ 150 KB** |
| Text zone | inset 6% left/bottom · 58% width · 50% height, anchored lower-left |

**Source of truth**: `packages/design-system`. Emitted to Compose by the existing `tokens:gen` and
imported directly by the console. ⚠ **This changes `tokens:check`'s committed output** — regenerate and
commit deliberately; a red guard here is the change, not drift.

---

## The invariant that makes this work

**Artwork is 2:1 and the render box is 2:1, therefore the scale is uniform and nothing is cropped.**

FR-013 ("fill without stretching, crop only outside the safe area") reads like it needs crop
arithmetic. It does not. Locking both ends removes the case entirely — which is why enforcement
(below) carries more weight than the drawing code.

Corollary: there is **no trim-safe zone**, because nothing is trimmed. The "safe area" FR-003 asks for
is the **text zone** — the region the platform draws copy over, which is what an operator actually
needs to design around.

---

## Enforcement

| Layer | Responsibility |
|---|---|
| Console | Normalise any accepted image to exactly 1200 × 600 before upload |
| Presigned PUT | None — bytes go straight to S3; Lambda never sees them |
| Admin service, on save | **Verify** dimensions; refuse non-conformant artwork |

⚠ The third row exists because of the second. A client-side check is a convention a determined caller
skips, and FR-004 says stored artwork **must** conform.

⚠ **Verification reads image headers over a ranged GET (first 64 KB)** — no `sharp`, no native binary
in a Lambda. PNG and JPEG both carry their dimensions in the first few dozen bytes.

⚠ **The service refuses; it never resizes.** Silently altering an operator's artwork is the silent crop
FR-008 forbids.

---

## Rendering

- Fixed **2:1** box at every width; artwork scaled uniformly.
- Narrower than canonical → scales down proportionally.
- Wider than canonical → **bounded and centred**, never stretched.
- The box is laid out **before** the image resolves, so nothing shifts (FR-016 / SC-005).
- A **gradient scrim** guarantees text contrast — opaque behind the text zone, clear elsewhere.
  ⚠ Under the monochrome palette there is no hue to separate type from photograph, so the scrim does
  all of the work and is tuned against a light, high-detail image rather than a convenient one.

## Verification

| Check | How |
|---|---|
| One definition, three consumers | `tokens:check` (Compose) + a unit test asserting the console and template agree |
| Template matches the canvas | Generated from the same constants; drift-checked like `brand-check` |
| Non-conformant artwork refused | Vitest, plus a **direct PUT** of a wrong-shaped image to prove the client is not the guard |
| No stretching at any width | Device walk — quickstart §3 |
| Zero layout shift | Device walk — quickstart §3 |
