# Contract — the Cognito `CustomMessage` trigger (inbound)

**Producer**: AWS Cognito, invoking synchronously on all four user pools.
**Consumer**: `apis/edge-api/auth` → `src/functions/custom-message.ts`.

This is an **inbound** contract: the platform does not define the shape, it depends on a subset.
Everything not listed is ignored on purpose, so an upstream addition cannot break the trigger.

⚠ It is also the **most dangerous** integration in the slice. A `CustomMessage` trigger that throws
**fails the entire Cognito operation** — sign-up does not complete, password recovery does not
complete. Every rule below exists to make that impossible.

---

## 1. Event subset relied upon

```jsonc
{
  "version": "1",
  "triggerSource": "CustomMessage_SignUp",   // ← the discriminator. REQUIRED.
  "region": "ap-southeast-2",
  "userPoolId": "ap-southeast-2_xxxxxxxxx",  // ← REQUIRED. Resolves the audience.
  "userName": "…",
  "request": {
    "userAttributes": { "email": "…", "email_verified": "…" },
    "codeParameter": "{####}",               // ⚠ A PLACEHOLDER, NOT A CODE. See §3.
    "usernameParameter": "{username}",
    "linkParameter": "{##Click Here##}"
  },
  "response": {
    "smsMessage": null,
    "emailMessage": null,                    // ← we set this (HTML)
    "emailSubject": null                     // ← we set this
  }
}
```

⚠ `request.userAttributes.email` is present but **MUST NOT be logged** — it is the recipient.

---

## 2. Trigger sources → catalogue entries

| `triggerSource` | Template | Notes |
| --- | --- | --- |
| `CustomMessage_SignUp` | `auth-sign-up-code` | ⚠ The **first** email a new customer ever receives. |
| `CustomMessage_ResendCode` | `auth-sign-up-code` | Same message; a resend is not a different message. |
| `CustomMessage_ForgotPassword` | `auth-password-reset-code` | |
| `CustomMessage_VerifyUserAttribute` | `auth-email-verification-code` | |
| `CustomMessage_UpdateUserAttribute` | `auth-email-verification-code` | Same message. |
| `CustomMessage_Authentication` | `auth-step-up-code` | MFA / step-up. |
| `CustomMessage_AdminCreateUser` | ⚠ **pass through unmodified** | Should not fire — internal audiences are provisioned with `MessageAction: SUPPRESS` (006). Handled anyway: "should not fire" is a belief about configuration, not a guarantee. |
| *anything else* | ⚠ **pass through unmodified** | An unknown source is Cognito adding a capability this code was never reviewed against. |

⚠ **`CustomMessage_Authentication` is NOT the passwordless sign-in code.** That is issued by 035's
custom-challenge triggers and sent by the platform's own mailer as `auth-sign-in-code`. Conflating the
two would put two different messages on one template.

---

## 3. ⚠ The code placeholder — the single most important rule

**The platform never sees the code.** `request.codeParameter` holds the literal string `{####}`, which
**Cognito substitutes after the trigger returns**. The rendered HTML must therefore contain `{####}`
exactly where the code belongs.

⚠ **This is a security property, not an inconvenience.** The platform gains a branded message without
taking custody of a credential it has no reason to hold — consistent with 035's rule that the code is
never written anywhere in readable form.

**Consequences, each asserted by a check:**

| # | Assertion |
| --- | --- |
| C-05 | `{####}` appears in **exactly** the `sentBy: "cognito"` templates, and nowhere else |
| C-06 | ⚠ The substitution engine does **not** consume `{####}` — proven by rendering and comparing, not by reading the Handlebars grammar. A message arriving with a literal `{####}` where the code should be is a total failure of the flow. |
| — | The template MUST NOT declare a `code` variable — there is nothing to pass |

⚠ Use `request.codeParameter` **as given**; do not hardcode `{####}`. Cognito documents the parameter
because the placeholder is Cognito's to choose.

---

## 4. ⚠ Fail-safe — the whole design

```
try   → resolve audience → resolve template → render → set response.emailMessage/emailSubject
catch → log (no PII) → return the event UNMODIFIED
```

**Returning the event unmodified makes Cognito fall back to its own default template.** The person gets
a plain message instead of a designed one; they never get a broken flow. This is spec FR-055 / SC-018.

**Every one of these paths returns unmodified rather than throwing:**

