// Builds src/generated/theme.mjml — the head fragment EVERY template includes.
//
// ⚠ Three things are emitted here from ONE token map, so they cannot drift (spec FR-025):
//   1. the light palette, which MJML then writes INLINE onto every element,
//   2. the `@media (prefers-color-scheme: dark)` restatement, and
//   3. the `[data-ogsc]` / `[data-ogsb]` mirror of the same rules, for Outlook.com and the
//      Outlook apps, which stash the original value in an attribute and overwrite the live style.
//
// ⚠ (2) and (3) are STYLESHEET-DEPENDENT and therefore dead in the Gmail app configured with a
// non-Google address, and dead in the Word engine. That is acceptable ONLY because the inline light
// palette is a complete, correct design on its own — which is what `email-check`'s inline-only rule
// enforces, and what the third contrast pass proves survives forced inversion.

import { TYPE, LAYOUT } from "./tokens.mjs";

/**
 * The dark-mode class set. ⚠ ONE definition, consumed by BOTH dark mechanisms below — a class that
 * appears in the media query but not the attribute mirror (or vice versa) is a drift bug that shows
 * up only in Outlook.com, which is exactly where nobody looks.
 */
const DARK_RULES = [
  { cls: "e-bg-page", prop: "background-color", role: "pageGround" },
  { cls: "e-bg-canvas", prop: "background-color", role: "canvas" },
  { cls: "e-bg-code", prop: "background-color", role: "codeSurface" },
  { cls: "e-ink", prop: "color", role: "ink" },
  { cls: "e-muted", prop: "color", role: "mutedInk" },
  // ⚠ border-top-color, not background-color: MJML draws the hairline as a <p> border.
  { cls: "e-rule", prop: "border-top-color", role: "hairline" },
  { cls: "e-btn-bg", prop: "background-color", role: "actionFill" },
  { cls: "e-btn-fg", prop: "color", role: "actionLabel" },
  { cls: "e-error", prop: "color", role: "error" },
];

/**
 * ⚠ THE SELECTOR MUST REACH THE ELEMENT THAT ACTUALLY CARRIES THE INLINE STYLE, NOT THE ONE THE
 * CLASS LANDS ON. This was a live defect, found by reading the compiled output rather than by
 * reasoning about it:
 *
 *   MJML puts `css-class` on the <td>, but writes `color` on an inner <div>, and the divider's
 *   `border-top` on an inner <p>. A rule like `.e-muted { color: … !important }` therefore targets
 *   the td, loses to the div's own inline colour, and the dark restatement silently does nothing.
 *   Every text colour in dark mode would have stayed light-mode grey — visible only in a real
 *   dark-mode client, which is exactly where nobody looks.
 *
 * So colour rules are emitted with descendants, and the divider is targeted at its <p>.
 */
function targetsFor(cls, prop) {
  if (prop === "color") {
    // The td itself plus every element MJML may put the inline colour on.
    return [`.${cls}`, `.${cls} div`, `.${cls} p`, `.${cls} span`, `.${cls} a`, `.${cls} h1`];
  }
  if (prop === "border-top-color") {
    return [`.${cls} p`];
  }
  // ⚠ THE BUTTON FILL IS A NESTED CELL. MJML puts css-class on the button's OUTER padding <td>, but
  // the fill (`background:#1a1a1a`) is on an INNER <td>. Targeting `.e-btn-bg` alone would recolour
  // the transparent padding cell and leave the fill dark — so in dark mode the button would be a
  // dark fill under a dark-inverted label (invisible), and on a dark canvas it would blend in
  // entirely. Reaching `.e-btn-bg td` inverts the actual fill. Found by reading the compiled output,
  // the same way the text-colour nesting defect was.
  if (cls === "e-btn-bg") {
    return [`.${cls} td`];
  }
  return [`.${cls}`];
}

/** Outlook.com/Outlook apps stash the original in an attribute; -sc for colour, -sb for background. */
function ogscSelectors(cls, prop) {
  const hooks = prop === "background-color" ? ["[data-ogsc]", "[data-ogsb]"] : ["[data-ogsc]"];
  return hooks.flatMap((h) => targetsFor(cls, prop).map((t) => `${h} ${t}`)).join(",\n    ");
}

