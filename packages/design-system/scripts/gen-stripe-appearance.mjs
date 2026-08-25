// GENERATOR — parses src/tokens.css and emits the payment provider's Appearance objects for BOTH
// customer surfaces (051 T015/T016).
//
// ⚠ WHY THIS IS GENERATED AND NOT HAND-WRITTEN. The payment step is the one screen where a third
// party draws pixels inside ours. Transcribing the palette into a provider config by hand would create
// a second copy of the brand that nothing checks — so the day someone edits tokens.css, the card
// fields keep the old colours and no test notices. Generating it means a token change reaches the
// payment form with no hand edit, which is Principle II and the rule 038 applied to email.
//
// Zero dependencies, stdlib only — same policy as gen-compose-theme.mjs: the generator must never
// become load-bearing in a build graph.
//
// ⚠ CHART TOKENS ARE DELIBERATELY NOT EMITTED. Constitution v1.13.0 bounds --chart-1..5 to
// data-visualisation and forbids them as a UI accent; a payment form is UI.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CSS = resolve(here, "../src/tokens.css");

const WEB_OUT = resolve(here, "../stripe/appearance.ts");
// ⚠ ANDROID-ONLY OUTPUT, and it must stay out of ../compose/.
//
// `packages/design-system/compose/` is srcDir'd into the KMP module's commonMain, which is
// deliberately Stripe-free (AndroidPaymentDriver: "the Stripe dependency lives in the app module,
// not `shared`") and must compile for iOS. A file importing com.stripe.android.paymentsheet there
// would break the iOS build. This directory is srcDir'd into androidApp ONLY.
const KT_OUT = resolve(here, "../compose-payment-android/EffyPaymentAppearance.kt");
const KT_PKG = "com.effyshopping.customer.mobile.payment";

// The tokens the provider's Appearance API actually consumes. Anything not listed here has no slot to
// go in — adding a token to tokens.css does NOT silently change the payment form.
const NEEDED = [
  "background", "foreground", "card", "muted", "muted-foreground",
  "primary", "primary-foreground", "border", "input", "ring",
  "destructive", "placeholder",
];

