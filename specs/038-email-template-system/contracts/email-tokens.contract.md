# Contract — design system → email tokens (generated)

**Producer**: `packages/design-system/src/tokens.css` — the brand SSOT (constitution Principle V).
**Generator**: `packages/email-kit/scripts/gen-email.mjs` → `packages/email-kit/src/tokens.generated.ts`.
**Guard**: `make email-check` regenerates and byte-compares.

⚠ **No email colour, radius or type value may be written by hand.** A hand-edited token is a build
failure. This is what makes spec SC-020 true: a change to a platform colour reaches email with no edit.

The precedent is established twice already — `design-system`'s Compose theme (`tokens:gen`/`tokens:check`)
and `@effy/brand`'s 57 assets (`brand:gen`/`brand:check`). This is the third instance of one pattern,
not a fourth convention.

---

## 1. Token map

| Email role | Light | Dark restatement | Design-system source |
| --- | --- | --- | --- |
| Page ground | `#F5F5F5` | `#0A0A0A` | ramp 50 / `--sidebar` (dark) |
| Canvas | `#FFFFFF` | `#1A1A1A` | `--background` (light / dark) |
| Ink | `#1A1A1A` | `#FFFFFF` | `--foreground` |
| Muted ink | `#666666` | `#B3B3B3` | `--muted-foreground` |
| Hairline | `#E6E6E6` | `#4D4D4D` | `--border` |
| Action fill | `#1A1A1A` | `#F5F5F5` | `--primary` ⚠ **inverts** |
| Action label | `#FFFFFF` | `#1A1A1A` | `--primary-foreground` |
| Code surface | `#F5F5F5` | `#333333` | `--accent` / `--secondary` |
| Error | `#e01010` | `#FF6B6B` | `--destructive` |
| Success | `#0C9409` | `#22C55E` | `--success` ⚠ non-text only, both appearances |
| Radius | `8px` | — | `--radius-sm` |

### ⚠ Three values deviate from the app tokens, and each has a reason

| Deviation | Why |
| --- | --- |
| **Page ground is `#F5F5F5`, not `#FFFFFF`** | Pure white inverts to **exactly `#000000`** — the one dark surface every designer avoids (halation on OLED, maximum eye strain against high-contrast text). |
| **Authored dark ground is `#1A1A1A`, never `#000000`** | Same reason, from the other side. Declaring the dark styles is *how* you get `#1A1A1A` instead of what inversion would produce. |
| **⚠ `#707070`–`#909090` is BANNED** for text and dividers | It is the **fixed point** of lightness inversion (`#808080` maps to `#7F7F7F` — it does not move) and the ambiguity zone of *partial* inversion, where a client may or may not decide it is "a light thing." A value there is unpredictable in exactly the clients that are hardest to test. ⚠ `--muted-foreground` `#666666` sits safely below the band; this is checked, not assumed. |

---

## 2. Type

```
'General Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif
```

⚠ **General Sans loads in roughly a quarter of opens.** It is unsupported in Gmail on every platform,
Outlook.com, Outlook for Android, Yahoo and Windows Mail; classic Outlook accepts the *declaration* and
ignores the remote font. **The design must be correct in Arial** (spec FR-015) — metric-mismatched
fallbacks are the leading cause of "the button text wrapped in Outlook."

⚠ **Weights are 400 / 500 / 600 only.** The design system forbids 700; `font-weight: 700` synthesises a
faux bold rather than loading a real face.

⚠ **The Times New Roman trap.** If the first family in a stack is one the Word engine does not have, it
**does not walk the rest of the stack** — it falls back to Times New Roman. Two mandatory mitigations,
both generated: `mso-font-alt: Arial` on the `@font-face`, and a `<!--[if mso]>` block forcing
`Arial, Helvetica, sans-serif` on every element.

⚠ **`@font-face` is wrapped in `<!--[if !mso]><!-->…<!--<![endif]-->`** so the Word engine never sees
it, and is **never nested inside `@media`** — a nested at-rule makes Gmail discard the **entire** style
block.

| Element | Size / line-height | Weight | Colour |
| --- | --- | --- | --- |
| Wordmark | 22 / 28 | 600 | Ink |
| H1 | 24 / 32 | 600 | Ink |
| Body | 16 / 24 | 400 | Ink or Muted ink |
| **Code** | **36 / 44**, tracking `0.15em` | 500 | Ink |
| Small print | 14 / 21 | 400 | Muted ink |
| Footer | 14 / 21 | 400 | Muted ink |
| Action label | 16 / 20 | 600 | Action label |

⚠ Every element carrying a `line-height` also carries **`mso-line-height-rule: exactly`** — the Word
engine's default grows the line box to fit the tallest glyph on the line, so a declared line-height is
otherwise a suggestion. And `line-height` is never below `font-size`, which clips descenders there.

---

## 3. Dark mode — what is generated, and why both blocks

Three mechanisms, **all generated from this one token map** so they cannot drift (spec FR-025):

1. **`color-scheme` / `supported-color-schemes` meta pair + a `:root` declaration.** Mandatory. This is
   what makes Apple Mail leave a declared palette alone. ⚠ Sources disagree about whether Apple Mail
   inverts; declaring the tags makes the question moot.
