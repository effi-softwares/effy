// Builds src/generated/theme.mjml, the head fragment every template includes. One token map produces
// the light palette (inlined by MJML), the `prefers-color-scheme: dark` restatement, and the
// `[data-ogsc]` / `[data-ogsb]` mirror for Outlook. The inline light palette must be correct on its own:
// the dark mechanisms are stylesheet-dependent and absent in some clients.

import { TYPE, LAYOUT } from "./tokens.mjs";

/** The dark-mode class set, used by both dark mechanisms so they cannot drift. */
const DARK_RULES = [
  { cls: "e-bg-page", prop: "background-color", role: "pageGround" },
  { cls: "e-bg-canvas", prop: "background-color", role: "canvas" },
  { cls: "e-bg-code", prop: "background-color", role: "codeSurface" },
  { cls: "e-ink", prop: "color", role: "ink" },
  { cls: "e-muted", prop: "color", role: "mutedInk" },
  // border-top-color: MJML draws the hairline as a <p> border.
  { cls: "e-rule", prop: "border-top-color", role: "hairline" },
  { cls: "e-btn-bg", prop: "background-color", role: "actionFill" },
  { cls: "e-btn-fg", prop: "color", role: "actionLabel" },
  { cls: "e-error", prop: "color", role: "error" },
];

/**
 * Selectors must reach the element carrying the inline style: MJML puts `css-class` on the <td> but
 * writes `color` on an inner <div> and the divider's border on an inner <p>.
 */
function targetsFor(cls, prop) {
  if (prop === "color") {
    // The td itself plus every element MJML may put the inline colour on.
    return [`.${cls}`, `.${cls} div`, `.${cls} p`, `.${cls} span`, `.${cls} a`, `.${cls} h1`];
  }
  if (prop === "border-top-color") {
    return [`.${cls} p`];
  }
  // The button fill is on an inner <td>; `.e-btn-bg td` inverts the fill, not the padding cell.
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

  // theme.mjml has no loose HTML comments in mj-head: under `keepComments: false` MJML strips them and
  // can drop the mj-raw block that follows. Rationale lives here instead.
  //
  // Every text element declares its own font stack, and each building block is an mj-class recipe, so
  // a template never writes a size or colour. The final mj-raw forces Arial for the Word engine, which
  // falls back to Times New Roman when the first family is unknown; no @font-face ships.
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
