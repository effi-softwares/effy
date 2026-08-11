# Contract — the shared one-time-code control (`OtpInput`)

**Owner**: `packages/design-system/src/ui/otp-input.tsx`
**Consumers**: `apps/customer-web/app/(auth)/_components/CodeStep.tsx` (variant `cells`),
`packages/web-kit/src/console/OtpSignInCard.tsx` (variant **default**, i.e. `plain`) → `apps/shop-web`,
`apps/back-office`.

This is a **UI contract**: it states what the control guarantees to the surfaces that render it, and
what it guarantees to a person using it. It is the artifact the console lock (SC-011) is checked
against.

---

## 1. The invariant that outranks everything else

> **`OtpInput` renders exactly ONE labelled, focusable input, in every variant, in every state.**

`getAllByLabelText(/one-time code/i)` returns exactly one node. The cell presentation is
`aria-hidden` and `pointer-events-none`; it is scenery, not controls.

Rationale is carried, not re-argued: 035 FR-025 and 036 FR-002. Segmented per-digit widgets are
several inputs wearing a costume and are how screen-reader users lose their place in a code form. The
operator's report of *"no otp fields"* is a report that the positions are **invisible** — the remedy
is to make one input's positions visible, not to make six inputs.

---

## 2. The console lock (SC-011) — what MUST NOT change

The default variant serves two audiences whose **only** credential is an emailed code. There is no
password to fall back on, so a regression there is a lockout.

| Guarantee | Proof |
|---|---|
| `variant` defaults to `"plain"` | `otp-input.test.tsx` (plain block), unmodified |
| The plain variant keeps `maxLength={OTP_LENGTH}` | `OtpSignInCard.test.tsx:132`, unmodified |
| The plain variant renders no cell layer | new assertion, plain block |
| `type="text"`, never `type="number"` | `otp-input.test.tsx`, unmodified |
| `inputMode="numeric"` and `autocomplete="one-time-code"` | `otp-input.test.tsx`, unmodified |
| Both consoles build | `turbo build` |

**These tests are not edited.** If one fails, the change is wrong. (Same proof shape 028 used when it
promoted the S3 presign helper: the untouched suite is the evidence that nothing moved.)

---

## 3. The `cells` variant — what it MUST do

### Rendering

| ID | Guarantee |
|---|---|
| C-01 | Renders exactly `OTP_LENGTH` cells. The count comes from the constant; no literal `6` appears. |
| C-02 | Each cell has a visible boundary **and** a fill distinct from the page ground. Neither may rely on a hairline in the border/input token — `--input` is `#e5e5e5` on white (1.24:1) and its own token comment says it is "deliberately not contrast-tested"; that is defect D-01. The values used must resolve in **either** appearance, because the control is shared — even though `customer-web` renders only light (operator decision). |
| C-03 | Cell *i* displays `value[i]`, or nothing. Digits and boxes are laid out in the **same** row, so no font metric can slide one out from under the other. |
| C-04 | The control is centred **with its own label**, sharing its alignment at every width (FR-008). No inline margin may override a centring rule — that is defect D-02. |
| C-05 | While the input has focus, the cell at `min(value.length, OTP_LENGTH - 1)` carries a visible active indicator (FR-006). Unfocused, no cell is indicated. |
| C-06 | When `aria-invalid` is set, the **cells themselves** carry the error state, not only the message (FR-007). |
| C-07 | The control is the largest interactive element on the code screen (US1 AC-1). |
| C-08 | Digits are set in tabular monospace so a code read aloud is unambiguous. |

### Input behaviour

| ID | Guarantee |
|---|---|
| C-09 | A six-digit paste lands in one action and fills all six cells. |
| C-10 | An OS-supplied code (message autofill) lands in one action. `autocomplete`/`inputMode`/`pattern` stay on the real input. |
| C-11 | **A value longer than `OTP_LENGTH` is NOT truncated.** No `maxLength` on this variant. The excess stays visible, and the control changes shape (falls back to the plain rendering) so a long paste can never *look* like a six-digit code. (FR-004 — the defect 035 existed to fix.) |
| C-12 | **No auto-submit** at the sixth character, ever (FR-005). |
| C-13 | Non-digits are stripped by the caller before the value reaches the control; the control itself never reshapes a value. |

### Accessibility

| ID | Guarantee |
|---|---|
| C-14 | Exactly one node is exposed and labelled (§1). |
| C-15 | The native caret is hidden, and C-05's indicator replaces it. **Accepted cost, recorded:** text selection inside the field is not visible. A six-digit code is retyped, not partially selected. |
| C-16 | Legible under `forced-colors: active`. |
| C-17 | Legible at 200% browser zoom and under text-only zoom. Nothing in the geometry uses `ch`. |
| C-18 | `dir="ltr"` is retained — a code is LTR content even on an RTL page. |

---

## 4. Consequence for an existing guard

`packages/design-system/scripts/check-tokens.mjs` asserts `--font-mono` stays monospace, and its
message says the **cell geometry** depends on the `ch` advance. After this change that geometry no
longer exists, so the message would assert a reason that is no longer true — worse than no guard.

**Required**: the guard is **amended, not deleted**. It keeps asserting monospace (C-08 still wants
it) and its message is rewritten to say why that is still true. A new unit assertion covers C-01,
which is the thing that now actually needs guarding.

Deleting a guard because you replaced the mechanism it protected is how the next person reintroduces
the bug it was written for.

---

## 5. Bundle obligation

`app/delete-account/GuestDataControl.tsx` — a **budgeted** guest route — imports from the
`@effy/design-system/ui` barrel, so this file is reachable from a measured route whether or not the
control renders there.

`pnpm build && node scripts/bundle-budget.mjs` runs on all nine routes and the delta is **recorded**,
not assumed (SC-012). The limit is not raised to make it pass; that instruction is written into the
gate script itself.