2. **`@media (prefers-color-scheme: dark)`** — honoured by Apple Mail, Outlook.com, Outlook for macOS,
   Outlook iOS, Outlook Android (2023-03+), Samsung. ⚠ **Not** by Gmail on any platform.
3. **`[data-ogsc]` / `[data-ogsb]` mirror** — Outlook.com and the Outlook apps stash the original value
   in an attribute and overwrite the live style; targeting the attribute reclaims control. ⚠ Both this
   and (2) are stylesheet-dependent, so **both are dead** in the Gmail app configured with a non-Google
   address and in the Word engine. That is acceptable **only because** of §4.

### ⚠ Why a hueless ramp survives all of this

> For a colour with **saturation = 0**, HSL-lightness inversion and naive per-channel inversion produce
> **exactly the same value**. A pure-neutral ramp has **no hue to shift**, so it is mathematically
> immune to the distortion that mangles branded email in forced dark mode. Contrast is preserved or
> improved: `#1A1A1A` on `#FFFFFF` = 16.1:1 → inverted, `#E5E5E5` on `#000000` = 16.8:1.

**So the exposure is not the ramp.** It is (a) the two semantic colours — under naive inversion
`#e01010` → cyan and `#0C9409` → pink, which is why neither may **ever** be the sole carrier of meaning
(spec FR-028); and (b) **partial** inversion splitting the ramp, which §4 rule 2 addresses.

⚠ **The Gmail blend-mode hack is deliberately NOT adopted**: three nested `<div>`s per protected region
against a 102 KB budget, dead in the non-Google-account configuration, protecting a design that does
not need protecting.

---

## 4. The four rules every generated style obeys

1. **⚠ Inline or it does not exist.** Every visual property that matters is an inline `style`
   attribute. The `<style>` block is a **progressive-enhancement layer only** — media queries,
   dark-mode overrides. **If the entire block were deleted, the message must still be correct.** The
   Gmail app with a non-Google address supports no `<style>` at all.
2. **⚠ Every element that sets a text colour also sets its own background**, and vice versa, on the
   same element. This is the **only** defence against partial inversion: a client that rewrites one of
   the pair cannot orphan the other if both are explicit.
3. **Inline styles express the 600px desktop layout**; media queries narrow to mobile. ⚠ Never the
   reverse — a mobile-first email renders as one narrow column in Outlook, which sees no media queries.
4. **No CSS custom properties, anywhere.** ⚠ Unsupported in Gmail on every platform, every Word-engine
   Outlook, Outlook.com, Outlook mobile, Yahoo and AOL — essentially the whole audience. The tokens are
   *resolved at generation time* into literal hex values; the variables live in the generator, never in
   the output.

---

## 5. Contrast — three passes, zero exemptions

`email-check` computes WCAG 2.1 AA over **every** text/surface pair in the generated set, three times
(spec FR-029, SC-006):

| Pass | Palette |
| --- | --- |
| 1 | Light, as authored |
| 2 | The dark restatement, as authored |
| 3 | ⚠ The **algorithmically inverted** light palette (`255 − v` per channel) |

⚠ **Pass 3 is valid precisely because the ramp is achromatic** (§3). It models what a client that
ignores the restatement and forces its own inversion will actually show — which is the case no
preview and no snapshot can reveal.

Thresholds: **4.5:1** normal text, **3:1** large text and non-text indicators. ⚠ **Success has no
foreground pair, in either appearance** — it clears 3:1 as an indicator and fails 4.5:1 as text, so
nothing may be written on it. `design-system/scripts/check-tokens.mjs` already fails the build if one
appears; this contract inherits that rule rather than restating it.

---

## 6. Two operator-supplied values in the footer

Added to [037's SSM mail contract](../../037-platform-email-delivery/contracts/ssm-mail.contract.md):

| Key | Read by | Why it cannot be inferred |
| --- | --- | --- |
| `/effy/<env>/mail/postal_address` | `@effy/email-kit/send`, the generator's footer block | ⚠ A real-world identifier naming a physical place, printed on **every** email the platform sends. |
| `/effy/<env>/mail/nonprod_allowlist` | `@effy/email-kit/send` | ⚠ Determines who *can* receive mail from a non-production environment. A guessed entry is a stranger receiving platform mail. |

⚠ Both **fail loudly** when unset — a Terraform validation that refuses a placeholder plus a
config-contract test reading the real `serverless.yml`. The mechanism exists in
`infra/envs/dev/variables.tf` (037's `alert_email` validation); this slice extends it.

⚠ **Only `hello@effyshopping.com` and `workspace-admin@effyshopping.com` may appear**, and they are
**derived from the message's audience**, never passed in — which is what makes a third address
structurally impossible to introduce.

---

## 7. Rules

1. **A hand-edited email token is a build failure.** The generator is the only writer.
2. **The generator resolves tokens to literal hex.** No `var()` reaches the output (§4.4).
3. **Both dark mechanisms come from one source.** A drift check asserts they cover the same selector set.
4. **The banned mid-tone band is enforced, not documented.**
5. **⚠ There is no logo image.** The wordmark is live text (spec FR-013). Classic Outlook blocks images
   by default, SVG is now blocked across Gmail/Outlook/Yahoo, and a dark transparent PNG disappears when
   the surface darkens. Type inverts perfectly; an image does not.
6. **Output is never minified.** ⚠ Minifying MJML output with a web-oriented minifier breaks email
   clients (Artsy, in production).
