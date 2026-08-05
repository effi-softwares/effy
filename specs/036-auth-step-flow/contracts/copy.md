# Contract: Every User-Visible String (036)

**Date**: 2026-08-05 · **Plan**: [../plan.md](../plan.md)

⚠ **This file is the reason web and mobile cannot drift (FR-044).** Same decision → same words on both
surfaces. It is also the guard against FR-011: **no string here claims knowledge the platform does not have.**

Conventions: sentence case; no exclamation marks; the shopper is *you*; Effy never apologises for a refusal it
caused deliberately. Mobile's existing curly apostrophes (`’`) are kept.

---

## Sign-in

| Where | String |
|---|---|
| S1 title | **Sign in to Effy** |
| S1 subtitle | It's good to see you again. |
| S1 email label | Email |
| S1 primary | **Email me a code** |
| S1 divider | or |
| S1 Google | **Continue with Google** |
| S1 secondary | Use a password instead |
| S1 footer | Don't have an account? **Join** |
| S1 deferred reason | You'll need an account to place your order. Sign in and we'll take you straight back. |
| S2 title | **Enter your password** |
| S2 email line | Signing in as `{email}` |
| S2 password label | Password |
| S2 reveal | Show password / Hide password |
| S2 primary | **Sign in** |
| S2 forgot | Forgot your password? |
| S2 switch | Email me a code instead |

---

## The code step (shared — sign-in, sign-up, reset)

| Where | String |
|---|---|
| Title | **Enter your code** |
| Destination | We sent a code to **{maskedDestination}**. |
| Field label | Your code |
| Placeholder | 6-digit code — ⚠ **built from `OTP_LENGTH`, never a literal** (FR-045) |
| Expiry hint | The code works for 5 minutes. |
| Primary (sign-in) | **Sign in** |
| Primary (sign-up) | **Create account** |
| Primary (reset) | **Set new password** |
| Resend, waiting | Send another code in **{n}s** |
| Resend, ready | Didn't get it? **Send another code** — ⚠ a TEXT action on both surfaces, never a bordered button: resending is a recovery affordance, not a route through the flow |
| Resend confirmation | ⚠ New code sent. **Use the most recent email** — the older code no longer works. |
| Resend refused (5/flow) | We can't send another code to this address right now. Check your spam folder, or try again later. |
| Wrong email | Wrong email? **Change it** |
| Didn't arrive | Check your spam folder if it doesn't arrive. |

### Refusals — ⚠ each is exactly what the platform can support

| Cause | String | Note |
|---|---|---|
| Refused, attempts left (sign-in) | **That code wasn't accepted. Check it and try again.** | ⚠ *"wasn't accepted"*, not *"is wrong"* — it may have expired or been superseded, and we genuinely cannot tell (R10). |
| Attempts spent (`NotAuthorizedException`) | **That didn't work. Send a new code and try again.** | ⚠ Deliberately identical to what an unknown address produces — saying more re-opens the existence oracle (FR-024). |
| Client session expired (`SignInException`) | **Your sign-in timed out. Send a new code to continue.** | ⚠ NEW — the 3-minute Amplify store (R1). Today this shows the generic default. |
| IP rate limited (`ForbiddenException`) | **Too many attempts from this network. Wait a few minutes and try again.** | ⚠ NEW — WAF, **unhandled on every surface today**. |
| Network | No connection. Check your network and try again. | existing |
| Anything else | Something went wrong. Please try again. | existing |

**Sign-up confirmation and password reset only** — these use Cognito's *managed* flow, so the cause is real and
the message says it (FR-011):

| Cause | String |
|---|---|
| `CodeMismatchException` | That code isn't right. Check it and try again. |
| `ExpiredCodeException` | That code has expired. Send another one. |
| `LimitExceededException` | Too many attempts. Wait a few minutes and try again. |

### Exhausted step (S4)

| Where | String |
|---|---|
| Title | **Let's start that again** |
| Body | That code can't be used any more. We'll send you a fresh one. |
| Primary | **Send a new code** |
| Secondary | Use a different email |

---

## Sign-up

| Where | String |
|---|---|
| U1 title | **Create your account** |
| U1 subtitle | Start with your email — we'll do the rest in a moment. |
| U1 primary | **Email me a code** |
| U1 secondary | Set a password instead |
| U1 footer | Already have an account? **Sign in** |
| U2 title | **Choose a password** |
| U2 email line | Creating an account for `{email}` |
| U2 password label | Password |
| U2 rule (⚠ **before** typing) | **At least 12 characters. Use anything you like — no special characters required.** |
| U2 primary | **Create account** |
| U4 title | **What should we call you?** |
| U4 subtitle | We'll use this when we say hello and when we hand over your order. |
| U4 fields | First name · Last name |
| U4 primary | **Finish** |
| U4 return (abandoned) | Welcome back — we just need your name to finish setting up. |

⚠ **`MIN_PASSWORD = 8` is deleted.** The rule string is built from `PASSWORD_MIN_LENGTH` (12), so it cannot
drift again — the exact failure `authErrorMessage`'s own comment records: *"The old text became a LIE the
moment the policy changed."* Three sites currently understate it (R8).

⚠ **No "confirm password" copy exists** — the field is gone (FR-030, 012 FR-023).

---

## Google (parked)

| Where | String |
|---|---|
| Button | **Continue with Google** — ⚠ Google-approved wording; the mark may **never** be recoloured |
| Refusal (FR-039) | **Google sign-in isn't available yet.** For now, use your email — we'll send you a code. |

⚠ **Never** *"Something went wrong"* here. Nothing went wrong; the capability isn't built. That distinction is
the whole of FR-039.

---

## Strings being retired

| Old | Why |
|---|---|
| *"That code has expired. Ask for a new one."* (mobile `AuthScreens.kt:224`) | ⚠ Instructs an action the screen has **no control for**. Now there is a resend, and the sign-in route cannot claim "expired" anyway. |
| *"That email or password isn't right."* shown on the **passwordless** route (mobile) | ⚠ Password wording to a shopper who has no password — mobile never got 035's route-aware fix. |
| *"At least 8 characters, with upper and lower case letters and a number."* | ⚠ Both too short **and** falsely restrictive. |
| *"Those passwords don't match."* | The confirm field is gone. |
| *"I have a password"* / *"I'd rather set a password"* | Replaced by step-shaped wording. |
| *"Use a different email"* as the **only** escape from the code screen | Superseded by *Change it* + a real resend. |

---

## Accessibility

- Refusals: `role="alert"` (web) / `liveRegion` (Compose). ⚠ Announce **without moving focus** off the field (FR-015).
- Countdown: `aria-live="polite"`, announced at most once per second.
- Code field: one accessible name — *"One-time code"*. ⚠ **Exactly one node**, asserted on all three renderers.
- Reveal toggle: `aria-pressed` + a label naming its field.
- The Google mark is decorative; the accessible name comes from the button text (Google forbids the icon alone).
