# Contract: Telemetry (036)

**Date**: 2026-08-05 · **Plan**: [../plan.md](../plan.md) · Principle VII

⚠ **Read this first.** **PostHog has never been initialised on `customer-web`.** Every `capture()` on the
storefront — including today's `sign_in_completed` and `sign_up_completed` — is a **no-op**. Mobile telemetry
has been deferred for twelve consecutive slices.

This slice **emits** through the existing seam and **does not** take on analytics bootstrap (see the plan's
Complexity Tracking). The events start working the day the seam is initialised. Until then:
**SC-006 and SC-007 must be measured by observed sessions, not dashboards.** Saying otherwise would be the
"ticked and not built" pattern this project keeps recording.

---

## Events

Named `auth_*` so the whole funnel is one prefix. `flow` is `sign_in | sign_up | reset` throughout.

| Event | Properties | Fires when |
|---|---|---|
| `auth_flow_started` | `flow`, `entry` (`deliberate \| demanded`), `has_return_to` | Step 1 renders |
| `auth_route_chosen` | `flow`, `route` (`code \| password \| google`) | A route control is used |
| `auth_code_requested` | `flow`, `send_ordinal` (1…5), `trigger` (`initial \| resend`) | A code is asked for |
| `auth_code_resend_refused` | `flow`, `reason` (`cooldown \| flow_ceiling`) | ⚠ The control refuses **locally** (FR-009) |
| `auth_code_submitted` | `flow`, `attempt` (1…3), `length_ok` | The submit action is taken |
| `auth_code_rejected` | `flow`, `attempt`, `outcome` (see below) | A code is not accepted |
| `auth_step_back` | `flow`, `from_step`, `via` (`control \| browser \| gesture`) | Any backward move |
| `auth_google_unavailable` | `flow` | ⚠ Google is chosen while parked (FR-039) — measures demand for the follow-on slice |
| `auth_name_step_shown` | `route` | U4 renders |
| `auth_name_step_completed` | `route`, `ms_since_account_created` | U4 succeeds |
| `auth_name_step_abandoned` | `route` | The flow is left at U4 |
| `sign_in_completed` | `route` | existing — kept |
| `sign_up_completed` | `route` | existing — kept |

### ⚠ `outcome` says only what the platform knows

`not_accepted` · `attempts_spent` · `session_timed_out` · `ip_rate_limited` · `error`

**There is no `expired`, no `superseded` and no `not_sent` on the sign-in route**, because the platform cannot
distinguish them (R10). Inventing those values would put a fiction into the analytics and then into someone's
product decision. On **sign-up confirmation and password reset** — Cognito's managed flows — the cause is real,
so `code_mismatch` / `code_expired` / `limit_exceeded` are permitted **there only**.

---

## What these are for

| Question | Answered by |
|---|---|
| Does the step form convert better than the one-screen form? | `auth_flow_started` → `sign_in_completed` |
| ⚠ Was the resend worth building? | `auth_code_requested{trigger:"resend"}` — if this is near zero, the email problem was imagined |
| ⚠ **Are shoppers hitting the 5/hour ceiling?** | `auth_code_resend_refused{reason:"flow_ceiling"}` + `send_ordinal` distribution. **This is the highest-value number here** — it is the failure mode with no server-side signal at all (R11) |
| Do people lose codes to the 3-minute client timeout? | `auth_code_rejected{outcome:"session_timed_out"}` (R1) |
| ⚠ Does name-last leave orphans? | `auth_name_step_abandoned` ÷ `auth_name_step_shown`. The spec records this risk as **unmeasured in the literature**; this is how we measure our own |
| Is anyone actually asking for Google? | `auth_google_unavailable` — sizes the follow-on slice |
| Do people find the password route? | `auth_route_chosen{route:"password"}` — if it collapses, the demotion went too far |

---

## Rules

- ⚠ **No PII.** Never the email, never the masked destination, never the code, never a name. `attempt` and
  `send_ordinal` are small integers; every property is low-cardinality.
- ⚠ **Import `capture` dynamically** in any client component on a guest-reachable route. A *static* import cost
  **+1.0 KB on four guest routes** in 027 and pushed `/search` and `/cart` over the gate. `/search` has 2.0 KB
  of headroom.
- Consent-respecting, via the existing seam.
- Mobile emits nothing until the mobile telemetry slice lands — ⚠ **thirteenth** consecutive deferral, recorded
  here rather than quietly repeated.

## Metrics and alerts

**None added.** The server-side signals already exist from 035 — `otp_rate_limited`, the four CloudWatch alarms,
`otp_ratelimit_store_unavailable`. This slice adds no backend behaviour, so it adds no metric.

⚠ **The one thing worth alerting on has no server-side signal**: the silent 6th send. `create-auth-challenge.ts`
already emits `otp_rate_limited` when it refuses, so the *server* can see it — but nothing correlates that with
a shopper who then failed three guesses. `auth_code_resend_refused` is the client half of that picture, and it
only becomes visible once PostHog is initialised.