function parseBlock(css, selector) {
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m");
  const body = css.match(re);
  if (!body) throw new Error(`gen-stripe-appearance: no '${selector}' block in tokens.css`);
  const out = {};
  for (const line of body[1].split("\n")) {
    const m = line.match(/^\s*--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
    if (m) out[m[1]] = m[2].toLowerCase();
  }
  for (const key of NEEDED) {
    if (!(key in out)) throw new Error(`gen-stripe-appearance: missing --${key} in ${selector}`);
  }
  return out;
}

function radiusPx(css, name) {
  const m = css.match(new RegExp(`${name}\\s*:\\s*([\\d.]+)rem`));
  if (!m) throw new Error(`gen-stripe-appearance: no ${name} in tokens.css`);
  return Math.round(parseFloat(m[1]) * 16);
}

const css = readFileSync(CSS, "utf8");
const light = parseBlock(css, ":root");
const dark = parseBlock(css, ".dark");
const radiusMd = radiusPx(css, "--radius-md");

// The one place the mapping from Effy's vocabulary to the provider's lives.
//
// ⚠ `colorPrimary` is the ACCENT, and on this platform the accent INVERTS between appearances — it is
// near-black on light and near-white on dark. A single value would be invisible in one mode
// (constitution Principle V), which is why light and dark are generated separately rather than one
// palette with a tweak.
const variables = (t) => ({
  colorPrimary: t.primary,
  colorBackground: t.card,
  colorText: t.foreground,
  colorTextSecondary: t["muted-foreground"],
  colorTextPlaceholder: t.placeholder,
  colorDanger: t.destructive,
  colorIcon: t["muted-foreground"],
  // ⚠ Effy's fields are PILLS (border-radius 9999px on every input across the platform). The provider
  // clamps its own radius, so `borderRadius` carries the panel radius and the pill is applied per-rule
  // below — a single `borderRadius: 9999px` here would round the tabs and panels too.
  borderRadius: `${radiusMd}px`,
  fontFamily: '"General Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSizeBase: "16px",
  spacingUnit: "4px",
});

// ⚠ NO FOCUS HALO — deliberately, and it must not be reintroduced. `packages/design-system/src/ui/
// input.tsx` records the decision: the platform's focus indicator is the BORDER changing to --ring
// (over WCAG 1.4.11's 3:1 in both appearances), never a soft glow outside the field. The provider's
// default is a halo, so every rule below overrides it explicitly.
const rules = (t) => ({
  ".Input": {
    border: `1px solid ${t.input}`,
    borderRadius: "9999px",
    padding: "10px 16px",
    boxShadow: "none",
  },
  ".Input:focus": { border: `1px solid ${t.ring}`, boxShadow: "none", outline: "none" },
  ".Input--invalid": { border: `1px solid ${t.destructive}`, boxShadow: "none" },
  ".Label": { fontWeight: "500", fontSize: "13px", color: t.foreground },
  ".Tab, .Block": { border: `1px solid ${t.border}`, borderRadius: `${radiusMd}px`, boxShadow: "none" },
  ".Tab:focus, .Tab--selected": { border: `1px solid ${t.foreground}`, boxShadow: "none", outline: "none" },
  ".Error": { color: t.destructive, fontSize: "13px" },
});

const banner = (tool) =>
  `// GENERATED by packages/design-system/scripts/${tool} — DO NOT EDIT BY HAND.\n` +
  `// Source of truth: packages/design-system/src/tokens.css. Run \`pnpm --filter @effy/design-system tokens:gen\`.\n` +
  `// Guarded by tokens:check — a hand edit here fails the build and names this file.\n`;

// ── Web ───────────────────────────────────────────────────────────────────────────────────────────
const webBody = `${banner("gen-stripe-appearance.mjs")}
/**
 * The payment provider's Appearance, derived from the Effy design tokens (051 FR-029/FR-030).
 *
 * Two appearances, because the platform's accent INVERTS: near-black on light, near-white on dark.
 * Pick with the shopper's live appearance setting and re-create the Elements group when it changes —
 * the provider reads appearance at creation time and does not re-theme in place.
 */
export type StripeAppearance = {
  theme: "stripe";
  variables: Record<string, string>;
  rules: Record<string, Record<string, string>>;
};

export const paymentAppearanceLight: StripeAppearance = {
  theme: "stripe",
  variables: ${JSON.stringify(variables(light), null, 4).replace(/\n/g, "\n  ")},
  rules: ${JSON.stringify(rules(light), null, 4).replace(/\n/g, "\n  ")},
};

export const paymentAppearanceDark: StripeAppearance = {
  theme: "stripe",
  variables: ${JSON.stringify(variables(dark), null, 4).replace(/\n/g, "\n  ")},
  rules: ${JSON.stringify(rules(dark), null, 4).replace(/\n/g, "\n  ")},
};

/** Resolve the appearance for a rendered mode. */
export function paymentAppearance(mode: "light" | "dark"): StripeAppearance {
  return mode === "dark" ? paymentAppearanceDark : paymentAppearanceLight;
}
`;

// ── Mobile ────────────────────────────────────────────────────────────────────────────────────────
const argb = (hex) => `0xFF${hex.slice(1).toUpperCase()}`;
const ktColors = (name, t) => `    private val ${name} = PaymentSheet.Colors(
        primary = Color(${argb(t.primary)}.toInt()),
        surface = Color(${argb(t.card)}.toInt()),
        component = Color(${argb(t.card)}.toInt()),
        componentBorder = Color(${argb(t.input)}.toInt()),
        componentDivider = Color(${argb(t.border)}.toInt()),
        onComponent = Color(${argb(t.foreground)}.toInt()),
        onSurface = Color(${argb(t.foreground)}.toInt()),
        subtitle = Color(${argb(t["muted-foreground"])}.toInt()),
        placeholderText = Color(${argb(t.placeholder)}.toInt()),
        appBarIcon = Color(${argb(t["muted-foreground"])}.toInt()),
        error = Color(${argb(t.destructive)}.toInt()),
    )`;

const ktBody = `${banner("gen-stripe-appearance.mjs")}
package ${KT_PKG}

import androidx.compose.ui.graphics.Color
import com.stripe.android.paymentsheet.PaymentSheet

/**
 * The payment provider's Appearance for the mobile payment element (051 FR-029/FR-030).
 *
 * ⚠ BOTH appearances are supplied. The platform's accent INVERTS between them, so a single palette
 * would be invisible in one mode (constitution Principle V). Omitting [colorsDark] would leave the
 * payment form light inside a dark app.
 *
 * ⚠ [typography] takes an ANDROID FONT RESOURCE id, not a Compose Resource. General Sans lives in
 * androidApp/src/main/res/font/ for exactly this reason — the composeResources copy has no R.font id,
 * and passing nothing here renders the payment form in the SYSTEM font beside Effy's own type, with
 * nothing failing to compile (research R8).
 */
object EffyPaymentAppearance {
${ktColors("Light", light)}

${ktColors("Dark", dark)}

    /**
     * @param generalSansFontResId R.font.general_sans from the host app module. ⚠ REQUIRED, not
     *   nullable, on purpose: a null renders the payment form in the system font beside Effy's own
     *   type and nothing errors, so the type system refuses the mistake instead.
     */
    fun of(generalSansFontResId: Int): PaymentSheet.Appearance = PaymentSheet.Appearance(
        colorsLight = Light,
        colorsDark = Dark,
        shapes = PaymentSheet.Shapes(
            cornerRadiusDp = ${radiusMd}f,
            borderStrokeWidthDp = 1f,
        ),
        // ⚠ Typography is NOT a data class in this SDK — there is no .default.copy(...). Verified
        // against the 23.17.0 bytecode: the constructor is (sizeScaleFactor, fontResId). A .copy()
        // here does not compile, which is the good failure; the bad one would be silently accepting a
        // null fontResId, so the parameter is required rather than defaulted.
        typography = PaymentSheet.Typography(
            sizeScaleFactor = 1.0f,
            fontResId = generalSansFontResId,
        ),
        primaryButton = PaymentSheet.PrimaryButton(
            shape = PaymentSheet.PrimaryButtonShape(
                // Effy's buttons are pills everywhere on the platform.
                cornerRadiusDp = 28f,
            ),
        ),
    )
}
`;

mkdirSync(dirname(WEB_OUT), { recursive: true });
mkdirSync(dirname(KT_OUT), { recursive: true });
writeFileSync(WEB_OUT, webBody);
writeFileSync(KT_OUT, ktBody);
console.log("stripe-appearance:gen: wrote stripe/appearance.ts + compose-payment-android/EffyPaymentAppearance.kt");