function typeAttrs(t, color) {
  return [
    `font-size="${t.size}px"`,
    `line-height="${t.line}px"`,
    `font-weight="${t.weight}"`,
    t.letterSpacing ? `letter-spacing="${t.letterSpacing}"` : "",
    color ? `color="${color}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildThemeMjml(tokens) {
  const L = tokens.light;
  const D = tokens.dark;

  const darkBlock = DARK_RULES.map(
    (r) => `      ${targetsFor(r.cls, r.prop).join(",\n      ")} { ${r.prop}: ${D[r.role]} !important; }`,
  ).join("\n");
  const ogscBlock = DARK_RULES.map(
    (r) => `    ${ogscSelectors(r.cls, r.prop)} { ${r.prop}: ${D[r.role]} !important; }`,
  ).join("\n");

  // ⚠ THE EMITTED theme.mjml CONTAINS NO LOOSE HTML COMMENTS (`<!-- -->`) IN mj-head.
  //
  // Under `keepComments: false` (which we require — it is what stops internal notes and the Google
  // Fonts import from shipping), MJML strips a head-level HTML comment AND, when that comment sits
  // between two `<mj-raw>` blocks, drops the raw block that follows it — silently deleting the
  // color-scheme meta tags and the MSO Times-New-Roman override. A guard catches the loss, but the
  // durable fix is to keep ALL rationale here, in the GENERATOR'S JavaScript comments, which never
  // reach the output. CSS `/* */` comments inside <mj-style> are fine and are used sparingly.
  //
  // mj-attributes below: every text-bearing element declares its own font stack (nothing inherits —
  // the Word engine gives unstyled elements defaults nobody wants), and each building block is an
  // mj-class recipe so a template selects one and never writes a size or colour of its own (FR-016).
  //
  // ⚠ THE FINAL mj-raw IS THE TIMES-NEW-ROMAN OVERRIDE. If the first family in a stack is one the
  // Word engine lacks, it does NOT walk the rest — it falls back to Times New Roman. 'General Sans'
  // is unknown to it, so the `[if mso]` block forces Arial on every element. No @font-face ships at
  // all (General Sans is self-hosted in the web bundles with no stable public URL), so the design is
  // built to be correct in Arial — which ~three-quarters of opens see regardless.
  return `<mj-attributes>
  <mj-all font-family="${TYPE.stack}" />

  <mj-text ${typeAttrs(TYPE.body, L.ink)} padding="0" align="left" css-class="e-ink" />
  <mj-section background-color="${L.canvas}" css-class="e-bg-canvas" padding="0" />
  <mj-column padding="0" />
  <mj-button background-color="${L.actionFill}" color="${L.actionLabel}" border-radius="${tokens.radiusSm}"
             ${typeAttrs(TYPE.button)} inner-padding="14px 28px" align="left" css-class="e-btn-bg" />
  <mj-divider border-width="1px" border-style="solid" border-color="${L.hairline}" padding="0" css-class="e-rule" />

  <mj-class name="wordmark" ${typeAttrs(TYPE.wordmark, L.ink)} />
  <mj-class name="h1" ${typeAttrs(TYPE.h1, L.ink)} />
  <mj-class name="body" ${typeAttrs(TYPE.body, L.ink)} />
  <mj-class name="muted" ${typeAttrs(TYPE.body, L.mutedInk)} />
  <mj-class name="small" ${typeAttrs(TYPE.small, L.mutedInk)} />
  <mj-class name="footer" ${typeAttrs(TYPE.footer, L.mutedInk)} />
  <mj-class name="code" ${typeAttrs(TYPE.code, L.ink)} />
</mj-attributes>

<mj-style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }

  /* ⚠ Apple's data detectors re-colour phone numbers, dates and addresses in their own blue —
     a third hue the constitution forbids. This is the only way to refuse it. */
  a[x-apple-data-detectors] {
    color: inherit !important; text-decoration: none !important; font-size: inherit !important;
    font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important;
  }

  /* Dark, mechanism 1 of 2: prefers-color-scheme (Apple Mail, Outlook.com, Outlook mobile, Samsung;
     NOT Gmail). No custom mobile media query — MJML stacks columns itself and body copy is 16px. */
  @media (prefers-color-scheme: dark) {
${darkBlock}
  }
</mj-style>

<mj-style>
  /* Dark, mechanism 2 of 2 — the SAME rules as the media query above, for Outlook.com and the
     Outlook apps, which do not honour prefers-color-scheme. Both blocks come from one source
     (DARK_RULES) so they cannot drift. */
${ogscBlock}
</mj-style>

<mj-raw>
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
</mj-raw>

<mj-raw>
  <!--[if mso]>
  <style type="text/css">
    * { font-family: Arial, Helvetica, sans-serif !important; }
    table, td, h1, h2, h3, p, a, span, div { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</mj-raw>
`;
}

export { DARK_RULES };
