# HTML Email Authoring Rulebook — Research Report

Compiled 2026-08-06. Every rule below is written to be turned into a testable requirement (`R-nn`) with a lint hook where one exists. Where sources conflict I say so explicitly rather than picking a winner silently.

---

## 0. Source hierarchy (read this before trusting anything else)

| Source | Status | Use for |
|---|---|---|
| **caniemail.com** — `https://www.caniemail.com/api/data.json` | **Live.** `api_version` 1.0.4, `last_update_date` **2026-07-20 09:56:37 +0000** | The only machine-readable, currently-maintained support matrix. **This is your lint dataset.** |
| **Litmus Email Analytics** — `litmus.com/email-client-market-share` | **Live**, monthly. Current data **May 2026**, >1 billion opens | Client weighting |
| **Good Email Code** (Mark Robbins) — `goodemailcode.com` | Live, accessibility-first | Canonical accessible boilerplate |
| **HTeuMeuLeu** (Rémi Parmentier, caniemail's author) — `hteumeuleu.com`, `github.com/hteumeuleu/email-bugs` | Live | Bug-level truth, dark-mode blend hacks |
| **Cerberus** — `cerberusemail.com` | Live | Battle-tested MSO/ghost-table patterns |
| **Email on Acid / Litmus blogs** | Live but 500s intermittently | Narrative explanations |
| ⚠ **Campaign Monitor CSS guide** — `campaignmonitor.com/css/` | **STALE — last updated 14 November 2017** | Historical only. **Do not lint against it.** It still says things like "Outlook.com dropped `float` (January 2013)". Several of its verdicts are now wrong. |

> **Rule R-00 (governance):** the lint dataset is `caniemail`'s `data.json`, pinned by `last_update_date`, vendored into the repo. Support values are `y` / `n` / `a` (partial) / `u` (unknown), optionally suffixed `#n` referencing `notes_by_num`. Structure: `data[].stats[family][platform][version] = "y"|"n"|"a"|"u"`. `nicenames.family` / `nicenames.platform` give display names. NPM mirror: `caniemail` (useparcel/avigoldman).

---

## 1. The client matrix that actually matters (2026)

### 1.1 Litmus, May 2026 (open-based, >1B opens)

| Rank | Client | Share |
|---|---|---|
| 1 | **Apple** (Apple Mail macOS + iPhone + iPad, incl. Mail Privacy Protection) | **64.66%** |
| 2 | **Gmail** (web + Android app + iOS app, via Gmail image cache) | **24.11%** |
| 3 | **Outlook** (desktop, majority 2016+) | **6.49%** |
| 4 | Yahoo Mail (webmail + apps) | 2.57% |
| 5 | Google Android (3rd-party mail apps on Android) | 1.38% |
| 6 | Outlook.com (browser webmail) | 0.38% |
| 7 | Mozilla Thunderbird | 0.21% |
| 8 | Orange.fr | 0.09% |
| 9 | Samsung Mail | 0.02% |
| 10 | Bell Email | 0.01% |

Apple + Gmail ≈ **89%** of opens.

### 1.2 ⚠ Why these numbers lie, and how to correct for them

- **They measure opens, not people, and not rendering engines.** Apple's Mail Privacy Protection (iOS 15+, 2021) pre-fetches images for essentially every Apple Mail user, so Apple's 64.66% is structurally inflated. Litmus itself brackets MPP into the Apple bucket.
- **A Gmail *address* read in Apple Mail counts as an Apple open.** So "Gmail 24%" understates how many of your recipients hold Gmail addresses, while overstating nothing about the Gmail *renderer*.
- **Outlook's 6.49% is the single most dangerous number in the table.** It is small by opens and enormous by *risk*, because it is the only mainstream renderer that is not a browser engine, and it skews to B2B/enterprise and to desktop (where people act on transactional mail). Do not budget engineering effort by share.
- **ProtonMail does not appear in Litmus at all** but is tested by caniemail (desktop webmail, iOS, Android). Treat it as a caniemail-only target.
- Statista and survey-based sources (EarthWeb, clean.email) report wildly different splits because they count *accounts*, not opens. Do not mix the two in one table.

### 1.3 The rendering engines you actually target (this is the real matrix)

| Engine bucket | Clients | Behaviour |
|---|---|---|
| **WebKit** | Apple Mail macOS, Apple Mail iOS/iPadOS, Outlook for Mac ≥16.x (new), all iOS webviews | Best support. `@font-face`, `prefers-color-scheme`, CSS variables, `border-radius`, media queries all ✅ |
| **Blink / Chromium** | **New Outlook for Windows (WebView2)**, Outlook.com, Outlook Android, Gmail Android app shell, Samsung Email, Thunderbird (Gecko, behaves similarly for our purposes) | Good support, but the *mail app* sanitiser is the real constraint, not the engine |
| **Google's sanitiser** | Gmail web, Gmail iOS, Gmail Android, Gmail mobile web | Engine is fine; **the HTML/CSS filter is the constraint**. No `@font-face`, no CSS custom-property *declarations*, no `prefers-color-scheme`, `<style>` stripped in `<body>`, 16 KB `<style>` cap, 102 KB clip |
| ⚠ **Microsoft Word (`mso`)** | **Classic Outlook for Windows 2007 / 2010 / 2013 / 2016 / 2019 / 2021 / Microsoft 365 desktop** | The reason this rulebook exists. No `max-width` on non-tables, no `border-radius`, no `background-image`, no `@font-face` (remote fonts ignored), no flex/grid, no CSS vars, 120 DPI scaling, animated GIF = frame 1 |
| **GANGA** — *Gmail App with Non-Gmail Accounts* | Gmail Android/iOS app configured with a POP/IMAP non-Google address | ⚠ **`<style>` is not supported at all.** No embedded CSS, therefore **no media queries and no dark-mode CSS**. Everything must survive on inline styles alone. caniemail note #2 on `html-style`: *"Partial. Not supported with non Google accounts."* |

### 1.4 ⚠ The Word engine is NOT going away on the timeline people claim

Widely repeated 2026 claim: *"2026 is the last year you need to worry about the Word engine."* **This is wrong as stated.** Microsoft's actual published timeline:

- New Outlook for Windows (WebView2/Blink) three-stage rollout: opt-in → opt-out → cutover.
- **February 2026: Microsoft delayed the enterprise opt-out phase from April 2026 to March 2027.**
- Classic Outlook (Word engine) is supported **until at least 2029** for perpetual/LTSC licences and M365 plans that include desktop apps.

> **Rule R-01:** the Word rendering engine is a **hard target through 2029**. No spec may treat it as legacy or optional.

---

## 2. Hard structural rules

### 2.1 Doctype — ⚠ genuine live disagreement

| Position | Who | Argument |
|---|---|---|
| **HTML5** `<!DOCTYPE html>` | Good Email Code (Mark Robbins), Cerberus, MJML output, Maizzle, most 2024–2026 practitioners | caniemail: HTML5 doctype **73.17%** support. Gmail rewrites *everything* to HTML5 anyway. Shorter (byte budget). Required for `<div role="article">` semantics to behave. |
| **XHTML 1.0 Transitional** | Campaign Monitor (2017 guide), several legacy ESPs, Email on Acid's older articles | "Renders correctly everywhere"; validates; avoids quirks-mode differences in old webmail |

What caniemail actually measures: Outlook Windows 2003–2019 — *"not supported. The HTML5 doctype has no impact here"* (the Word engine ignores doctype entirely). Outlook iOS/Android and Thunderbird are marked **buggy**: *"render as if there was no doctype with an Outlook email, and in HTML5 otherwise."* Gmail and Hotmail strip whatever you send and substitute their own.

> **Recommendation:** **HTML5** (`<!DOCTYPE html>`). The clients that would benefit from XHTML strip or ignore the doctype anyway; the clients that respect it are the modern ones that prefer HTML5. XHTML costs ~110 extra bytes against the 102 KB Gmail budget for zero measured benefit in 2026.
> **Rule R-02:** doctype is exactly `<!DOCTYPE html>`. Lintable: regex the first non-whitespace bytes.

### 2.2 Tables, not divs

- **Rule R-03:** Layout is `<table>` / `<tr>` / `<td>`. **No `display:flex`, no `display:grid`, no `float`, no `position:absolute/fixed/relative` for layout.** Word has no box model for these; `float` is unsupported or dropped in several webmail clients; `position` is partial-at-best (relative/absolute sometimes, `fixed` never).
- **Rule R-04:** Every layout table carries **all four**: `role="presentation"`, `cellpadding="0"`, `cellspacing="0"`, `border="0"`. The three HTML attributes are required because the Word engine honours the *attributes* and not the CSS equivalents (`border-collapse` is unreliable there). `role="presentation"` is the accessibility half — see §7.
- **Rule R-05:** Do **not** put `padding` on `<p>` or `<div>` and expect it in Outlook. Word applies padding reliably only on `<td>`. Use `margin` on semantic elements (`<h1>`, `<p>`) and `padding` on `<td>`. Badsender documents the specific Word bug where `padding-left` can be applied to the right side.
- **Rule R-06:** No negative margins. No `margin` on `<td>`. Outlook.com historically dropped `margin` entirely; Word's handling is inconsistent.

### 2.3 Width: 600px

- Historical basis: 1024×768 desktops with ~600px reading panes; Outlook's default reading pane is ~640px. Both numbers are still cited as the constraint.
- **MJML's `mj-body` default width is exactly `600px`.**
- **Rule R-07:** container width **600px** (acceptable range 600–640px; **never exceed 640px**). Outer table `width="100%"`, inner table `width="600"` **as an HTML attribute** plus `style="width:600px; max-width:600px;"`.
  - ⚠ Why both: caniemail `css-max-width` — Outlook Windows **2007–2016 = `n`**; Outlook Windows **2019 / Windows Mail = `a`, note #1: "functions only on `<table>` elements"**. Apple Mail iOS 5.1/6.1 = `a`, note #2: *"ineffective on `<table>` elements per CSS 2.1"*. So `max-width` alone is never sufficient and never universally safe — the HTML `width` attribute is the floor.

### 2.4 Ghost tables (hybrid / "spongy" layout)

The Outlook-only fixed-width scaffold wrapped around a fluid `<div>`. Cerberus's canonical form:

```html
<!--[if mso]>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
<tr><td width="340"><![endif]-->
  <div style="display:inline-block; width:100%; min-width:200px; max-width:340px; vertical-align:top;">
    Content here
  </div>
<!--[if mso]></td></tr></table><![endif]-->
```

Conditional-comment operators Cerberus documents: `<!--[if mso]>`, version targeting `<!--[if mso 14]>` (14 = Outlook 2010), negation `<!--[if !mso]><!-->…<!--<![endif]-->`, plus `gt`, `lt`, `gte`, `lte`, `|`.

- **Rule R-08:** every `<!--[if mso]>` has a matching `<![endif]-->`. Lintable by counting.
- **Rule R-09:** conditional comments may only contain markup that is *additive* for Outlook. Never put content that only Outlook sees and other clients lose.

### 2.5 The Outlook 120 DPI scaling bug

On Windows displays at >96 DPI (125% scaling → 120 DPI), Word multiplies **HTML attribute** dimensions by 1.25 (or 1.5 at 144 DPI) but does **not** scale text, which has its own DPI path. Result: a hero image grows, the headline beside it doesn't, layout shears.

The fix — an XML namespace inside an MSO conditional:

```html
<!--[if mso]>
<noscript>
  <xml>
    <o:OfficeDocumentSettings xmlns:o="urn:schemas-microsoft-com:office:office">
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
</noscript>
<![endif]-->
```

Some sources use `<!--[if gte mso 9]>`. Good Email Code wraps it in `<noscript>` (this stops some clients from displaying the XML as text). Both forms are in production use.

- **Rule R-10:** the `PixelsPerInch 96` block is mandatory in `<head>`.
- **Rule R-11:** because DPI scaling attacks *attributes*, express dimensions in **CSS** (`style="width:600px"`) **as well as** attributes wherever both are legal. Belt and braces — the attribute survives Word's box model, the CSS survives DPI scaling.

### 2.6 Size limits — exact numbers and what actually happens

| Limit | Value | Behaviour | Confidence |
|---|---|---|---|
| **Gmail clipping** | **~102 KB** of raw HTML | Message truncated; `[Message clipped] View entire message` link appended. **Tracking pixel and unsubscribe link below the cut do not load / are hidden.** Images are *not* counted (external). | **High** — universally reported (Mailchimp, Email on Acid, Blueshift, beehiiv). ⚠ Not deterministic: `hteumeuleu/email-bugs#41` documents Gmail clipping *below* 102 KB when certain special characters are present. |
| **Gmail `<style>` cap** | **16 KB** per caniemail note #6 on `html-style` | Style block dropped | ⚠ **Disagreement.** Freshinbox / Email on Acid have long cited **8192 characters**. Lint at the conservative **8 KB**. |
| **Gmail style-block validity** | any CSS parse error | ⚠ **The *entire* `<style>` block is discarded.** Most common cause: nesting `@` rules (`@font-face` or `@viewport` inside `@media`). | High |
| **Gmail `<style>` in `<body>`** | not supported (caniemail note #1) | Ignored | High |
| **Gmail mobile webmail** | `<style>` = `n` outright | Ignored | High |
| **GANGA** | `<style>` = not supported (note #2) | ⚠ **No embedded CSS at all** | High |
| **iOS Mail height** | **>5,000 px** scroll height | Content beyond is truncated / renders blank | Medium — DailyStory + several secondary sources; no first-party Apple documentation |
| ⚠ **Outlook "1.5 MB HTML truncation"** | — | **UNVERIFIED** | ⚠ I could not confirm a 1.5 MB Outlook HTML truncation threshold in any primary or reputable secondary source. What I did find: a Microsoft Q&A report of truncation above ~500 KB; Microsoft's ActiveSync `MaxEmailHTMLBodyTruncationSize` (a *server-side, admin-configurable* setting, not a fixed client limit); a 32 KB total limit on *saved templates* in new Outlook/OWA. **Do not put "Outlook truncates at 1.5 MB" in your spec as fact.** Write the requirement as a size budget instead. |
| Gmail mobile clipping | ~20 KB (iOS app, inconsistently) / ~75 KB (other mobile) | Clipped | ⚠ Low confidence — single secondary source (emailtooltester). Treat as folklore unless you reproduce it. |

> **Rule R-12:** total rendered HTML **≤ 90 KB** (10% headroom under 102 KB). **Hard fail** at 102 KB.
> **Rule R-13:** `<head>` `<style>` content **≤ 8 KB**.
> **Rule R-14:** no `@` rule may be nested inside another `@` rule.
> **Rule R-15:** no `<style>` element anywhere inside `<body>`.
> **Rule R-16:** the unsubscribe link and any legally-required footer must appear in the **first 90 KB** of the document. (This is the real reason clipping matters — it's a compliance risk, not a cosmetic one.)

---

## 3. CSS: what is safe

### 3.1 Inline vs `<style>` — the two-tier model

> **Rule R-17:** **Every visual property that matters must be inline (`style=""`) on the element.** The `<head>` `<style>` block is a **progressive enhancement layer only** — media queries, dark-mode overrides, hover states. If the entire `<style>` block were deleted, the email must still be correct.

Justification (caniemail `html-style` stats):

| Client | `<style>` | Note |
|---|---|---|
| Apple Mail macOS/iOS | ✅ | |
| Gmail desktop / iOS / Android | ⚠ partial | #1 not supported inside `<body>`; #6 16 KB cap |
| **Gmail — non-Google accounts (GANGA)** | ❌ | note #2 |
| Gmail mobile webmail | ❌ | |
| Outlook Windows 2003 | ✅ | |
| **Outlook Windows 2007–2019** | ⚠ partial | note #4: *"`<style>` elements need to be declared before their rules are used"* |
| Outlook Windows Mail 2020-01 / 2023-01 | ⚠ partial | note #4 |
| Outlook macOS / Outlook.com / Outlook iOS / Outlook Android | ✅ | |
| **Yahoo Android (2019-06, 2023-01)** | ⚠ buggy | note #3: *"The first `<head>` in the HTML is removed, so `<style>` elements need to be in a second `<head>`"* — ✅ fixed by 2025-06 |
| ProtonMail iOS/Android | ⚠ partial | note #1 |
| Samsung, Thunderbird, AOL, HEY, Mail.ru, Fastmail, IONOS, WP.pl | ✅ | |

⚠ Note #4 is a real, lintable constraint: in Word-engine Outlook the `<style>` element must appear **before** any element whose rules it sets. Since `<head>` precedes `<body>`, this is satisfied by construction — but it forbids a late-injected style block.

### 3.2 Property-by-property verdicts

| Property | Verdict | Evidence |
|---|---|---|
| `display:flex` / `grid` | ❌ **BANNED** | No Word support; inconsistent elsewhere |
| `float` | ❌ **BANNED** | Unsupported/dropped in Outlook.com and Word engine |
| `position` (any value) | ❌ **BANNED for layout** | `fixed` never; `absolute`/`relative` partial |
| `max-width` | ⚠ **allowed only as a secondary hint** | Outlook Win 2007–2016 = `n`; Win 2019/Windows Mail = `a` (tables only); Apple iOS 5.1/6.1 = `a` (not on tables). **Always pair with `width` attribute.** |
| `min-width` | ⚠ same treatment | Ghost-table territory |
| `background-color` | ✅ safe on `<td>`, `<table>`, `<body>` | Use `bgcolor` attribute *and* CSS |
| `background-image` | ❌ **not in Word-engine Outlook** — needs VML | See §5.6 |
| `border-radius` | ⚠ **degrade gracefully** | caniemail: **Outlook Windows 2003–2019 = `n`**, Windows Mail = `n`. Yahoo/AOL = `a` (note: *"shorthand for elliptical borders with the slash `/` notation is not supported"*). Note #1: *"Round corners can be used in VML with the `RoundRect` element."* → square corners in Outlook, or VML. |
| `box-shadow` | ⚠ decorative only | No Word support; treat as pure enhancement |
| **CSS custom properties (`--var`)** | ❌ **BANNED** | caniemail `css-variables`: **Gmail all platforms = `n`** (note #1: *"the `var()` function is supported, but not the variable declaration"*), **Outlook Windows 2003–2019 = `n`**, Windows Mail = `n`, Outlook.com = `n`, Outlook iOS/Android = `n`, Outlook macOS 16.80 = `n`, Yahoo/AOL/Mail.ru = `n`. That is essentially your whole audience. |
| Shorthand (`font:`, `background:`, `margin: 0 auto`) | ⚠ **prefer longhand** | Word's parser drops shorthands unpredictably; `margin:0 auto` centring does not work there — use `align="center"` on the table |
| `@media` queries | ⚠ enhancement only | Not in GANGA, not in Gmail mobile webmail, not in Word-engine Outlook |
| `!important` | ✅ and often necessary | Required for dark-mode overrides to beat client-injected inline styles |
| `mso-*` properties | ✅ Word only | `mso-line-height-rule`, `mso-hide`, `mso-font-alt`, `mso-text-raise`, `mso-padding-alt`, `mso-table-lspace/rspace` |
| `visibility:hidden` | ❌ in Outlook | pair with `mso-hide:all` |
| `display:none` | ⚠ inconsistent in Outlook | pair with `mso-hide:all` |

> **Rule R-18:** ban list, greppable: `display:\s*(flex|grid|inline-flex|inline-grid)`, `float:`, `position:\s*(absolute|fixed|sticky)`, `var\(`, `--[a-z-]+\s*:`, `@supports`, `calc(` (⚠ risky in Word), `clamp(`, `:has(`, `rem` in inline styles.

### 3.3 Mobile-first vs desktop-first

Because GANGA and Gmail mobile webmail get **no `<style>`**, and Word-engine Outlook gets no media queries, the **inline styles must be the desktop layout**, with media queries narrowing to mobile. A mobile-first email (inline = mobile, media query = desktop) renders as a single narrow column in Outlook desktop.

> **Rule R-19:** inline styles express the **600px desktop** layout. `@media screen and (max-width:600px)` narrows it. Never the reverse.

---

## 4. Typography and web fonts

### 4.1 `@font-face` support matrix (caniemail, verbatim front-matter)

| Client | Support |
|---|---|
| Apple Mail macOS 12.2, iOS 10.3 / 12.3.1 | ✅ `y` |
| **Gmail — desktop, iOS, Android, mobile webmail (2019-07+)** | ❌ **`n`** (note #6: Gmail supports only its own embedded fonts — Roboto, Google Sans) |
| **Outlook Windows 2003–2019** | ⚠ `a` — *"The declaration is supported but distant fonts are ignored"* |
| Outlook Windows Mail 2020-01 | ❌ `n` |
| Outlook macOS 2011–2016 | ✅ `y`; **macOS 16.80 → ❌ `n`** (regression) |
| Outlook.com 2019-07 / 2023-12 | ❌ `n` |
| Outlook iOS 2.51.1 | ✅ `y`; **iOS 3.29.0 → ❌ `n`** (regression) |
| Outlook Android | ❌ `n` |
| **Samsung Email Android 6.0 / 2021-11** | ✅ `y` (note #8: **not supported with Microsoft email addresses**) |
| **Thunderbird macOS 60.7–78.5** | ✅ `y` |
| Yahoo, AOL, Mail.ru, Fastmail, GMX/Web.de desktop | ❌ `n` |
| ProtonMail Android 2020-03 | ✅ `y` |
| HEY 2020-06, IONOS 1&1 2022-06 | ✅ `y` |
| Orange, SFR, LaPoste | ⚠ was `a`/`y`, **all regressed to `n`** by 2024–2025 |

**Overall: ~24.4% estimated support (21.95% `y` + 2.44% `a`).**

⚠ **One caniemail page-render summary I fetched claimed Gmail and Outlook.com support `@font-face`. That is wrong — the raw front-matter above is authoritative and says `n`.** Similarly a page summary claimed Thunderbird is unsupported; raw data says `y`. Always read the raw markdown, not a rendered summary.

### 4.2 The correct technique

Three delivery methods, in descending safety:

1. **`<link>` in `<head>`** — stripped by most clients but harmless. Not reliable.
2. **`@import url(...)` inside a `<style>`** — ⚠ **DANGEROUS**: this is an `@` rule; if you nest it inside `@media`, Gmail discards your **entire** style block (§2.6).
3. **`@font-face` inside `<style>`, wrapped for safety** — the standard.

The production pattern:

```html
<!--[if !mso]><!-->
<style>
  @font-face {
    font-family: 'General Sans';
    font-style: normal;
    font-weight: 400;
    src: url('https://…/GeneralSans-Regular.woff2') format('woff2'),
         url('https://…/GeneralSans-Regular.woff') format('woff');
    mso-generic-font-family: swiss;      /* Word: treat as sans-serif */
    mso-font-alt: 'Arial';               /* Word: substitute Arial, not Times */
  }
</style>
<!--<![endif]-->
```

⚠ Wrapping `@font-face` in `<!--[if !mso]><!-->…<!--<![endif]-->` prevents Word from ever seeing it. This is what stops the Times New Roman fallback.

### 4.3 ⚠ The Times New Roman trap (the single most-hit Outlook typography bug)

> **If the first family in a `font-family` stack is a font Word does not have, Word does not walk the rest of the stack. It falls back to Times New Roman.**

Two mandatory mitigations:

1. **`mso-font-alt`** on the `@font-face`, or
2. **A conditional font override in `<head>`:**

```html
<!--[if mso]>
<style>
  * { font-family: Arial, Helvetica, sans-serif !important; }
  h1, h2, h3, p, td, a, span { font-family: Arial, Helvetica, sans-serif !important; }
</style>
<![endif]-->
```

### 4.4 `mso-line-height-rule: exactly`

Word's default is *auto* line height: it grows the line box to fit the tallest glyph, emoji, superscript, or inline image on the line. `mso-line-height-rule:exactly` forces the declared value.

Conversely, if `line-height` < `font-size`, Word **clips descenders**. Companion property `mso-text-raise` (offset = `(font-size − line-height) / 2`) re-centres.

> **Rule R-20:** every element carrying a `line-height` also carries `mso-line-height-rule:exactly` in the same style attribute.
> **Rule R-21:** every text-bearing element declares an explicit `font-family` stack ending in `Arial, Helvetica, sans-serif` (or `Georgia, 'Times New Roman', serif`). No element inherits its font.
> **Rule R-22:** `line-height` ≥ `font-size` always; and ≥ 1.5× for body copy (accessibility, §7).

### 4.5 The fallback stack

```
font-family: 'General Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI',
             Roboto, Helvetica, Arial, sans-serif;
```

⚠ Design the email so it is **correct in Arial/Helvetica**. Roughly **three-quarters of your opens will not load your web font** (Gmail 24% + Outlook 6.5% + Yahoo 2.6% at minimum; and the Apple bucket's `y` is the only large win). Metric-mismatched fallbacks are the leading cause of "the button text wrapped in Outlook."

---

## 5. Images

### 5.1 Blocking

- **Blocked by default:** classic Outlook desktop (all Word-engine versions), several Yahoo Mail versions, and Outlook/Exchange environments with "Allow content" policies. New Outlook has documented blocked-image problems (Office Watch, 2025).
- **Not blocked by default (generally):** Gmail (proxies through `googleusercontent.com` image cache — this is why Litmus can count Gmail opens), Apple Mail (⚠ but MPP pre-fetches through Apple's proxy, so an "open" ≠ a human).
- **Rule R-23:** the email must be **comprehensible and actionable with all images blocked**. Automatable as a manual gate; partially lintable — see R-27.

### 5.2 Alt text

> **Rule R-24:** every `<img>` has an `alt` attribute. Decorative images use `alt=""` (**empty, not missing**) plus `role="presentation"` — a missing `alt` makes a screen reader read the filename.

**Styling alt text** (so the blocked-image state isn't unstyled 12px Times):

```html
<img src="…" width="600" height="200" alt="Your order EFY-HVX2AE is on its way"
     style="display:block; width:100%; max-width:600px; height:auto; border:0; outline:none;
            text-decoration:none; font-family:Arial,Helvetica,sans-serif; font-size:16px;
            line-height:24px; color:#1A1A1A; -ms-interpolation-mode:bicubic;">
```

The `font-*`/`color` on the `<img>` style the alt text when the image fails. ⚠ Outlook renders alt text in a fixed box of `width`×`height`; long alt text is clipped there.

### 5.3 `display:block` and the image gap

`<img>` is inline by default → the line-box descender space creates a **3–5px gap** below it inside a `<td>`.

> **Rule R-25:** every `<img>` carries `display:block` in its inline style. Where an image must be inline (an icon in a sentence), add `vertical-align:middle` instead.

### 5.4 Dimensions

> **Rule R-26:** every `<img>` carries **both** the HTML `width` and `height` attributes **and** CSS `width`/`height` in the style attribute. Reasons: (a) Outlook draws blocked images at the attribute box; (b) Word ignores `max-width:100%` and renders at natural size; (c) unset dimensions cause reflow.
> ⚠ Exception for fluid images: use `width` attribute + `style="width:100%; max-width:600px; height:auto;"` and **omit the `height` attribute** — a fixed `height` attribute plus `height:auto` fights.

### 5.5 Retina (@2x)

Export at **2× the display size**, declare the **1× size** in attributes and CSS. For a 600px container: export 1200px wide, declare `width="600"`. For an inline image inside 20px padding: display at 560px, export at 1120px.

⚠ Some Outlook versions render the @2x asset at its **natural** size regardless of attributes. Mitigation: `width` attribute (not `height`) + `max-width` in CSS; or wrap in an MSO conditional that sets an explicit `<td width="600">`.

⚠ Retina doubles byte weight. This does not count against Gmail's 102 KB (external images are excluded) but it does hit render time and mobile data.

### 5.6 Background images

**Unreliable by construction.** Word-engine Outlook does not support `background`/`background-image` in CSS. The only route is VML:

```html
<td background="https://…/hero.jpg" bgcolor="#1A1A1A" valign="top"
    style="background-image:url('https://…/hero.jpg'); background-size:cover; background-position:center;">
  <!--[if gte mso 9]>
  <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false"
          style="width:600px; height:400px;">
    <v:fill type="frame" src="https://…/hero.jpg" color="#1A1A1A" />
    <v:textbox inset="0,0,0,0">
  <![endif]-->
  <div>
    <!-- real HTML content, sits on top -->
  </div>
  <!--[if gte mso 9]>
    </v:textbox>
  </v:rect>
  <![endif]-->
</td>
```

- `<v:rect>` — the vector rectangle; `style` must carry **explicit px** width/height (VML has no `auto`).
- `<v:fill type="frame" src="…" color="…">` — image + **fallback colour**.
- `<v:textbox inset="0,0,0,0">` — the HTML container laid over it.
- `stroke="false"` removes the default VML border; `fill="true"` enables the fill.
- Requires `xmlns:v="urn:schemas-microsoft-com:vml"` on `<html>` (or repeated on the element).
- Generator: **backgrounds.cm** (Campaign Monitor).

> **Rule R-27:** a background image is **decoration only**. No text may depend on it for legibility, and a `bgcolor` fallback that satisfies contrast against the overlaid text is mandatory.

### 5.7 SVG — ❌ do not use

⚠ **Status changed in late 2025.** Following a surge in malicious SVG payloads, most major clients now **block SVG in email**: not supported in Gmail, Outlook (desktop, mobile, and web all stopped rendering SVG as of late 2025), or Yahoo. Partial in Apple Mail only. caniemail tracks both `image-svg` (SVG as `<img src>`) and `html-svg` (inline `<svg>`); both are near-zero.

> **Rule R-28:** no `.svg` in `src`, no inline `<svg>` element. Ship PNG (or WebP with PNG fallback — ⚠ WebP is itself unsupported in Word-engine Outlook).

### 5.8 Animated GIF

- **Outlook 2007+ desktop: first frame only.** Outlook 2019 plays once then shows a replay button.
- Supported: Outlook mobile apps, Outlook.com, Apple Mail, Gmail.
- Accessibility: avoid flashing between **2 Hz and 55 Hz**; stop animation after **3 cycles within 5 seconds** (Litmus, WCAG 2.2.2).

> **Rule R-29:** frame 1 of every GIF must be a complete, standalone message.

### 5.9 ⚠ Images as the only carrier of branding

Given (a) Outlook blocks images by default, (b) Gmail proxies them, (c) MPP pre-fetches them, and (d) SVG is now blocked — **an image-only logo is invisible to a meaningful fraction of recipients on first render.**

> **Rule R-30:** brand identity must be carried by **live HTML text + colour + type**, with the logo image as enhancement. For a monochrome design this is nearly free: the wordmark can be live text in the ramp's darkest step at the right weight/tracking, needing no image at all. **This is the strongest single recommendation in this report for a hueless design system.**

---

## 6. Dark mode — ⚠ the critical section for a monochrome ramp

### 6.1 The three behaviours, per client (Litmus grouping)

| Behaviour | Clients |
|---|---|
| **No colour change** | **Apple Mail** (macOS + iOS), **Gmail Desktop webmail**, AOL, Yahoo Mail |
| **Partial invert ("hybrid")** | **Outlook.com**, **Outlook app iOS**, **Outlook app Android**, **Office 365 macOS**, **Gmail app Android** |
| **Full invert** | **Outlook 2021 Windows**, **Office 365 Windows**, **Windows Mail**, **Gmail app iOS** |

⚠ **Disagreement in the literature.** Several sources (Enchant, Mailmodo, Uplers) describe Apple Mail as doing "partial inversion." Litmus and Uplers both also state Apple Mail does **not** change colours in the absence of dark-mode meta tags. The reconciliation that matches observed behaviour: **Apple Mail does not touch an email that declares `color-scheme`; for emails that declare nothing, Apple may apply its own darkening.** Treat "declare `color-scheme` and Apple leaves you alone" as the operative rule.

⚠ Second disagreement: one source says "Gmail iOS full inversion, Gmail Android partial"; another says "partial inversion is most common in Gmail web and Gmail mobile." Litmus's grouping (Gmail Desktop = no change, Gmail Android = partial, Gmail iOS = full) is the most consistently reproduced. Use it.

### 6.2 What "inversion" actually does — the algorithm

This is the key technical fact, and it is what makes your palette safe or unsafe.

- **Naive RGB inversion** (`255 − x` per channel) shifts hue: red→cyan, green→magenta, blue→yellow. Clients abandoned this because it destroys brand colour.
- **What clients actually do: convert to HSL, invert *lightness* only (`L' = 100% − L`), keep hue and saturation.** Rémi Parmentier and multiple analyses confirm this is *roughly* how Gmail iOS works. Sophisticated implementations additionally clamp — e.g. `#FFFFFF` → `#121212` rather than `#000000`, and text avoids pure white.
- Some implementations invert **CIELAB L\*** instead (perceptually uniform → contrast ratios better preserved).
- **Partial inversion** = the client only rewrites colours it classifies as "background-like light" or "text-like dark", using a lightness threshold, and leaves everything in the middle alone.

### 6.3 ⚠⚠ What forced inversion does to YOUR monochrome ramp

**The single most important result in this report:**

> For a colour with **saturation = 0** (a pure grey), HSL-lightness inversion and naive RGB inversion produce **exactly the same value**: `L' = 1 − v/255` ⟺ `rgb' = 255 − v`.
> **Therefore a pure-neutral ramp is mathematically immune to hue-shift artefacts under every known inversion algorithm.** There is no hue to shift.

Your ramp under full inversion:

| Your token | RGB | HSL L | Inverted L | Result | Comment |
|---|---|---|---|---|---|
| `#FFFFFF` | 255 | 100% | 0% | **`#000000`** | ⚠ pure black — harshest possible surface |
| `#F5F5F5` | 245 | 96.1% | 3.9% | `#0A0A0A` | fine |
| `#E5E5E5` (typical hairline) | 229 | 89.8% | 10.2% | `#1A1A1A` | hairline stays a hairline |
| `#808080` (mid) | 128 | 50.2% | 49.8% | **`#7F7F7F`** | ⚠ **fixed point — does not move** |
| `#666666` | 102 | 40% | 60% | `#999999` | fine |
| `#1A1A1A` | 26 | 10.2% | 89.8% | **`#E5E5E5`** | fine |

Contrast is essentially preserved (and often improves):

| Pair, light | Ratio | Same pair, inverted | Ratio |
|---|---|---|---|
| `#1A1A1A` on `#FFFFFF` | **16.1 : 1** | `#E5E5E5` on `#000000` | **16.8 : 1** |
| `#666666` on `#FFFFFF` | 5.73 : 1 | `#999999` on `#000000` | 7.37 : 1 |
| `#808080` on `#FFFFFF` | 3.95 : 1 | `#7F7F7F` on `#000000` | 5.30 : 1 |
| `#E5E5E5` on `#FFFFFF` | 1.24 : 1 | `#1A1A1A` on `#000000` | 1.21 : 1 |

**Conclusion: full inversion is essentially harmless to a grayscale design.** The whole ramp flips end-for-end and remains a correct, legible grayscale design. This is a real structural advantage of dropping the brand hue, and it is worth writing into the spec as a rationale.

**⚠ The four things that DO break:**

1. **⚠ PARTIAL inversion is the real enemy, not full inversion.** Partial inverters (Outlook.com, Outlook apps, Gmail Android, Office 365 macOS) rewrite only what crosses their lightness threshold. On a ten-step neutral ramp, **some steps cross and some don't** — the ramp splits. The classic failure: the client darkens the `#FFFFFF` background to near-black **but leaves `#1A1A1A` body text alone** → black text on a black card. **This is the failure mode you must test for on every screen.**

2. **⚠ The two semantic colours are your only exposure.**
   - `#e01010` — HSL(0°, 87.4%, 47.1%). Under **L-inversion** → L 52.9% ≈ `#EC2020` (still red, slightly lighter — fine). Under **naive RGB inversion** → `#1FEFEF` — **cyan**. An error state rendered in cyan.
   - `#0C9409` — HSL(≈118°, 88.5%, 30.8%). Under **L-inversion** → L 69.2% ≈ a light green (fine). Under **naive RGB inversion** → `#F36BF6` — **pink**.
   - You already have the correct mitigation from your own constitution: success is a *non-text indicator only*, and no meaning is carried by colour alone. **Formalise it:** every error and every success state must also carry a word or an icon. Then even a cyan "error" is still an error.

3. **⚠ Pure `#FFFFFF` → pure `#000000`.** Pure black is the one dark surface every designer avoids: halation on OLED, smearing on scroll, maximum eye strain against high-contrast text. This is the substantive reason behind the folk rule "don't use pure white and pure black." Since inversion maps `#FFFFFF` → `#000000` exactly, **declaring your own dark styles is how you get `#1A1A1A` instead of `#000000` as the dark surface**.

4. **⚠ Images do not invert.** A black wordmark PNG on transparency stays black while its surface goes black.

### 6.4 The control mechanisms, in order of reliability

**(a) Declare the meta tags — mandatory.**
```html
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
</style>
```
This tells Apple Mail (and others) "I have handled dark mode, don't touch my colours." ⚠ `content="light only"` opts out of Apple's darkening entirely — legitimate but you lose all dark-mode adaptation; do not use it if your ramp inverts cleanly (yours does).

**(b) `prefers-color-scheme` — caniemail raw stats, verbatim:**

| Client | Support |
|---|---|
| Apple Mail macOS 12.4 / 16.0 | ✅ `y` (macOS 10.3 `n`) |
| Apple Mail iOS 13.0 / 16.1 | ✅ `y` (iOS 12.2 `n`) |
| **Gmail — desktop, iOS, Android, mobile webmail (2020-01 and 2022-12)** | ❌ **`n` on every platform** |
| **Outlook Windows 2003–2019** | ❌ `n` |
| Outlook Windows Mail 2020-01 | ❌ `n` |
| Outlook macOS 2019 ✅; 16.70 / 16.80 | ✅ `y #3` |
| **Outlook.com 2019-07 ✅ / 2022-12** | ✅ `y #3` |
| Outlook iOS 2020-01 ✅ / 2022-12 | ✅ `y #3` |
| **Outlook Android** — 2020-01 `n`, 2022-12 `n #3`, **2023-03 ✅ `y #3`** | |
| Samsung Email Android 6.0 `n` → **6.1 ✅ `y`** | |
| **Thunderbird macOS** — 60.8 `n`, **68.4 `y`**, **78.5 `n`, 91.13 `n`** ⚠ regressed | |
| Yahoo | ❌ `n` — note #1 *"transformed into `@media ( _filtered_a )`"*; 2022-12 note #6 *"transformed into `@media ()`"* |
| AOL | ❌ `n #1` |
| ProtonMail (all) | ❌ `n` |
| HEY | 2020-06 `y` → **2022-12 `n #5`** *"transformed into `@media (false)`"* |
| Fastmail | 2021-07 `n #2` *"`@media none`"* → 2022-12 `y #4` *"`@media all` at run time if it applies"* |

⚠ **I fetched a caniemail *page render* earlier that claimed "Gmail (all platforms from 2020-01+)" supports `prefers-color-scheme`. That is FALSE.** The raw front-matter says `n` on all four Gmail platforms at both test dates. Do not let a rendered summary into your spec.

**Note #3 is the important one:** Outlook.com, Outlook macOS 16.70+, Outlook iOS, and Outlook Android 2023-03+ **support `prefers-color-scheme` AND simultaneously inject** `data-ogsc`, `data-ogac`, `data-ogsb`, `data-ogab` attributes.

**(c) The `[data-ogsc]` family — Outlook.com / Outlook apps.**

Four attributes, not two:
- `data-ogsc` — **o**riginal **s**tyle **c**olor (from a `style` attribute)
- `data-ogsb` — original **s**tyle **b**ackground
- `data-ogac` — original **a**ttribute **c**olor (from an HTML attribute, e.g. `<font color>`)
- `data-ogab` — original **a**ttribute **b**ackground (e.g. `bgcolor`)

Outlook stashes your original value in the attribute and overwrites the live style. You target the attribute to reclaim control:

```css
[data-ogsc] .dark-surface { background-color:#1A1A1A !important; }
[data-ogsc] .dark-text    { color:#F5F5F5 !important; }
[data-ogsb] .dark-surface { background-color:#1A1A1A !important; }
```
⚠ These are **attribute-presence selectors in a `<style>` block** — so they are dead in GANGA and dead in Word-engine Outlook.

**(d) The Gmail blend-mode hack (Rémi Parmentier, 2021).**

Gmail forces light text dark. The workaround exploits the fact that **`background-image: linear-gradient()` is not transformed by Gmail's dark mode**, combined with the `u + .body` Gmail-only selector from howtotarget.email:

```html
<style>
  u + .body .gmail-blend-screen     { background:#000; mix-blend-mode:screen; }
  u + .body .gmail-blend-difference { background:#000; mix-blend-mode:difference; }
</style>
…
<div style="background:#1A1A1A; background-image:linear-gradient(#1A1A1A,#1A1A1A); color:#F5F5F5;">
  <div class="gmail-blend-screen">
    <div class="gmail-blend-difference">
      Content that must stay light-on-dark
    </div>
  </div>
</div>
```
`difference` mathematically inverts back toward the intended value; `screen` preserves the background. ⚠ **Three nested divs per protected region** — expensive in bytes against 102 KB. ⚠ **Does not work in GANGA** (no `<style>`, no `mix-blend-mode`) — it degrades to Gmail's default transformation. Filed as `mjmlio/mjml#2513`. Use surgically, not globally.

**(e) Transparent-PNG logo trick.** Ship the wordmark as a transparent PNG in a **mid-tone grey that reads on both grounds**, or add a translucent outline / light drop-shadow around dark glyphs so they stay legible when the ground darkens. Litmus's phrasing: *"Add a translucent outline to transparent PNGs with dark text for legibility in email clients where Dark Mode customization is more limited."*
⚠ **Better for a monochrome system: don't ship a logo image at all** (see R-30). Live text inverts perfectly; a PNG does not.

### 6.5 Dark-mode rules for a hueless ramp

> **Rule R-31:** `color-scheme` + `supported-color-schemes` meta tags and the `:root` block are mandatory.
> **Rule R-32:** Every element that sets a `color` also sets a `background-color` (and vice versa) **on the same element**. This is the only defence against partial inversion — a partial inverter that changes one of the pair cannot leave the other orphaned if both are explicit and both are overridden together.
> **Rule R-33:** No text on a *default/unstyled* surface. Every `<td>` carrying text declares `bgcolor` **and** `background-color`.
> **Rule R-34:** Do not use pure `#FFFFFF` as the page ground if you can use `#F5F5F5`; do not use pure `#000000` as the dark ground — target `#1A1A1A`. Rationale: `#FFFFFF` inverts to exactly `#000000`.
> **Rule R-35:** ⚠ **Avoid the mid-tone band ~`#707070`–`#909090` for anything load-bearing.** It is the fixed point of lightness inversion and the ambiguity zone of *partial* inversion — a partial inverter may or may not decide it is "a light thing." Push muted text darker (`#595959`) and dividers lighter (`#E5E5E5`).
> **Rule R-36:** Ship a `@media (prefers-color-scheme: dark)` block that explicitly restates the ramp inverted, **plus** the `[data-ogsc]`/`[data-ogsb]` mirror of the same rules. Both blocks must be generated from the same token source so they cannot drift.
> **Rule R-37:** `#e01010` and `#0C9409` are **never the sole carrier of meaning**. Every error carries the word/icon; every success carries a non-colour indicator. This is already your constitution's rule — dark mode makes it load-bearing rather than merely polite.
> **Rule R-38:** every image that contains ink (logo, icon, illustration) must be legible on both `#FFFFFF` and `#1A1A1A`, or be swapped via `prefers-color-scheme` + `[data-ogsc]`, or be eliminated in favour of live text.

---

## 7. Accessibility

| Rule | Value | Source |
|---|---|---|
| **R-39** `lang` and `dir` on `<html>` | `<html lang="en" dir="ltr">` | Good Email Code; Litmus |
| **R-40** Content wrapper with article semantics | `<div role="article" aria-roledescription="email" aria-label="…" lang="en" dir="ltr">` | Good Email Code |
| **R-41** `role="presentation"` on **every** layout table | prevents screen readers announcing "table, 3 columns, row 1 of 12" and reading cell-by-cell | Litmus |
| **R-42** `aria-hidden="true"` on decorative elements | ⚠ differs from `role="presentation"`: `aria-hidden` also hides **all descendants**. Never put it on anything containing text a user needs. | Litmus |
| **R-43** Semantic headings `<h1>`–`<h3>` in order, no level skipping; `<p>` for paragraphs | with `margin:0` + explicit `font-size`/`line-height`/`mso-line-height-rule:exactly` (Word gives them defaults you don't want) | Litmus |
| **R-44** Body text ≥ **14px** desktop, ≥ **16px** mobile | Litmus: *"Minimum body text: 14px on desktop/laptop; mobile minimum 16px via media queries"* | Litmus |
| **R-45** Line-height ≥ **1.5×** font-size | Litmus | |
| **R-46** Contrast: WCAG **AA** — **4.5:1** normal text, **3:1** large text (≥18.66px bold / ≥24px) and UI/graphical objects | ⚠ Litmus states "meet WCAG AA" without naming ratios; the numbers are WCAG 2.1 §1.4.3 / §1.4.11 | |
| **R-47** Tap targets ≥ **44×44 px** (Apple HIG) / **48×48 dp** (Material) | ⚠ Litmus says only "large enough for thumb/finger." The 44/48 numbers come from the platform HIGs, not from email literature. Use **48px** to satisfy both. Achieve it with `<td>` padding, not with `height` on the `<a>`. | |
| **R-48** No "click here" / "read more" link text | links must make sense out of context | Litmus |
| **R-49** No colour as the sole information channel | Litmus | |
| **R-50** Animation: nothing flashes at 2–55 Hz; GIFs stop after 3 cycles / 5 s | Litmus (WCAG 2.3.1, 2.2.2) | |
| **R-51** Text alignment left when >2 lines | Litmus | |
| **R-52** `font-size:medium; font-size:max(16px, 1rem)` on the article wrapper | respects user font-size preference while flooring at 16px | Good Email Code |

### 7.1 The preheader (preview text) — do it correctly

Good Email Code's recommended form:

```html
<div style="display:none">
  Your order is on its way&#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; …
</div>
```

- `&#8199;` FIGURE SPACE, `&#65279;` ZERO WIDTH NO-BREAK SPACE, `&#847;` COMBINING GRAPHEME JOINER — repeated **100–200 times** to push the body copy out of the inbox preview line.
- ⚠ **`&#847;` stopped working in Mail.ru, Yahoo, AOL, and Apple Mail 16.4+ between late 2022 and March 2023.**
- ⚠ Several Android clients (GMX, Web.de, Mail.com, 1&1, K-9) **pull preview text from the plain-text part**, and will show raw entity codes if that part was auto-generated from the HTML. → author the plain-text part by hand.

The heavier "belt-and-braces" form widely published by Email on Acid / Litmus / Dotdigital:

```html
<div style="display:none !important; visibility:hidden; mso-hide:all;
            font-size:1px; line-height:1px; max-height:0; max-width:0;
            opacity:0; overflow:hidden; color:#ffffff;">
  Preview text here…
</div>
```
⚠ `color:#ffffff` in this snippet is a **dark-mode landmine** — on a dark ground it becomes visible white-on-white-turned-dark. Prefer `mso-hide:all` + `display:none !important` + zero dimensions and **omit the colour hack**.

> **Rule R-53:** preheader is the first element inside `<body>`, uses `display:none` + `mso-hide:all`, contains no colour hack, and is padded with `&#8199;&#65279;` pairs (not `&#847;`).

---

## 8. Deliverability-affecting authoring rules

### 8.1 Plain-text `multipart/alternative` — is it required?

- **Not required by any RFC for delivery.** But **SpamAssassin flags HTML-only mail** (`MIME_HTML_ONLY`), and it costs points.
- **Gmail does not use SpamAssassin.** Gmail's filtering is **engagement- and reputation-based** — opens, clicks, replies, complaint rate — and it cares far more about those than about your MIME structure.
- Several Android clients read the **preview text from the plain-text part** (§7.1).

> **Rule R-54:** always send `multipart/alternative` with a **hand-authored** plain-text part (not an auto-strip of the HTML). Lintable: assert both parts exist and that the text part is non-empty, contains the unsubscribe URL, and contains no HTML entities.

### 8.2 Image-to-text ratio — mostly folklore, with a real kernel

- **Myth:** "you need 60/40 text to image."  No provider publishes such a rule.
- **Real:** SpamAssassin's `HTML_IMAGE_RATIO_02` fires on the ratio of **text characters to total HTML**, not visual pixel area. Reputable 2025 data (Mailtrap deliverability report) finds no measurable deliverability difference for a single small image with good sender reputation; attention increases when image content passes ~**40%**.
- **Real and serious:** an **image-only email** (one big JPEG, no HTML text) is a classic spam signature *and* is invisible with images blocked *and* is inaccessible.

> **Rule R-55:** every email contains **real HTML text** carrying the core message. No image-only emails. Lintable: strip tags, assert ≥ N visible characters, assert the primary CTA exists as text inside an `<a>`.

### 8.3 What actually moves the needle in 2026

Gmail/Yahoo bulk-sender requirements (effective **February 2024**, enforcement ramp from **November 2025**), for senders of **≥5,000 messages/day**:
- **SPF and DKIM both** required.
- **DMARC** with at least `p=none` on the From domain.
- **One-click unsubscribe** — `List-Unsubscribe` + `List-Unsubscribe-Post` headers per **RFC 8058**; honoured within **2 days**.
- **User-reported spam rate below 0.10%**; **never above 0.30%** (above 0.3% = ineligible for mitigation from June 2024).
- Non-compliant traffic now sees temporary and permanent rejections.

### 8.4 Real vs folklore spam triggers

| Real | Folklore / overstated |
|---|---|
| Missing SPF/DKIM/DMARC alignment | "Don't use the word FREE" |
| Complaint rate > 0.3% | "Exclamation marks trigger filters" |
| Sending to spam traps / stale lists | "Red text triggers filters" |
| Poor domain/IP reputation, sudden volume spikes | "Attachments always trigger filters" |
| **Link shorteners (bit.ly etc.)** — genuinely reputation-poisoned, shared across abusers | "You need exactly 60/40 text-to-image" |
| Mismatched `From` domain vs link domains | "One image = spam" |
| HTML-only, no text part (SpamAssassin points) | "All-caps subject = instant spam" |
| Broken/redirecting links, non-HTTPS assets | |

Other authoring facts:
- **Subject line:** no filter penalty for length; the constraint is display truncation — **~35–40 characters** visible on mobile, ~60 on desktop. This is a UX rule, not a deliverability rule.
- **`From` name:** stable, recognisable, consistent across sends — reputation and engagement attach to the *pattern*.
- **Tracking pixels:** 1×1 transparent GIF; ⚠ **must sit above the Gmail 102 KB clip point or it never loads**; ⚠ Apple MPP pre-fetches it, so open rates from Apple are fiction (this is the same effect inflating Apple's 64.66%).

---

## 9. The canonical annotated skeleton

Synthesised from Good Email Code (accessibility + head), Cerberus (MSO), backgrounds.cm/buttons.cm (VML), and the caniemail constraints above. Annotated with the rule numbers each line satisfies.

```html
<!DOCTYPE html>                                                     <!-- R-02 -->
<html lang="en" dir="ltr"                                           <!-- R-39 -->
      xmlns:v="urn:schemas-microsoft-com:vml"                       <!-- VML namespace, §5.6 -->
      xmlns:o="urn:schemas-microsoft-com:office:office">            <!-- OfficeDocumentSettings, R-10 -->
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=yes">
  <!-- stop iOS/Android auto-linking phone numbers, dates, addresses in your ramp colour -->
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
  <!-- stop Apple Mail from re-flowing/shrinking the email -->
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">                   <!-- R-31 -->
  <meta name="supported-color-schemes" content="light dark">        <!-- R-31 -->
  <title>Your order EFY-HVX2AE is on its way</title>

  <!-- R-10 : pin Word's internal DPI to 96, killing the 1.25x/1.5x scale.
       <noscript> wrapper keeps clients that ignore the conditional from printing the XML. -->
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->

  <!-- R-21 : Word never sees a web font, so it never falls back to Times New Roman. -->
  <!--[if mso]>
  <style>
    * { font-family: Arial, Helvetica, sans-serif !important; }
    table, td, h1, h2, h3, p, a, span, div { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->

  <!-- R-13 (<=8KB) / R-14 (no nested @) / R-15 (never in <body>) / R-17 (enhancement only) -->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }

    /* Web font: hidden from Word entirely so the stack is walked normally. */
    /* NOTE: this @font-face is deliberately NOT inside any @media — nesting @ rules
       makes Gmail discard this entire <style> block (§2.6). */

    /* Client resets */
    body { margin:0 !important; padding:0 !important; width:100% !important;
           -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse !important; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img   { border:0; outline:none; text-decoration:none;
            -ms-interpolation-mode:bicubic; display:block; }          /* R-25 */
    a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important;
                                font-size:inherit !important; font-family:inherit !important;
                                font-weight:inherit !important; line-height:inherit !important; }

    /* R-19 : mobile narrowing only. Inline styles are the 600px desktop layout. */
    @media screen and (max-width:600px) {
      .container { width:100% !important; max-width:100% !important; }
      .stack     { display:block !important; width:100% !important; }
      .p-24      { padding-left:16px !important; padding-right:16px !important; }
      .fs-16     { font-size:16px !important; line-height:24px !important; }  /* R-44 */
    }

    /* R-36 : dark ramp, restated explicitly. Generated from the token source. */
    @media (prefers-color-scheme: dark) {
      .bg-page    { background-color:#0A0A0A !important; }
      .bg-surface { background-color:#1A1A1A !important; }   /* never #000000 — R-34 */
      .txt-strong { color:#F5F5F5 !important; }
      .txt-muted  { color:#A3A3A3 !important; }
      .rule       { border-color:#333333 !important; }
      .btn-bg     { background-color:#F5F5F5 !important; }
      .btn-fg     { color:#1A1A1A !important; }              /* accent inverts — matches your DS */
      .logo-light { display:none !important; }
      .logo-dark  { display:block !important; }
    }

    /* R-36 : Outlook.com / Outlook apps mirror of the SAME rules. */
    [data-ogsc] .bg-page,    [data-ogsb] .bg-page    { background-color:#0A0A0A !important; }
    [data-ogsc] .bg-surface, [data-ogsb] .bg-surface { background-color:#1A1A1A !important; }
    [data-ogsc] .txt-strong { color:#F5F5F5 !important; }
    [data-ogsc] .txt-muted  { color:#A3A3A3 !important; }
    [data-ogsc] .btn-bg, [data-ogsb] .btn-bg { background-color:#F5F5F5 !important; }
    [data-ogsc] .btn-fg     { color:#1A1A1A !important; }
  </style>
</head>

<!-- bgcolor attribute AND CSS: R-33. class="body" enables the Gmail `u + .body` selector. -->
<body class="body bg-page" xml:lang="en"
      style="margin:0; padding:0; width:100%; background-color:#F5F5F5;"
      bgcolor="#F5F5F5">

  <!-- R-40 : screen readers announce this as an "email" landmark -->
  <div role="article" aria-roledescription="email"
       aria-label="Your order EFY-HVX2AE is on its way"
       lang="en" dir="ltr"
       style="font-size:medium; font-size:max(16px, 1rem);">      <!-- R-52 -->

    <!-- R-53 : preheader. display:none + mso-hide:all, no colour hack, padded. -->
    <div style="display:none; mso-hide:all; max-height:0; max-width:0; overflow:hidden;">
      Arriving between 2pm and 4pm today&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;<!-- x100 -->
    </div>

    <!-- Outer full-bleed table. R-04: all four attributes. -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           width="100%" class="bg-page" bgcolor="#F5F5F5"
           style="width:100%; background-color:#F5F5F5;">
      <tr>
        <td align="center" style="padding:24px 12px;">

          <!--[if mso]>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center">
          <tr><td>
          <![endif]-->

          <!-- R-07 : width attribute (Word) + width/max-width CSS (everyone else) -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                 width="600" align="center" class="container bg-surface" bgcolor="#FFFFFF"
                 style="width:600px; max-width:600px; background-color:#FFFFFF;">

            <!-- Wordmark as LIVE TEXT (R-30): survives image blocking, inverts perfectly. -->
            <tr>
              <td class="p-24 bg-surface" bgcolor="#FFFFFF" align="left"
                  style="padding:24px; background-color:#FFFFFF;">
                <span class="txt-strong"
                      style="font-family:'General Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                             font-size:22px; line-height:28px; mso-line-height-rule:exactly;
                             font-weight:700; letter-spacing:-0.01em; color:#1A1A1A;">Effy</span>
              </td>
            </tr>

            <!-- Body copy. R-21/R-20/R-22/R-32 all satisfied on every text element. -->
            <tr>
              <td class="p-24 bg-surface" bgcolor="#FFFFFF" align="left"
                  style="padding:0 24px 8px 24px; background-color:#FFFFFF;">
                <h1 class="txt-strong"
                    style="margin:0 0 12px 0;
                           font-family:'General Sans',Helvetica,Arial,sans-serif;
                           font-size:24px; line-height:32px; mso-line-height-rule:exactly;
                           font-weight:600; color:#1A1A1A;">Your order is on its way</h1>
                <p class="txt-muted fs-16"
                   style="margin:0 0 16px 0;
                          font-family:'General Sans',Helvetica,Arial,sans-serif;
                          font-size:16px; line-height:24px; mso-line-height-rule:exactly;
                          color:#595959;">                     <!-- R-35: not mid-tone grey -->
                  Order EFY-HVX2AE will arrive between 2pm and 4pm today.
                </p>
              </td>
            </tr>

            <!-- ===== BULLETPROOF BUTTON =====
                 VML RoundRect for Word-engine Outlook + real <a> for everyone else.
                 48px tall via td padding, not via height (R-47). -->
            <tr>
              <td class="p-24 bg-surface" bgcolor="#FFFFFF" align="left"
                  style="padding:8px 24px 24px 24px; background-color:#FFFFFF;">

                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                             xmlns:w="urn:schemas-microsoft-com:office:word"
                             href="https://effyshopping.com/orders/EFY-HVX2AE"
                             style="height:48px; v-text-anchor:middle; width:220px;"
                             arcsize="17%" stroke="f" fillcolor="#1A1A1A">
                  <w:anchorlock/>
                  <center style="color:#FFFFFF; font-family:Arial,Helvetica,sans-serif;
                                 font-size:16px; font-weight:600;">Track your order</center>
                </v:roundrect>
                <![endif]-->

                <!--[if !mso]><!-->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td class="btn-bg" bgcolor="#1A1A1A" align="center"
                        style="background-color:#1A1A1A; border-radius:8px;">
                      <a class="btn-fg" href="https://effyshopping.com/orders/EFY-HVX2AE"
                         style="display:inline-block; padding:14px 28px;   /* -> 48px+ target */
                                font-family:'General Sans',Helvetica,Arial,sans-serif;
                                font-size:16px; line-height:20px; mso-line-height-rule:exactly;
                                font-weight:600; color:#FFFFFF; text-decoration:none;
                                border-radius:8px; mso-hide:all;">Track your order</a>
                    </td>
                  </tr>
                </table>
                <!--<![endif]-->
              </td>
            </tr>

            <!-- Divider: a bgcolor'd td, NOT a border (Word border support is unreliable) -->
            <tr>
              <td class="rule" bgcolor="#E5E5E5" height="1"
                  style="height:1px; line-height:1px; font-size:1px;
                         background-color:#E5E5E5;">&nbsp;</td>
            </tr>

            <!-- Footer: unsubscribe MUST be inside the first 90KB (R-16) -->
            <tr>
              <td class="p-24 bg-surface" bgcolor="#FFFFFF" align="left"
                  style="padding:24px; background-color:#FFFFFF;">
                <p class="txt-muted"
                   style="margin:0;
                          font-family:'General Sans',Helvetica,Arial,sans-serif;
                          font-size:14px; line-height:21px; mso-line-height-rule:exactly;
                          color:#595959;">                       <!-- R-44: 14px floor -->
                  Questions? <a class="txt-strong" href="mailto:hello@effyshopping.com"
                     style="color:#1A1A1A; text-decoration:underline;">Email us</a>.<br>
                  <a class="txt-muted" href="https://effyshopping.com/unsubscribe?t=…"
                     style="color:#595959; text-decoration:underline;">Unsubscribe from delivery updates</a>
                </p>
              </td>
            </tr>
          </table>

          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
```

**Notes on the button:** `arcsize` is a **percentage of half the shorter side** — `arcsize="17%"` on a 48px-tall button ≈ 8px radius, matching the CSS. `<w:anchorlock/>` makes the whole VML shape the click target. `stroke="f"` removes the default border. `v-text-anchor:middle` vertically centres. `mso-hide:all` on the `<a>` is a second line of defence in case a `mso` version renders both.

---

## 10. Automated verification

### 10.1 What can be linted deterministically

| # | Check | Implementation | Fail condition |
|---|---|---|---|
| L-01 | Total HTML size | `Buffer.byteLength(html)` | warn > 90 KB, **fail > 102 KB** (R-12) |
| L-02 | `<style>` block size | sum of all `<style>` text | fail > 8 KB (R-13) |
| L-03 | `<style>` inside `<body>` | parse | fail if any (R-15) |
| L-04 | Nested `@` rules | CSS AST (PostCSS) | fail if `@font-face`/`@import` inside `@media` (R-14) |
| L-05 | Doctype | first bytes match `<!DOCTYPE html>` | fail otherwise (R-02) |
| L-06 | `lang` + `dir` on `<html>` | attribute presence | fail if missing (R-39) |
| L-07 | Meta block completeness | `charset`, `viewport`, `color-scheme`, `supported-color-schemes`, `x-apple-disable-message-reformatting` | fail on any missing (R-31) |
| L-08 | DPI fix present | grep `PixelsPerInch` + `96` | fail (R-10) |
| L-09 | Conditional-comment balance | count `<!--[if` vs `<![endif]-->` | fail on mismatch (R-08) |
| L-10 | Every layout table has all four attributes | DOM walk on `<table>` | fail (R-04) |
| L-11 | Banned CSS | regex over inline styles + `<style>`: `display:\s*(flex\|grid)`, `float:`, `position:\s*(absolute\|fixed\|sticky)`, `var\(`, `^\s*--`, `@supports`, `clamp\(`, `:has\(` | fail (R-18) |
| L-12 | Every `<img>` has `alt` | DOM | fail (R-24) |
| L-13 | Every `<img>` has `width` attr + `display:block` | DOM | fail (R-25, R-26) |
| L-14 | No `.svg` / no inline `<svg>` | DOM + `src` extension | fail (R-28) |
| L-15 | Every element with `line-height` also has `mso-line-height-rule:exactly` | inline-style parse | fail (R-20) |
| L-16 | Every text element declares `font-family` | DOM walk of text-bearing nodes | fail (R-21) |
| L-17 | Every element with `color` also has `background-color` (and vice versa) on the same element or its `<td>` ancestor | DOM + style parse | fail (R-32) |
| L-18 | Contrast pairs | resolve each text node's effective fg/bg from inline styles, compute WCAG ratio | fail < 4.5:1 (< 3:1 for large) (R-46) |
| L-19 | **Dark-ramp contrast** | run L-18 a second time against the `prefers-color-scheme:dark` overrides, and a third time against the **algorithmically inverted** palette (`255 − v` per channel — valid because your ramp is achromatic, §6.3) | fail < 4.5:1 in any of the three passes |
| L-20 | Mid-tone ban | any grey in `#707070`–`#909090` used for text or a border | fail (R-35) |
| L-21 | CSS-inlining coverage | assert every *visual* declaration in `<style>` also exists inline on its matched elements (i.e. the style block is enhancement-only) | fail (R-17) |
| L-22 | Container width | outer content table `width` attr ∈ [600, 640] and matching `style` | fail (R-07) |
| L-23 | Plain-text part | MIME assembly test: `multipart/alternative` with non-empty `text/plain` containing the unsubscribe URL and no `&#`/`<` | fail (R-54) |
| L-24 | Unsubscribe position | byte offset of the unsubscribe `href` | fail if > 90 KB (R-16) |
| L-25 | Live-text ratio | strip tags → visible char count; assert ≥ 200 and CTA text present | fail (R-55) |
| L-26 | Link health | HEAD each `href`; assert 200, HTTPS, no known shortener domain, no redirect chain | fail |
| L-27 | Tap targets | for each `<a>` with `display:inline-block`, compute `padding-top + line-height + padding-bottom` ≥ 48 | fail (R-47) |
| L-28 | Heading order | `<h1>`…`<h3>` present, no level skipped, exactly one `<h1>` | fail (R-43) |
| L-29 | Link text quality | reject `click here`, `read more`, `here`, bare URLs as link text | fail (R-48) |
| L-30 | **caniemail conformance** | walk every CSS property and HTML element/attribute used; look it up in vendored `data.json`; fail on `n` for any client in your declared target set | fail — **this is the highest-value check in the list** |
| L-31 | Byte-identity of dark/light token blocks | assert both `@media (prefers-color-scheme: dark)` and the `[data-ogsc]` block are generated from the same source and cover the same selector set | fail on drift (R-36) |

### 10.2 Open-source tooling

| Tool | What it is | Use for |
|---|---|---|
| **`caniemail` data** — `caniemail.com/api/data.json`; npm `caniemail` (useparcel/avigoldman mirror); source `github.com/hteumeuleu/caniemail` (`_features/*.md` front-matter) | The machine-readable support matrix | **L-30.** Vendor it, pin `last_update_date`, diff on update |
| **MJML** — `mjml`, `mjml-cli`, `mjml-validate` (bundled `mjml --validate`, `mjml-core` `validationLevel: 'strict'`) | Compiler + validator. `mj-body` default width **600px**. Emits ghost tables + conditionals for you | Authoring; strict validation is a real lint gate |
| **Maizzle** — `@maizzle/framework` | Tailwind → email. Built-in transformers: **inline CSS**, **remove unused CSS**, **prevent widows**, **six-digit hex**, **add attributes** (auto-injects `role="presentation"`, `cellpadding=0` etc.), **URL prefixing**, **minify**, **base-URL**, **`safe` class-name transform** | Best fit for a token-driven design system — your ramp becomes a Tailwind config, and inlining is a build step, not a manual chore |
| **`email-comb`** (Codsen) — npm `email-comb`; pure ESM (use `5.3.1` for CJS); also `gulp-email-remove-unused-css` | Removes unused CSS from email HTML; understands email hack styles; supports a whitelist so `[data-ogsc]`, `u + .body`, `.gmail-blend-*` are not stripped | **Direct answer to L-01/L-02.** ⚠ Whitelist your dark-mode and Gmail selectors or it will delete them |
| **HEML** — `heml` | Semantic-tag → email compiler | Alternative to MJML; smaller ecosystem, less active |
| **Cerberus** — `cerberusemail.com` | Three hand-written responsive patterns (fluid, responsive, hybrid) | Reference implementation for ghost tables and MSO conditionals |
| **`juice`** / **`inline-css`** | CSS inliners | L-21 |
| **PostCSS** + `postcss-safe-parser` | CSS AST | L-04, L-11, L-18 |
| **`parse5`** / `cheerio` / `jsdom` | HTML AST | L-03, L-10, L-12–17, L-27–29 |
| **`wcag-contrast`** / `color` npm | Ratio math | L-18, L-19 |
| **`html-validate`** / `HTMLHint` | Generic HTML lint with custom rules | L-05–L-10 scaffolding |
| **`mailparser`** / `nodemailer` `buildMessage()` | MIME assembly | L-23 |
| **`axe-core`** | Generic a11y | ⚠ Partially applicable — many rules assume a browser document. Use for headings/alt/lang only |
| **Litmus / Email on Acid** (commercial) | Real-client screenshot rendering + Litmus Accessibility Checker (40+ checks, colour-blindness filters, NVDA integration) | ⚠ **Nothing open-source substitutes for real-client screenshots.** Budget for one of these, or a manual device matrix |
| **`buttons.cm`**, **`backgrounds.cm`** (Campaign Monitor) | VML generators | One-time codegen; don't hand-write VML |
| **`howtotarget.email`** | Client-targeting selector cookbook (`u + .body` etc.) | Dark-mode hacks |
| **`github.com/hteumeuleu/email-bugs`** | Issue tracker of live client bugs | Regression watchlist |

### 10.3 What cannot be linted

Be explicit in the spec that these require a human or a rendering service:
- Partial-inversion breakage (§6.3 hazard 1) — needs real Outlook.com / Gmail Android screenshots.
- Whether alt text actually reads well with images off.
- Whether the 600px layout looks right at Outlook's 120 DPI.
- Whether the web font's absence changes line wrapping in Arial.
- Whether the GIF's frame 1 stands alone.
- Whether the email is *comprehensible* — reading level, not just contrast.

---

## Appendix: the disagreements, restated

1. **Doctype.** Campaign Monitor (2017) says XHTML 1.0 Transitional; Good Email Code / Cerberus / MJML / Maizzle (2024–2026) say HTML5. **Recommendation: HTML5.** The clients that would benefit from XHTML ignore or rewrite the doctype anyway.
2. **Gmail `<style>` cap.** caniemail note #6 says **16 KB**; Freshinbox/Email on Acid say **8192 characters**. Lint at 8 KB.
3. **Apple Mail dark mode.** Litmus groups it "no colour change"; Enchant/Mailmodo/Uplers describe "partial inversion." Reconciliation: it leaves declared-`color-scheme` emails alone. Declare the meta tags and the question is moot.
4. **Gmail `prefers-color-scheme`.** A caniemail *page render* claimed support; the raw front-matter says **`n` on all four Gmail platforms**. **The raw data is correct.**
5. **`@font-face` in Gmail/Outlook.com.** Same failure mode — a rendered summary said supported; raw front-matter says `n`. Always read `_features/*.md`.
6. **Thunderbird `@font-face`.** Rendered summary said "Not supported"; raw front-matter says **macOS 60.7–78.5 = `y`**. Raw wins.
7. **⚠ "Outlook truncates HTML at 1.5 MB."** **I could not verify this anywhere.** What exists: a Q&A report of truncation ~500 KB; `MaxEmailHTMLBodyTruncationSize` (an admin-configurable ActiveSync server setting, not a client constant); a 32 KB limit on saved *templates* in new Outlook/OWA. **Do not state 1.5 MB as fact in the spec** — express it as a size budget instead.
8. **"2026 is the last year of the Word engine."** Wrong. Microsoft delayed the enterprise opt-out phase to **March 2027** (announced February 2026) and supports classic Outlook **until at least 2029**.
9. **Gmail mobile clipping at 20 KB / 75 KB.** Single secondary source. Treat as unverified.
10. **iOS Mail 5,000px truncation.** Multiple secondary sources, no first-party Apple documentation. Design under it anyway; don't cite it as a hard spec.

---

## Sources

- [Litmus — Email Client Market Share (May 2026)](https://www.litmus.com/email-client-market-share)
- [Can I email… (home)](https://www.caniemail.com/) · [clients tested](https://www.caniemail.com/clients/) · [API data.json](https://www.caniemail.com/api/data.json) · [hteumeuleu/caniemail on GitHub](https://github.com/hteumeuleu/caniemail)
- caniemail raw feature data: [`css-at-font-face.md`](https://raw.githubusercontent.com/hteumeuleu/caniemail/main/_features/css-at-font-face.md) · [`css-variables.md`](https://raw.githubusercontent.com/hteumeuleu/caniemail/main/_features/css-variables.md) · [`html-style.md`](https://raw.githubusercontent.com/hteumeuleu/caniemail/main/_features/html-style.md) · [`css-max-width.md`](https://raw.githubusercontent.com/hteumeuleu/caniemail/main/_features/css-max-width.md) · [`css-border-radius.md`](https://raw.githubusercontent.com/hteumeuleu/caniemail/main/_features/css-border-radius.md) · [`css-at-media-prefers-color-scheme.md`](https://raw.githubusercontent.com/hteumeuleu/caniemail/main/_features/css-at-media-prefers-color-scheme.md)
- [Can I email… doctype](https://www.caniemail.com/features/html-doctype/) · [SVG image format](https://www.caniemail.com/features/image-svg/) · [Embedded `<svg>`](https://www.caniemail.com/features/html-svg/)
- [Good Email Code — accessible template](https://www.goodemailcode.com/email-code/template.html) · [preview text](https://www.goodemailcode.com/email-code/preheader.html) · [columns](https://www.goodemailcode.com/email-code/columns.html)
- [Cerberus — Outlook conditional CSS & ghost tables](https://www.cerberusemail.com/outlook)
- [HTeuMeuLeu — Fixing Gmail's Dark Mode issues with CSS Blend Modes](https://www.hteumeuleu.com/2021/fixing-gmail-dark-mode-css-blend-modes/) · [email-bugs #41: Gmail clips at 102 kB](https://github.com/hteumeuleu/email-bugs/issues/41)
- [Litmus — Ultimate Guide to Dark Mode](https://www.litmus.com/blog/the-ultimate-guide-to-dark-mode-for-email-marketers) · [Ultimate Guide to Email Accessibility (2026)](https://www.litmus.com/blog/ultimate-guide-accessible-emails) · [Bulletproof buttons](https://www.litmus.com/blog/a-guide-to-bulletproof-buttons-in-email-design) · [Retina images](https://www.litmus.com/blog/understanding-retina-images-in-html-email) · [Animated GIFs](https://www.litmus.com/blog/a-guide-to-animated-gifs-in-email) · [Email image blocking](https://www.litmus.com/blog/the-ultimate-guide-to-email-image-blocking)
- [Email on Acid — DPI scaling in Outlook](https://www.emailonacid.com/blog/article/email-development/dpi-scaling-in-outlook-2007-2013/) · [Coding email preheaders](https://www.emailonacid.com/blog/article/email-development/tips-for-coding-email-preheaders/) · [Gmail email clipping](https://www.emailonacid.com/blog/article/email-development/gmail-email-clipping/) · [Ghost columns](https://www.emailonacid.com/blog/article/email-development/using-ghost-columns-to-fix-alignment-problems-in-outlook/) · [GIFs and Outlook](https://www.emailonacid.com/blog/article/email-development/gifs-and-outlook-what-can-we-do/) · [Conditional CSS](https://www.emailonacid.com/blog/article/email-development/conditional-css-code/)
- [Badsender — Outlook email display problems (Apr 2024)](https://www.badsender.com/en/2024/04/16/outlook-email-display-problems/) · [HTML email file weight limit (Sep 2024)](https://www.badsender.com/en/2024/09/13/html-email-file-weight-limit/) · [What width for an email?](https://www.badsender.com/en/2020/02/05/what-width-for-an-email/)
- [Freshinbox — "Fake" background image technique for GANGA](https://freshinbox.com/blog/fake-background-image-technique-for-gmail-app-for-non-google-accounts-ganga/) · [Gmail stripping background-image CSS](https://freshinbox.com/blog/gmail-rolling-out-changes-that-strip-background-image-css/)
- [Campaign Monitor — CSS support guide (last updated Nov 2017)](https://www.campaignmonitor.com/css/) · [backgrounds.cm](https://backgrounds.cm/) · [Which doctype in HTML email](https://www.campaignmonitor.com/blog/email-marketing/correct-doctype-to-use-in-html-email/)
- [MJML documentation](https://documentation.mjml.io/) · [mjml#2513 — iOS Gmail dark mode blend modes](https://github.com/mjmlio/mjml/issues/2513)
- [email-comb (Codsen) on npm](https://www.npmjs.com/package/email-comb) · [source](https://github.com/codsen/codsen/tree/main/packages/email-comb) · [docs](https://codsen.com/os/email-comb)
- [Beefree — bulletproof background images in Outlook (VML)](https://developers.beefree.io/blog/dev-guide-to-perfect-bulletproof-background-images-in-outlook-the-vml-trick-simplified)
- [Tabular — mso-line-height-rule: exactly](https://tabular.email/blog/mso-line-height-rule-exactly-explained) · [Better Email — MSO attributes](https://learn.better.email/blog/mso-attributes-in-outlook-emails)
- [DailyStory — HTML email clipping limits by provider](https://www.dailystory.com/blog/html-email-clipping-limits-across-different-mailbox-providers/) · [Mailchimp — Gmail is clipping my email](https://mailchimp.com/help/gmail-is-clipping-my-email/)
- [Buttondown — Can I use SVG images in emails?](https://buttondown.com/blog/can-i-email-svg) · [CSS-Tricks — Guide to SVG support in email](https://css-tricks.com/a-guide-on-svg-support-in-email/)
- [Microsoft — Dark mode in Outlook](https://support.microsoft.com/en-us/outlook/mail/dark-mode-in-outlook) · [Q&A: preventing Outlook dark-mode colour override](https://learn.microsoft.com/en-us/answers/questions/4756669/how-can-i-prevent-outlook-from-overriding-backgrou) · [MaxEmailHTMLBodyTruncationSize](https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-asprov/4bd86373-eec0-4aba-bb7b-c2611fa30c92) · [Q&A: when will classic Outlook end](https://learn.microsoft.com/en-us/answers/questions/5554339/when-will-classic-outlook-end)
- [TechRepublic — Microsoft extends classic Outlook retirement deadline](https://www.techrepublic.com/article/news-microsoft-extends-classic-outlook-retirement-deadline/) · [Directions on Microsoft — new Outlook rollout delayed a year](https://www.directionsonmicrosoft.com/microsoft-delays-by-a-year-its-new-outlook-rollout/)
- [Gmail — Email sender guidelines FAQ](https://support.google.com/a/answer/14229414?hl=en) · [dmarcian — Gmail & Yahoo DMARC requirements](https://dmarcian.com/yahoo-and-google-dmarc-required/) · [Mailgun — Yahoogle bulk sender requirements](https://www.mailgun.com/state-of-email-deliverability/chapter/yahoogle-bulk-senders/)
- [Suped — image-to-text ratio and deliverability](https://www.suped.com/knowledge/email-deliverability/content/does-a-high-image-to-text-ratio-affect-email-deliverability-and-spam-filtering) · [Mailflow Authority — image-to-text ratio: what the data shows](https://mailflowauthority.com/email-content/image-to-text-ratio)
- [Lea Verou — inverted lightness variables](https://lea.verou.me/blog/2021/03/inverted-lightness-variables/) · [Contrast-preserving colour inversion](https://jordan.yoonbuck.com/post/contrast-preserving-inversion/)
- [Office Watch — New Outlook's blocked images problem (2025)](https://office-watch.com/2025/new-outlooks-blocked-images-problem/)
- [Uplers — optimising emails for Apple Mail dark mode](https://email.uplers.com/blog/optimize-email-dark-mode/) · [Kontent.ai — rounded buttons with shadow that work in Outlook (2025)](https://kontent.ai/blog/emails-rounded-buttons-with-shadow-outlook/)