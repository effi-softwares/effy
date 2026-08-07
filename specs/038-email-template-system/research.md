# Research — 038 Platform Email Template System

**Date**: 2026-08-07 · **Phase**: 0 · **Plan**: [plan.md](plan.md)

Primary inputs are the two reports gathered during `/specify` and committed alongside this file:

- [`research-inputs/industry-template-systems.md`](research-inputs/industry-template-systems.md) —
  how production teams build in-house transactional email systems; AWS quota numbers; the Fanatics
  Commerce and GOV.UK Notify case studies; cost modelling.
- [`research-inputs/html-email-rulebook.md`](research-inputs/html-email-rulebook.md) — 55 testable
  authoring rules, 31 lint checks, a client matrix dated May 2026, and the dark-mode inversion
  mathematics.

Where those reports flagged a disagreement between sources, the decision below states which side this
platform takes and why.

---

## R1 — Authoring format: MJML, compiled at build time

**Decision**: author messages in **MJML**; compile to HTML **at build time**; commit the artifact with
`{{variable}}` placeholders intact. MJML never reaches a Lambda.

**Rationale**: the dominant production pattern (Artsy, thoughtbot, Fanatics Commerce all land here),
and it buys the one thing that is hardest to hand-maintain: MJML's `mj-section`/`mj-column` emit the
Outlook ghost tables and `<!--[if mso]>` conditionals automatically. The Word rendering engine is a
**hard target through 2029** — Microsoft delayed the enterprise opt-out phase to March 2027 and
supports classic Outlook to at least 2029 — so the widely repeated "2026 is the last year you need to
worry about it" is simply wrong. Buying that safety once, in a compiler, beats every template author
carrying 1999 quirks forever.

The **thoughtbot pattern** makes it work with variables: `{{name}}` is authored directly in the `.mjml`
source, a preprocessor substitutes fixture data for *preview only*, and the production build leaves the
placeholders intact for runtime substitution. Without it, every design change re-strips the template tags.

**Alternatives rejected**:

| Option | Rejected because |
| --- | --- |
| **React Email** | [resend/react-email#3556](https://github.com/resend/react-email/issues/3556): the unified package's top-level side-effecting imports of `prismjs`, `marked` and the full Tailwind v4 engine grew serverless bundles by **~80 MB per function**. On a Cognito trigger with a hard 5-second wall, that is a sign-in outage, not a slow email. |
| **Maizzle** | Genuinely tempting — Tailwind-for-email would let the design tokens flow in directly, and its transformer set (inline CSS, remove unused CSS, six-digit hex, auto-inject `role="presentation"`) matches several requirements exactly. Rejected because **it does not generate ghost tables or MSO conditionals**: you still author the table structure yourself. That is the single largest risk in the slice, and MJML removes it. |
| **Raw HTML tables** | Zero dependencies and total control, but every author must know the Outlook box model permanently. At "hundreds of templates" this is how you get hundreds of divergent footers. |
| **MJML at runtime** | `mjml` pulls 100 MB+ of transitive deps. The Go port ([Boostport/mjml-go](https://github.com/Boostport/mjml-go)) is webpack→WASM under Wazero and its own maintainers state Node is significantly faster; the alternative is an HTTP MJML server, i.e. a network hop on the sign-in path. |
| **Go `html/template` / a second renderer** | See R6. |

⚠ **Known accepted costs** (Artsy's, recorded so nobody rediscovers them): MJML output HTML is
verbose — which is why R14's size budget is a build gate, not a guideline; background images are poorly
supported — which is why the design uses none; and **minifying MJML output with a web-oriented minifier
breaks email clients**, so the artifact ships unminified.

---

## R2 — Runtime substitution: Handlebars

**Decision**: **Handlebars** at runtime, compiled lazily and cached at module scope (never per invocation).

**Rationale**:
1. **It escapes by default.** ⚠ SES's own template engine explicitly does **not** — its documentation
   says *"SES doesn't escape HTML content… you will need to escape it on the client side."* On a
   platform where product names, shop names and customer names are user-influenced, an unescaped
   engine is an HTML-injection primitive aimed at customers' inboxes (spec FR-031).
2. **Same dialect as SES managed templates.** If a cross-language bridge is ever needed, there is no
   second syntax to learn or drift from.
3. Supports `{{#each}}` and `{{#if}}`, which the order-confirmation line-item table requires.

**Alternatives rejected**: `mustache.js`/`micromustache` (smaller, but a different dialect from SES and
a weaker partials story); a hand-written interpolator (escaping and iteration are exactly the things
you must not hand-roll); **precompiling to JavaScript template functions** — it shrinks the runtime to
`handlebars/runtime` (~20 KB) but makes the committed artifact unreadable, which is the same defect
that disqualified SES managed templates in R4.

⚠ **Handlebars must not consume Cognito's `{####}` placeholder.** It does not — `{####}` is not
`{{…}}` — but a test pins this, because a substitution engine eating the code placeholder would make
every Cognito-sent message arrive with a literal `{####}` where the code should be.

---

## R3 — Storage: code-as-templates, committed and drift-guarded

**Decision** (settled by the operator during `/specify`): templates are source files in the
repository, reviewed in a PR, compiled at build time, committed as artifacts, guarded by a drift
check. Rollback is a revert and a deploy.

**Rationale**: templates get code review, diffs, atomic deploys, type safety and a rollback primitive.
Effy has **no non-engineer authors today**, so a console would be built for a user who does not exist.

⚠ **The counter-example is instructive and is why the door stays shut.** GOV.UK Notify is a large,
successful in-house platform that *does* store templates in a database — because its authors are
non-engineers in government departments. Note what it gave up to make that safe: templates are
**Markdown, not HTML**, with a deliberately restricted subset (no bold, italics, underline, typefaces
or fonts) and `((placeholder))` interpolation only. **Database-stored templates are safe only when the
authoring language is too weak to break anything.** If Effy ever wants non-engineer editing, that is
the shape to copy — never HTML in a database column.

---

## R4 — SES managed templates: rejected as the source of truth

**Decision**: do not use `CreateEmailTemplate` / `SendTemplatedEmail`. Render locally, send with
`SendEmail`.

**Rationale** — the operational quotas, not the storage limits, are decisive:

| Fact | Consequence |
| --- | --- |
| `CreateEmailTemplate` / `UpdateEmailTemplate` / `DeleteEmailTemplate` / `TestRenderEmailTemplate` are throttled at **1 request per second** (everything except the three send actions is) | At "hundreds of templates" a full sync is a multi-minute serial loop per environment per deploy, with no transactionality — a half-failure leaves production in a mixed state |
| **No versioning, no rollback, no diff, no audit.** There is no `GetEmailTemplateVersion`; `UpdateEmailTemplate` is destructive | The rollback primitive has to be re-invented with versioned template *names* |
| **No HTML escaping** | An injection primitive (see R2) |
| **No custom helpers** | Every price and date must be pre-formatted by the caller anyway |
| Inline partials **do not cross parts** | Every shared fragment is authored twice, once for HTML and once for text |
| Template JSON **cannot contain literal line breaks** | Unreadable git diffs |
| 20,000 templates/region, 500 KB each | Not a constraint at this scale — the limits are fine; the *operations* are not |

⚠ The strongest evidence is market-shaped: an entire third-party tooling industry (Semplates, Sovy,
AWS SES Template Editor) exists **solely** to paper over these gaps.

**When this decision would be revisited**: only if a service in a non-Node language needed to send
*synchronously*. It does not — see R6.

---

## R5 — Package shape: one package, two entrypoints

**Decision**: `packages/email-kit` (`@effy/email-kit`).
- `.` → catalogue + render + tokens. **Pure: no AWS SDK, no I/O, no network.**
- `./send` → the SESv2 sender, the non-production allowlist, and failure-policy application.

**Rationale**: the split is what lets the preview harness, every lint check and every unit test run
with **zero cloud access** (spec FR-040, SC-013). Keeping the catalogue and the sender in one package
is what makes the per-message failure policy (FR-002, FR-051) enforceable *at the send call* rather
than remembered at each site.

**Alternative rejected**: putting the sender in `@effy/edge-shared`. That package is the cold-path
*service* library (db, http, claims, RFC 9457 errors); the auth triggers are not HTTP services, and a
future notifications worker may not live there either. Splitting "email" across two packages to
satisfy a directory convention would violate the spirit of Principle II to satisfy its letter.

---

## R6 — One language owns rendering; the hot path does not send

**Decision**: rendering and sending live in Node. `core-api` (Go) sends no email in this slice. When a
future slice needs order notifications, Go publishes to the existing SNS backbone and a Node worker
renders and sends.

**Rationale**: the alternative is two renderers over one contract, and **this platform has been bitten
by exactly that four times** — 027 R13 (Kotlin serialised `1.0`, Go refused it), 029, 033, and 035's
undeclared `serverless.yml` variables. Every one of those passed its unit tests, because the fixtures
spoke one language at both ends. A second email renderer would put that failure mode in a customer's
inbox with a customer-visible blast radius. Fanatics Commerce's published architecture takes the same
route: one owning path, "rendered email HTML stored in-house."

⚠ The one case that would force a change — a Go service needing to send **synchronously** — does not
exist. Order confirmations are asynchronous by nature.

---

## R7 — Cognito's four messages: one `CustomMessage` trigger, fail-safe

**Decision**: one new Lambda in `apis/edge-api/auth`, wired as `lambda_config.custom_message` on **all
four pools**, following the exact shape of the four triggers 035 already ships.

**Mechanism** (full detail in [`contracts/cognito-custom-message.contract.md`](contracts/cognito-custom-message.contract.md)):

- **⚠ We never see the code.** `request.codeParameter` holds the literal placeholder `{####}`, which
  Cognito substitutes **after** the trigger returns. The template must emit that placeholder where the
  code belongs. This is a *security property*, not an inconvenience — the platform gains a branded
  message without gaining custody of a credential it does not need.
- Seven trigger sources exist; the ones that matter are `CustomMessage_SignUp`,
  `CustomMessage_ResendCode`, `CustomMessage_ForgotPassword`, `CustomMessage_VerifyUserAttribute`,
  `CustomMessage_UpdateUserAttribute` and `CustomMessage_Authentication`.
  ⚠ `CustomMessage_AdminCreateUser` **should not fire** — internal audiences are provisioned with
  `MessageAction: SUPPRESS` (006) — but it is handled anyway, because "should not fire" is a belief
  about configuration, not a guarantee.
- **⚠ FAIL SAFE IS THE WHOLE DESIGN.** A `CustomMessage` trigger that throws **fails the entire
  Cognito operation** — sign-up does not complete, password recovery does not complete. So the handler
  catches everything and returns the event **unmodified**, which makes Cognito fall back to its own
  default template. A person gets a plain message instead of a pretty one; they never get a broken
  flow. This is spec FR-055 and SC-018.
- ⚠ **Ordering is load-bearing.** Cognito validates the trigger on `UpdateUserPool`, so the function
  must be **deployed before** its ARN is set. Same two-stage dance the pre-sign-up trigger and 035's
  four triggers already require: apply with `null` → `make edge-deploy SERVICE=auth` → set the ARN →
  apply again. `lambda_config` is **not** ForceNew, so this is an in-place update — but ⚠ read the
  plan anyway: a replaced pool destroys every account on the platform.

**⚠ Two limitations this mechanism imposes, recorded rather than discovered later**:

1. **Cognito sends the message itself.** The platform therefore cannot attach message tags, choose a
   configuration set per message, or set a custom header on these four. **Attribution (R8) and the
   non-production allowlist (R12) cover platform-sent messages only.**
2. **The message-length limit is Cognito's, not Gmail's** — see R14.

---

## R8 — Attribution: SES message tags, over tag-safe ids

**Decision**: platform-sent messages carry an SES message tag `effy-template: <id>`. The tag surfaces
in the SES event payload as `mail.tags`, which 037's existing consumer reads and writes to the new
`email_delivery_event.template_id` column.

**⚠ Template ids are tag-safe by construction.** SES tag values permit only `[A-Za-z0-9_-]`. Rather
than sanitising a dotted id (`auth.sign-in-code` → `auth-sign-in-code`) and hoping two ids never
collapse onto one tag, **the id grammar is restricted to `[a-z0-9-]+` in the first place**: ids are
`auth-sign-in-code`, `account-password-changed`, `order-confirmation`. No mapping, no sanitiser, no
collision. A catalogue test pins the grammar.

**Also sent**: an `X-Effy-Template` header, for human debugging in a raw message. SES v2 `SendEmail`
has accepted custom headers on `Simple` content since 2024-03-08 (max 15 headers; a fixed disallow-list
that includes `Subject`, `From`, `Reply-To`, `Date`, `Message-ID`). The tag is the machine path; the
header is the human one.

**Alternative rejected**: relying on the header alone for attribution — SES event destinations do not
reliably carry custom headers into the event payload, whereas `mail.tags` is documented to.

---

## R9 — Persistence: one nullable column, no new table

**Decision**: one forward-only Goose migration adding `public.email_delivery_event.template_id text NULL`.

**Rationale**: `email_delivery_event` (037) already stores every outcome SES reports, keyed
`(message_id, event_type, address)`. Adding attribution is one column, not a table.

⚠ **Nullable, and permanently so**, for two independent reasons: rows written before this slice have
no template, and **messages Cognito sends can never have one** (R7). A `NOT NULL` column here would
either require a fabricated backfill value or break the Cognito path — both worse than an honest null.

No change to `email_delivery_status`: that table is one row per *address*, and a template is a property
of a *message*.

---

## R10 — Which authoring checks ship, and which are deferred

**Decision**: `check-email.mjs` implements the deterministic, high-value subset. Full `caniemail`
conformance is **deferred and recorded**, not silently dropped.

**Shipping** (each fails the build and **names the template**):

| Check | Rule |
| --- | --- |
| Drift | Regenerate and byte-compare `dist/` — HTML, text, the runtime TS module, and the manifest |
| Catalogue completeness | Every id has HTML, text, subject, preview text and a schema-valid fixture |
| Size | ≤ 90 KB warn / **102 KB fail**; ⚠ **20,000 chars fail** for Cognito-routed templates |
| Text part | Present, non-empty, no HTML entities, no markup |
| Banned techniques | Greppable: `display:flex|grid`, `float:`, `position:absolute|fixed|sticky`, `var(`, `--custom-prop:`, `@supports`, `clamp(`, `:has(`, `rem` in inline styles, `.svg`, inline `<svg>` |
| Inline-only | No `<style>` inside `<body>`; the message must be correct with the whole `<style>` block deleted |
| Nested at-rules | ⚠ A nested `@` rule makes Gmail discard the **entire** style block |
| Contrast | WCAG AA over **three** passes: light, the authored dark restatement, and the **algorithmically inverted** palette (valid because the ramp is achromatic — R13) |
| Mid-tone ban | No `#707070`–`#909090` on text or dividers (R13) |
| Structure | One `<h1>`, headings in order, `lang`/`dir`, `role="presentation"` on layout tables, `alt` on every image |
| Meta completeness | `charset`, `viewport`, `color-scheme`, `supported-color-schemes`, `x-apple-disable-message-reformatting`, the 96-DPI block |
| Conditional balance | `<!--[if` count equals `<![endif]-->` count |
| Placeholder integrity | Every `{{var}}` in HTML and text is declared in the catalogue, and every declared var is used |
| Unsubscribe | Present iff `category === 'lifecycle'`; **absent** iff transactional |

**Deferred, with reasons**:
- **Full `caniemail` conformance** (walking every property against the vendored dataset). It is the
  single highest-value check in the rulebook, but MJML's output *is* the mitigation for the class of
  bug it catches, and vendoring a ~1 MB dataset plus a property walker is a slice of its own. ⚠ Carry-forward.
- **Visual regression** (Playwright screenshot diffs). Worth adding past ~10 templates; this slice
  ships 7. ⚠ Carry-forward.
- **Real-client rendering.** Not deferrable and not automatable — see R17.

---

## R11 — Preview harness

**Decision**: `make email-preview` renders every catalogue entry against its committed fixture into
`dist/preview/`, plus an index page. Zero infrastructure, no cloud access, no send.

⚠ **The preview must use the same render path as production** (spec FR-041). A preview produced by a
different code path can show something a recipient will never receive — which is this repository's
single most-repeated documented failure mode (a fixture agreeing with the code instead of with the world).

**Deferred**: [Mailpit](https://github.com/axllent/mailpit) for full-loop local SMTP capture — a single
Go binary that would drop into the existing local Docker setup. ⚠ **MailHog is unmaintained (~4 years)
and must not be specified.**

---

## R12 — Non-production safety: fail-closed allowlist

**Decision**: `@effy/email-kit/send` refuses any recipient outside an operator-supplied allowlist
whenever `EFFY_ENV !== 'prod'`. `@simulator.amazonses.com` addresses are always permitted. The refusal
is loud and recorded.

**Rationale**: the canonical in-house-email horror story — a developer mailing the production user
table — is one environment variable away, and its blast radius is external and irreversible. This
platform has been bitten **four times** by configuration that tests supplied to themselves, so the
guard is a property of the sender, not a convention.

**Also adopted**: SES's mailbox simulator for exercising 037's bounce consumer.
`bounce@simulator.amazonses.com` produces an RFC 3464-compliant hard bounce that is **not** added to
the suppression list, does **not** count toward the daily quota, bounce rate or complaint rate — and
supports `+label` addressing, so `bounce+auth-sign-in-code@simulator.amazonses.com` is a genuine
end-to-end test of attribution. ⚠ You are still billed for simulator sends.

⚠ **The allowlist cannot protect Cognito-sent messages** (R7) — Cognito sends those itself. In dev the
pools contain only operator-created test accounts, which is the mitigation, and it is a mitigation
rather than a guarantee. Recorded.

---

## R13 — Dark mode: the hueless ramp is the design's biggest asset here

**Decision**: author in the **light** appearance; ship an explicit dark restatement generated from the
same token source, mirrored for the proprietary Outlook mechanism.

**The finding that drives it**:

> For a colour with **saturation = 0**, HSL-lightness inversion and naive per-channel inversion produce
> **exactly the same value** (`L' = 1 − v/255` ⟺ `rgb' = 255 − v`). A pure-neutral ramp has **no hue to
> shift**, so it is mathematically immune to the colour distortion that mangles branded email under
> forced dark mode. The ramp flips end-for-end and remains a correct greyscale design, with contrast
> preserved or improved (`#1A1A1A` on `#FFFFFF` = 16.1:1 → `#E5E5E5` on `#000000` = 16.8:1).

⚠ **So the exposure is not the ramp. It is four other things**:

1. **Partial inversion is the real enemy, not full inversion.** Outlook.com, the Outlook apps, Gmail
   for Android and Office 365 for macOS rewrite only what crosses a lightness threshold. On a ten-step
   ramp some steps cross and some do not — **the ramp splits**, and the classic result is black text
   left sitting on a darkened surface. **Mitigation**: every element that sets a text colour also sets
   its own background (spec FR-026), so a client that rewrites one cannot orphan the other.
2. **The two semantic colours are the only hues, so they are the only hue exposure.** Under naive
   channel inversion `#e01010` → cyan and `#0C9409` → pink. **Mitigation**: neither may ever be the sole
   carrier of meaning (spec FR-028) — already the constitution's rule; dark mode makes it load-bearing
   rather than merely polite.
3. **`#FFFFFF` inverts to exactly `#000000`** — the one dark surface every designer avoids (halation on
   OLED, maximum eye strain). **Mitigation**: the page ground is `#F5F5F5`, and the authored dark
   restatement targets `#1A1A1A`, never pure black.
4. **Images do not invert.** A black wordmark PNG stays black while its surface goes black.
   **Mitigation**: R15 — there is no logo image.

**Mechanisms, in order of reliability**: the `color-scheme` / `supported-color-schemes` meta pair
(mandatory; it is what makes Apple Mail leave a declared palette alone); a
`@media (prefers-color-scheme: dark)` block; and the `[data-ogsc]` / `[data-ogsb]` attribute mirror for
Outlook.com and the Outlook apps, which stash the original value in an attribute and overwrite the live
style. ⚠ **Both blocks are generated from one token source** so they cannot drift (spec FR-025).

⚠ **The Gmail blend-mode hack is deliberately NOT adopted.** It costs three nested `<div>`s per
protected region against a 102 KB budget, does not work in the non-Google-account configuration, and
protects a design that — being achromatic — does not need protecting.

**⚠ Sources disagree on Apple Mail** ("no colour change" vs "partial inversion"). The reconciliation
that matches observed behaviour: Apple leaves an email that declares `color-scheme` alone. Declare the
meta tags and the question is moot — which is what this plan does.

---

## R14 — Two size budgets, not one

**Decision**:

| Budget | Value | Applies to | Confidence |
| --- | --- | --- | --- |
| Gmail clipping | **90 KB warn / 102 KB hard fail** | Every template | **High** — universally reported. ⚠ Not deterministic: Gmail has been observed clipping *below* 102 KB when certain characters are present, hence the 10% headroom. |
| **⚠ Cognito message length** | **20,000 characters, hard fail** | Only templates routed through `CustomMessage` | ⚠ **Medium — MUST be confirmed against a live pool during implementation.** |

⚠ **The Cognito budget is five times tighter than the Gmail one and applies to four of the seven
templates.** Discovering it after authoring would mean redesigning them. It is a first-class build
gate, and confirming the exact figure is an explicit task.

**⚠ Deliberately NOT specified as fact**: "Outlook truncates HTML at 1.5 MB." The rulebook could not
verify this in any primary or reputable secondary source — what exists is a Q&A report of truncation
around 500 KB and an admin-configurable ActiveSync server setting. It is expressed as a size budget
instead. Likewise the "iOS Mail truncates past 5,000 px" claim has no first-party source; the design
stays under it without citing it.

---

## R15 — Brand identity is live text, not an image

**Decision**: the Effy wordmark in email is **live HTML text** in the ramp's darkest step at the right
weight and tracking. No logo image ships.

**Rationale**: classic Outlook blocks images by default; SVG is now blocked across Gmail, Outlook and
Yahoo following a 2025 surge in malicious payloads; a transparent PNG of dark glyphs becomes invisible
when the surface darkens. So an image-only logo is invisible to a meaningful fraction of recipients on
first render, and *also* the thing that breaks in dark mode.

⚠ **For a hueless design this is nearly free** — the wordmark is type, and type inverts perfectly. The
rulebook calls this "the strongest single recommendation for a hueless design system." It satisfies
spec FR-013 and SC-005 at zero cost, and it removes a whole class of asset-pipeline work.

---

## R16 — `List-Unsubscribe` is forbidden on transactional mail, and made unrepresentable

**Decision**: the catalogue carries `category: 'transactional' | 'lifecycle'` as a **discriminated
union**. `lifecycle` requires an unsubscribe URL; `transactional` has no field to put one in. The wrong
combination **fails to typecheck** rather than being caught in review.

**Rationale**: a person who unsubscribes from `auth-sign-in-code` **cannot sign in**, and on three of
four audiences there is no other credential. That is an account lockout with no recovery path.

**⚠ Sources genuinely disagree and the platform must decide deliberately**: Google scopes the
requirement to "marketing messages and subscribed messages" and is silent on transactional; RFC 8058
imposes no message-type restriction; deliverability vendors state transactional is exempt; and
**AWS's own blog does not draw the distinction at all** — a meaningful omission, because it is the
document an SES team will follow. This plan draws it, in the type system.

**Related, and written into the design**: transactional messages may carry **no promotional content**
(spec FR-035). Under CAN-SPAM's "primary purpose" test, enough promotional content flips a
transactional message to commercial and attaches every requirement it was exempt from. "Here's your
order confirmation — and 20% off next week" is exactly that case, and the pressure to add it will come
from outside engineering.

⚠ **Flagged as unverified**: Australia's Spam Act 2003 is the governing law here and is stricter than
CAN-SPAM on consent. No authoritative primary source was found in this research. It does not block this
slice (transactional only) but **must be verified before any lifecycle mail ships**.

---

## R17 — Real-client verification is a human task, and is written as one

**Decision**: an operator seed-inbox walk across the target client matrix is an explicit task in
`tasks.md`, not an aspiration.

**Rationale**: **nothing open-source renders the Word engine.** Playwright screenshots in Chromium and
WebKit catch layout regressions but cannot reproduce the one renderer that is not a browser engine —
which is precisely where the expensive bugs live. Paid services (Litmus, Email on Acid) are the only
substitute and are not being bought.

⚠ **This platform has a documented pattern of machine-verified work that was never walked on a
device** — 028 recorded that Android had never been looked at and asked that it not be repeated; 029,
033 and 035 repeated it. Writing the walk as a task is the only mechanism that has been shown to work.

**The minimum matrix** (spec SC-004): Apple Mail (iOS + macOS), Gmail web, Gmail Android,
**Gmail app with a non-Google address** (no `<style>` at all — the strictest case), **classic Outlook
for Windows** (Word engine), Outlook.com with dark appearance (partial inversion), and one
full-inversion client.

---

## R18 — Cost: not a decision input

**Decision**: choose on operational failure modes. Cost is noise.

At a plausible 200k messages/month every architecture costs **~$20/month**, and that $20 is the SES
send charge alone — identical across code-as-templates, SES managed templates, S3-stored and DB-stored.

⚠ Two things that *do* cost money are both declined: a **dedicated IP** (+$15/month minimum, and
actively *worse* than a shared IP below ~100k/month because it has no reputation and needs a 2–6 week
warm-up), and the **Pro plan** (+$105/month). Revisit above ~100k/month.

⚠ **Pricing changed on 2026-07-21** (tiered plans introduced; the SES-specific free tier is no longer
available to new customers). Which regime this account falls under should be confirmed, though it does
not change the architecture.

**The real cost of the rejected options is not dollars** — it is a cold start on a path with a hard
5-second timeout where failure is a sign-in outage for four audiences.
