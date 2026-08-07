# Quickstart — 038 Platform Email Template System

**Plan**: [plan.md](plan.md) · **Spec**: [spec.md](spec.md) · **Research**: [research.md](research.md)

Who runs what: **Claude writes all the code.** Every step marked 🧑‍💻 is **operator-run** — it deploys,
migrates, or touches live AWS.

⚠ **§4's ordering is load-bearing.** Cognito validates a trigger on `UpdateUserPool`, so the function
must be deployed *before* its ARN is set. Doing it in one apply fails.

---

## 0. Operator inputs — required before anything deploys

Neither may be inferred (constitution: Real-World Identifiers). Both fail loudly when unset.

| Value | Where | Why it must be asked for |
| --- | --- | --- |
| **Postal address** for the compliance footer | `infra/envs/dev/dev.tfvars` → `/effy/dev/mail/postal_address` | ⚠ A real-world identifier naming a physical place, printed on **every** email the platform sends. |
| **Non-production recipient allowlist** | `dev.tfvars` → `/effy/dev/mail/nonprod_allowlist` | ⚠ Determines who *can* be emailed from dev. A guessed entry is a stranger receiving platform mail. |

⚠ A Terraform validation refuses a placeholder, exactly as 037's `alert_email` validation does.
`@simulator.amazonses.com` is always permitted and does not need listing.

---

## 1. Build and verify locally — no cloud access

```bash
pnpm install
make email-gen            # tokens → MJML → dist/ (HTML, text, runtime module, manifest)
make email-check          # drift + lint + contrast (×3) + size + completeness
make email-preview        # dist/preview/index.html — open it
pnpm -r typecheck
pnpm -r test
```

**Expected**: `email-check` green; the preview shows all 7 templates rendered from their fixtures.

### 1a. ⚠ Prove every guard by breaking it (spec SC-010)

This is the step that makes the guards real. 024 proved its drift check three ways and found a live
defect doing it. Each of these MUST fail **and name the template**:

| Break | Expect |
| --- | --- |
| Edit a `dist/*.html` by hand | drift failure naming the file |
| Delete a `text/<id>.txt.hbs` | missing-text-part failure |
| Pad a template past 102 KB | Gmail size failure |
| ⚠ Pad a `sentBy: "cognito"` template past 20,000 chars | **Cognito** size failure — a *different* budget |
| Add `display:flex` to a component | banned-technique failure |
| Change a token to a `#707070`–`#909090` grey | mid-tone-band failure |
| Darken a muted ink below AA | contrast failure — ⚠ and check it fails in **all three** passes |
| Rename a variable in a fixture but not the template | placeholder-integrity failure |
| Add an unsubscribe link to a transactional template | category failure |
| Add `category: 'transactional'` **and** an unsubscribe URL | ⚠ **typecheck** failure, not a lint failure |
| Point a send call at a non-existent id | ⚠ **typecheck** failure |
| Pass wrong variables to `send()` | ⚠ **typecheck** failure |

### 1b. The hostile fixture (spec SC-016)

Render `order-confirmation` against the fixture whose product names contain markup. The markup MUST
appear as written and MUST NOT alter the structure. ⚠ SES's own engine does not escape; this proves
ours does.

---

## 2. 🧑‍💻 Migration

```bash
git add db/migrations/ && git commit      # 003 commit-guard: db-up refuses uncommitted migrations
make db-status ENV=dev
make db-up ENV=dev
```

Adds one nullable column, `public.email_delivery_event.template_id`. ⚠ Forward-only; no data is
rewritten and nothing is backfilled — see [data-model.md](data-model.md) for why `NULL` is meaningful
rather than missing.

---

## 3. 🧑‍💻 Deploy the senders (no trigger yet)

```bash
make apply ENV=dev                        # the two new SSM keys from §0
make edge-deploy SERVICE=auth ENV=dev
make edge-deploy SERVICE=customer ENV=dev
make edge-deploy SERVICE=admin ENV=dev    # ses-event-consumer reads mail.tags → template_id
```

### 3a. Prove the sign-in code first — it is the highest-risk path

Sign in on **customer** with a real dev account.

**Expect**: a designed message; the code works; sign-in completes.

⚠ **If anything is wrong here, stop and fix it before §4.** Three of four audiences have no password;
a broken code email is a total lockout, and §4 widens the blast radius to sign-up and recovery.

Then repeat on **driver**, **shop** and **back-office** (spec SC-001) — each must show its own product
name and the internal wording.

### 3b. Prove the allowlist (spec SC-012)

| Attempt | Expect |
| --- | --- |
| Send to an address **not** on the allowlist | ⚠ **Refused**, loudly, recorded |
| Send to an allowlisted address | Sent normally |
| Send to `success@simulator.amazonses.com` | Sent normally |

### 3c. Prove attribution (spec FR-010)

Trigger a send to `bounce+auth-sign-in-code@simulator.amazonses.com`.

⚠ The simulator produces an RFC 3464-compliant hard bounce that is **not** added to the suppression
list and does **not** count toward the daily quota, bounce rate or complaint rate — so this exercises
037's consumer end to end without touching sending reputation. (You are still billed for it.)

**Expect**: a row in `public.email_delivery_event` with `template_id = 'auth-sign-in-code'`.

---

## 4. 🧑‍💻 The Cognito trigger — ⚠ two-stage, ordering is load-bearing

Cognito **validates a trigger on `UpdateUserPool`**. The function must exist before its ARN is set.

```bash
# Stage 1 — the function is already deployed by §3.
#   Set custom_message_lambda_arn in infra/envs/dev/dev.tfvars for all four pools.

make plan ENV=dev
```

