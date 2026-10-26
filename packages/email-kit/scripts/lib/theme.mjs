import { TYPE } from "./tokens.mjs";

const DARK_RULES = [
  { cls: "e-bg-page", prop: "background-color", role: "pageGround" },
  { cls: "e-bg-canvas", prop: "background-color", role: "canvas" },
  { cls: "e-bg-code", prop: "background-color", role: "codeSurface" },
  { cls: "e-ink", prop: "color", role: "ink" },
  { cls: "e-muted", prop: "color", role: "mutedInk" },
  { cls: "e-rule", prop: "border-top-color", role: "hairline" },
  { cls: "e-bg-rule", prop: "background-color", role: "hairline" },
  { cls: "e-btn-bg", prop: "background-color", role: "actionFill" },
  { cls: "e-btn-fg", prop: "color", role: "actionLabel" },
];

function targetsFor({ cls, prop }) {
  if (prop === "color") return ["", " div", " p", " span", " a", " h1"].map((el) => `.${cls}${el}`);
  if (prop === "border-top-color") return [`.${cls} p`];
  if (cls === "e-btn-bg") return [`.${cls} td`];
  return [`.${cls}`];
}

function outlookTargetsFor(rule) {
  const hooks = rule.prop === "background-color" ? ["[data-ogsc]", "[data-ogsb]"] : ["[data-ogsc]"];
  return hooks.flatMap((hook) => targetsFor(rule).map((target) => `${hook} ${target}`));
}

function typeAttrs(type, color) {
  return [
    `font-size="${type.size}px"`,
    `line-height="${type.line}px"`,
    `font-weight="${type.weight}"`,
    type.letterSpacing && `letter-spacing="${type.letterSpacing}"`,
    color && `color="${color}"`,
  ]
    .filter(Boolean)
    .join(" ");
}

function darkRules(tokens, selectorsFor, indent) {
  return DARK_RULES.map(
    (rule) => `${indent}${selectorsFor(rule).join(`,\n${indent}`)} { ${rule.prop}: ${tokens.dark[rule.role]} !important; }`,
  ).join("\n");
}

export function buildThemeMjml(tokens) {
  const L = tokens.light;

  return `<mj-attributes>
  <mj-all font-family="${TYPE.stack}" />
  <mj-body background-color="${L.pageGround}" css-class="e-bg-page" />
  <mj-text ${typeAttrs(TYPE.body, L.ink)} padding="0" align="left" css-class="e-ink" />
  <mj-section background-color="${L.canvas}" css-class="e-bg-canvas" padding="0" />
  <mj-column padding="0" />
  <mj-button background-color="${L.actionFill}" color="${L.actionLabel}" border-radius="${tokens.radiusButton}"
             ${typeAttrs(TYPE.button)} inner-padding="14px 28px" align="left" css-class="e-btn-bg" />
  <mj-divider border-width="1px" border-style="solid" border-color="${L.hairline}" padding="0" css-class="e-rule" />

  <mj-class name="wordmark" ${typeAttrs(TYPE.wordmark, L.ink)} />
  <mj-class name="h1" ${typeAttrs(TYPE.h1, L.ink)} />
  <mj-class name="body" ${typeAttrs(TYPE.body, L.ink)} />
  <mj-class name="muted" ${typeAttrs(TYPE.body, L.mutedInk)} />
  <mj-class name="small" ${typeAttrs(TYPE.small, L.mutedInk)} />
  <mj-class name="code" ${typeAttrs(TYPE.code, L.ink)} container-background-color="${L.codeSurface}" />
</mj-attributes>

<mj-style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }

  a[x-apple-data-detectors] {
    color: inherit !important; text-decoration: none !important; font-size: inherit !important;
    font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important;
  }

  @media (prefers-color-scheme: dark) {
${darkRules(tokens, targetsFor, "      ")}
  }
</mj-style>

<mj-style>
${darkRules(tokens, outlookTargetsFor, "    ")}
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