1. An unknown `userPoolId` — ⚠ fails **closed** on audience resolution, exactly as `audience.ts` already
   does; guessing a default would mean sending on behalf of an audience nobody signed off.
2. An unknown or unmapped `triggerSource`.
3. Any render, substitution or validation failure.
4. ⚠ Any output exceeding the length limit (§5) — Cognito would reject it and the whole operation would
   fail. Better a default message than a failed sign-up.
5. Anything else. The `catch` is total, and there is **no rethrow**.

⚠ **The log line carries `triggerSource`, the resolved audience and the error name only.** Never the
address, never `userAttributes`, never the rendered body.

---

## 5. ⚠ Limits

| Limit | Value | Confidence |
| --- | --- | --- |
| `response.emailMessage` length | **20,000 characters** | ⚠ **Medium — MUST be confirmed against a live pool.** It is roughly **five times tighter** than the 102 KB Gmail budget and binds four of the seven templates. Discovering it after authoring means redesigning them. |
| Trigger timeout | **5 seconds**, unchangeable | High — the same wall 035 documents. Rendering is substitution over a precompiled template; MJML must never be reachable from this function. |
| `response.emailSubject` | Practical, not documented | Kept short for display truncation (~35–40 characters visible on mobile). |

⚠ **Confirming the 20,000 figure is an explicit implementation task**, not an assumption to build on.

---

## 6. ⚠ What this mechanism makes impossible

**Cognito sends these four messages itself.** The platform supplies a body and a subject; it does not
make the SES call. Therefore, for every `sentBy: "cognito"` message:

| Not possible | Consequence |
| --- | --- |
| SES message tags | ⚠ **No delivery attribution.** `email_delivery_event.template_id` is `NULL` for these — which is one of the two reasons the column is permanently nullable. |
| A per-message configuration set | Outcome events still flow, because the identity carries the configuration set as its **default** (037). Visibility is preserved; attribution is not. |
| Custom headers | No `X-Effy-Template` for human debugging. |
| ⚠ The non-production recipient allowlist | **These four cannot be blocked from reaching a real address in dev.** Mitigation: dev pools contain only operator-created test accounts. ⚠ That is a mitigation, not a guarantee, and it is recorded rather than hidden. |

These are properties of the mechanism, not gaps in the implementation. The alternative — declining to
intercept — leaves the platform shipping two visual identities, with the unbranded one being the first
email every new customer receives.

---

## 7. ⚠ Deployment ordering is load-bearing

Cognito **validates a trigger on `UpdateUserPool`**, so the function must already be deployed before
its ARN is set. The same two-stage dance the pre-sign-up trigger and 035's four triggers require:

```
make apply ENV=dev          # custom_message = null
make edge-deploy SERVICE=auth ENV=dev
# set the ARN in dev.tfvars
make apply ENV=dev          # ⚠ READ THE PLAN
```

⚠ `lambda_config` is **not** ForceNew — setting it is an in-place update. **Read the plan anyway
(035 FR-030): a replaced pool destroys every account on the platform.** Only `username_attributes`,
`alias_attributes` and `username_configuration.case_sensitive` force replacement, and none is touched
here — but the check costs nothing and the failure is unrecoverable.

**IAM**: ⚠ **none is added.** This function sends no mail and calls no Cognito API — it returns a
string. It is strictly *less* privileged than the four triggers already deployed beside it. Cognito's
permission to invoke it is one `aws_lambda_permission` per pool (**four new**, bringing the service's
total from 16 to 20), granted in Terraform with no wildcards.

---

## 8. Rules

1. **⚠ Never throw.** §4. A throw here breaks sign-up and password recovery for real people.
2. **⚠ Never log the address, the rendered body, or `userAttributes`.**
3. **Fail closed on an unknown pool** — refuse, never guess a default audience.
4. **Use `request.codeParameter` as given.** §3.
5. **MJML must not be reachable from this function.** Build-time only; a 5-second wall.
6. **One deployment serves all four pools**, branching on `userPoolId` — the shape 035 established, and
   the reason this service is separate from `edge-api/customer` (035 R9: a role reaching all four pools
   must not be attached to the customer service).
7. **⚠ The trigger changes appearance only.** It MUST NOT alter any code's length, lifetime or validity
   (spec FR-056) — it has no mechanism to, and a test asserts the response carries only `emailMessage`
   and `emailSubject`.