⚠ **READ THE PLAN. Abort if any pool would be REPLACED.** `lambda_config` is not ForceNew and none of
the three replacement-forcing attributes is touched — but a replaced pool **destroys every account on
the platform**, and the check costs nothing (035 FR-030).

```bash
make apply ENV=dev
```

### 4a. Walk the four intercepted messages (spec SC-017)

| Flow | Expect |
| --- | --- |
| Customer **sign-up** | Designed message; ⚠ the code is a **real code, not a literal `{####}`**; sign-up completes |
| **Resend code** | Same message |
| **Forgot password** | Designed message; the code completes the reset |
| **Email verification** | Designed message; the code verifies |

⚠ **The `{####}` check is the one to watch.** The platform never sees the code — it emits Cognito's
placeholder and Cognito substitutes it afterwards. A literal `{####}` in a delivered message means the
substitution engine ate it, and every intercepted flow is dead.

### 4b. ⚠ Prove the fail-safe (spec SC-018) — do not skip this

Force a render failure (temporarily point one trigger source at a missing template, or deploy with a
deliberately broken fixture).

**Expect**: the person still receives a usable message — **Cognito's own default** — and sign-up still
completes. ⚠ A throw here fails the entire Cognito operation. This is the single most dangerous
behaviour in the slice and the only way to confirm it is to cause it.

Revert immediately afterwards.

---

## 5. 🧑‍💻 The real-client walk — the part nothing can automate

⚠ **Nothing open-source renders the Word engine.** Playwright in Chromium and WebKit catches layout
regressions and cannot reproduce the one renderer that is not a browser engine — which is exactly where
the expensive bugs are.

⚠ This platform has a documented pattern of machine-verified work that was never walked on a device
(028 recorded it and asked that it not be repeated; 029, 033 and 035 repeated it). **This section is
the deliverable, not a formality.**

Send `auth-sign-in-code` and `order-confirmation` to a seed inbox on each (spec SC-004):

| Client | Watch for |
| --- | --- |
| Apple Mail (iOS + macOS) | Baseline. Web font loads here. |
| Gmail web | Sanitiser behaviour; `<style>` survives |
| Gmail Android | ⚠ **Partial** inversion — the dangerous one. Look for dark-on-dark. |
| ⚠ **Gmail app, non-Google address** | ⚠ **No `<style>` at all** — the strictest case. Must be completely correct on inline styles alone. |
| ⚠ **Classic Outlook for Windows** | ⚠ Word engine. Layout holds, width correct, **typeface is sans-serif not Times New Roman**, square corners are fine. |
| Outlook.com, dark appearance | ⚠ Partial inversion + the `[data-ogsc]` mirror |
| One full-inversion client (Gmail iOS) | The ramp flips end-for-end and stays legible |

Also confirm, on at least one client each:

- **Images blocked** → ⚠ the wordmark is still there (it is live text — spec SC-005) and nothing is lost.
- **Plain-text only** → the purpose-written text version, not table debris (spec SC-008).
- **Phone** → body text ≥ 16px, no horizontal scroll, tappable targets ≥ 48px.
- **Preview line** → states the purpose, does **not** repeat the subject, does **not** leak the code.
- ⚠ **`order-confirmation` with the large-basket fixture** → the table is correct in the Word engine and
  the message stays inside budget (spec SC-015).

---

## 6. 🧑‍💻 Confirm the one medium-confidence number

⚠ [research R14](research.md#r14--two-size-budgets-not-one) records Cognito's `emailMessage` limit as
**20,000 characters at medium confidence**. It binds four of seven templates and is ~5× tighter than
the Gmail budget.

Confirm it against a live pool (grow a template until Cognito rejects it) and **write the measured
figure back into research.md and the guard** — or confirm 20,000 and mark it high confidence.

---

## 7. Sign-off

- [ ] `email-check` green; **every** guard in §1a proven by breaking it
- [ ] Sign-in code works on all four audiences, in the new design (SC-001)
- [ ] All six live messages produced by the one system; ⚠ **zero** email content left in a request handler (SC-002)
- [ ] Allowlist refuses (SC-012); attribution lands (FR-010)
- [ ] Four intercepted flows complete with real codes (SC-017); ⚠ fail-safe proven by causing it (SC-018)
- [ ] Client matrix walked, including the two hardest cases: the non-Google-account Gmail app and classic Outlook (SC-004)
- [ ] Images-blocked, plain-text and dark-mode passes done (SC-005, SC-008, SC-007)
- [ ] Cognito length limit measured and recorded (§6)
- [ ] ⚠ Secret/PII sweep: no address, code or message content in any log (SC-019)

---

## Known limitations to record at sign-off, not discover later

1. ⚠ **Attribution and the non-production allowlist cover platform-sent messages only.** Cognito sends
   the four intercepted messages itself, so the platform cannot tag them, choose their configuration
   set, or block their recipients. A property of the mechanism, not a gap —
   [contract §6](contracts/cognito-custom-message.contract.md#6--what-this-mechanism-makes-impossible).
2. **`order-confirmation` is a template with no call site** (spec FR-062). Wiring it belongs to the
   slice that owns order notifications.
3. **Deferred by decision** (research R10, R11): full `caniemail` conformance checking, visual
   regression, and Mailpit for local SMTP capture.
4. ⚠ **Australia's Spam Act 2003 treatment of lifecycle mail is unverified** (research R16). It does not
   block this slice — everything shipping is transactional — but it **must** be settled before any
   lifecycle message is authored.
