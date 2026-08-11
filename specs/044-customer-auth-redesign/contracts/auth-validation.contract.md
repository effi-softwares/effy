# Contract — field validation on the authentication screens

**Owners**:
`packages/shared-types/src/validation.ts` (the rule) · `apps/customer-web/app/(auth)/_lib/validation.ts`
(the per-field machinery) · `components/storefront/kit.tsx`'s `Field` (where a message is rendered).

**Consumers**: `SignInForm`, `SignUpForm`, `ResetPasswordForm`, `NameStep`, and —
for the email rule only — `apis/edge-api/customer/src/newsletter/service.ts`.

---

## 1. The email rule — one definition, two runtimes

```
EMAIL_MAX_LENGTH = 254
EMAIL_SHAPE      = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/
isEmailShape(v)  = trimmed, non-empty, ≤ EMAIL_MAX_LENGTH, matches EMAIL_SHAPE
```

| ID | Guarantee |
|---|---|
| V-01 | This rule is declared **once**, in `@effy/shared-types`, and imported by every consumer. No surface re-declares it. (Principle II.) |
| V-02 | The values are the ones the platform already enforced in the newsletter service. This is an **extraction, not a redefinition** — the constants move, they do not change. |
| V-03 | `apis/edge-api/customer/src/newsletter/service.ts` imports rather than declares. **Its existing tests pass unmodified** — that is the proof the extraction changed no behaviour. |
| V-04 | The client refuses **exactly** what the server refuses. The client never holds a stricter opinion, because a client that refuses what the server would accept is a bug the customer cannot work around. |

**Worked cases** (these become the test table):

| Input | Verdict | Why it matters |
|---|---|---|
| `person@example.com` | accept | — |
| `person@example` | **refuse** | accepted by the browser today; this is defect D-08 and success criterion SC-004 |
| `person@.com` | refuse | no domain label before the dot |
| `person@@example.com` | refuse | — |
| `person @example.com` | refuse | whitespace |
| `  person@example.com  ` | accept, trimmed | FR-015 |
| `   ` | refuse as **empty**, not as malformed | rule ordering (§3) |
| 255+ characters | refuse | `EMAIL_MAX_LENGTH` |
| any well-formed address with no account | **accept** | FR-044 — validation refuses *malformed*, never *unknown* |

---

## 2. Where a message appears

| ID | Guarantee |
|---|---|
| V-05 | A field's message renders in the shared field primitive's error slot — **beside the field it concerns**, in the platform's error treatment (FR-012). |
| V-06 | **No browser-drawn validation bubble is ever the mechanism.** Native constraint UI is suppressed on these forms; the attributes stay for autofill and semantics, the *reporting* is the platform's. |
| V-07 | At most **one** error region is visible for a given problem at a given moment (FR-017). A step never renders a second, independently-owned error block for the same submission — journey-level messages are passed **into** the step. |
| V-08 | On a refused submission, focus moves to the first field with a message, in DOM order, and the message is announced once (FR-014). |

---

## 3. When validation runs

| ID | Guarantee |
|---|---|
| V-09 | On **blur after input**: a field the customer entered and then left is validated then (FR-011). |
| V-10 | On **submit**: every field is validated regardless of whether it was touched. |
| V-11 | **Never on an untouched field before the first submission.** Arriving at a form must not greet the customer with errors. |
| V-12 | A message clears as soon as the value becomes acceptable, with no further submission (FR-013). This is structural: the message is derived from the value, never stored beside it. |
| V-13 | Rule order is fixed: `required` before any shape rule, so an empty field never reports a format problem it does not have. |
| V-14 | **Nothing is sent to the platform until validation passes** — no code request, no sign-in attempt, no account creation (FR-009, US2 AC-1/AC-2). |

---

## 4. The committing action

| ID | Guarantee |
|---|---|
| V-15 | An unavailable action is **`aria-disabled`, focusable, and in the tab order** — not `disabled` (research R4). |
| V-16 | It is distinguishable from the available state by more than reduced opacity, and without relying on colour alone (FR-019). Opacity alone on a near-black monochrome fill reads as an ordinary enabled grey button — that is defect D-04. |
| V-17 | Activating an unavailable action **runs validation and shows what is missing** (FR-020). It never silently does nothing. |
| V-18 | Enter from within a field does exactly what the action does (FR-022), including when the action renders outside the `<form>` it owns. |
| V-19 | While a submission is in flight, progress is indicated and the action cannot be activated again (FR-021). |

**Intended contract change**: tests and e2e specs currently asserting the `disabled` attribute on
`submit-otp`, `submit-name` and `submit-reset` are updated to assert `aria-disabled`. This is
deliberate and named here so it cannot be mistaken for a test loosened to make a change pass.

---

## 5. What validation must never do

| ID | Prohibition |
|---|---|
| V-20 | Never reveal whether an address belongs to an account — not in copy, not by the presence or absence of a control, not by timing (FR-044). The invariance test at `app/(auth)/_components/enumeration.test.ts` stays green and unmodified. |
| V-21 | Never claim to know why a code was refused on the sign-in route. The platform genuinely cannot distinguish wrong / expired / superseded / never-sent, and a nicer sentence is not worth a fiction (FR-018). |
| V-22 | Never unmount or un-name the email field on a credential step — it stays mounted and `autocomplete="username"` so password managers can fill and, more fragilely, **save** (FR-040). |
| V-23 | Never trim a *password* for comparison. Trimming applies to identifiers and names; a password's whitespace is part of it. (`required` on a password checks presence, not a trimmed value.) |
| V-24 | Never truncate a code, and never reshape a value to make it submittable (FR-004). |

---

## 6. Message intent

Wording is settled at implementation, but each message must satisfy:

| Field / rule | Must say | Must not say |
|---|---|---|
| email · `required` | that an address is needed | anything about accounts |
| email · `emailShape` | that the address does not look right, and to check it | whether it exists, or what the "correct" format is in regex terms |
| password · `required` | that a password is needed | — |
| password · `minLength` | the rule, and whether it is met | any strength judgement (research R10) |
| name · `required` | which name is missing | that the account is incomplete or broken (FR-035) |
| code · length | how many digits were entered and how many an Effy code has | why a code was refused |
