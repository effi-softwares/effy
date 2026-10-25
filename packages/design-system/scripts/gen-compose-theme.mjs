// Generates the mobile apps' Compose theme from the CSS tokens: colours, type and shapes from
// src/tokens.css, and the layout scale (EffyRadius/EffySpacing, read by packages/mobile-kit)
// from src/tokens.css. The output is committed; `tokens:check` regenerates it and fails on any
// difference. Node stdlib only.
//
// Every Material 3 slot maps to an authored token through the fixed table below, so no library default
// leaks a second palette into the app.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CONSOLE_CSS = resolve(here, "../src/tokens.css");
const STOREFRONT_CSS = resolve(here, "../src/tokens.css");
// An asset constraint, not a style token, so it lives beside the shared types.
const BANNER_CANVAS = JSON.parse(readFileSync(resolve(here, "../../shared-types/src/banner-canvas.json"), "utf8"));

// One committed copy per KMP app, each in its own package.
const TARGETS = [
  {
    out: resolve(here, "../compose/EffyTokens.kt"),
    pkg: "com.effyshopping.customer.mobile.design",
    sharedOut: resolve(here, "../compose/EffyLayoutTokens.kt"),
    typographyOut: resolve(here, "../compose/EffyTypography.kt"),
    shapeOut: resolve(here, "../compose/EffyStorefrontShape.kt"),
    resPkg: "com.effyshopping.customer.mobile.resources",
  },
  {
    out: resolve(here, "../compose-driver/EffyTokens.kt"),
    pkg: "com.effyshopping.driver.mobile.design",
    sharedOut: resolve(here, "../compose-driver/EffyLayoutTokens.kt"),
    typographyOut: resolve(here, "../compose-driver/EffyTypography.kt"),
    shapeOut: resolve(here, "../compose-driver/EffyStorefrontShape.kt"),
    resPkg: "com.effyshopping.driver.mobile.resources",
  },
];

// The layout vocabulary's package: shared mobile-kit components cannot import an app's own package.
const SHARED_PKG = "com.effyshopping.mobile.design";

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Parse a `:root { … }` or `.dark { … }` block into { cssVarName: "#rrggbb" }. */
function parseBlock(css, selector) {
  // The first top-level `selector { … }`.
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m");
  const body = css.match(re);
  if (!body) throw new Error(`gen-compose-theme: no '${selector}' block in tokens.css`);
  const out = {};
  for (const line of body[1].split("\n")) {
    // --name: #hex; (non-colour values and calc/var are ignored)
    const m = line.match(/^\s*--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
    if (m) out[m[1]] = m[2].toLowerCase();
    // `--scrim` is rgba; carried as "#aarrggbb" (alpha first, as Compose wants).
    const r = line.match(/^\s*--([\w-]+)\s*:\s*rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)\s*;/);
    if (r) {
      const hex = (n) => Number(n).toString(16).padStart(2, "0");
      out[r[1]] = `#${hex(Math.round(Number(r[5]) * 255))}${hex(r[2])}${hex(r[3])}${hex(r[4])}`;
    }
  }
  return out;
}

/** "#0fb57e" -> "0xFF0FB57E" (opaque argb for Compose Color). */
const argb = (hex) => (hex.length === 9 ? `0x${hex.slice(1).toUpperCase()}` : `0xFF${hex.slice(1).toUpperCase()}`);

// The tokens surfaced to Compose, in a stable order: camelCase Kotlin name -> CSS var name.
const COLOR_TOKENS = [
  ["background", "background"],
  ["foreground", "foreground"],
  ["card", "card"],
  ["cardForeground", "card-foreground"],
  ["popover", "popover"],
  ["popoverForeground", "popover-foreground"],
  ["primary", "primary"],
  ["primaryForeground", "primary-foreground"],
  ["secondary", "secondary"],
  ["secondaryForeground", "secondary-foreground"],
  ["muted", "muted"],
  ["mutedForeground", "muted-foreground"],
  ["accent", "accent"],
  ["accentForeground", "accent-foreground"],
  ["destructive", "destructive"],
  ["destructiveForeground", "destructive-foreground"],
  // No Material 3 slot maps to these; screens read them from EffyColor.
  ["success", "success"],
  ["disabled", "disabled"],
  ["disabledForeground", "disabled-foreground"],
  ["placeholder", "placeholder"],
  ["border", "border"],
  ["input", "input"],
  ["ring", "ring"],
  ["primaryMuted", "primary-muted"], // the light-blue search field, selection, info
  ["brand", "brand"], // Effy green: Sale, savings, "Delivered by Effy", paid. Never an action.
  ["brandForeground", "brand-foreground"],
  ["brandMuted", "brand-muted"],
  ["scrim", "scrim"], // sheet backdrop, with its alpha
];

// Console names the app's code reads that the storefront file calls differently.
const ALIASES = {
  success: "brand", // "paid", "delivered", savings are said in Effy green
  disabled: "muted",
  "disabled-foreground": "muted-foreground",
  placeholder: "muted-foreground",
};

// Authored token -> Material 3 ColorScheme slot. Reuse is deliberate: Material components get a
// complete scheme from the CSS rather than library defaults.
const M3_MAP = [
  ["primary", "primary"],
  ["primaryForeground", "onPrimary"],
  ["primaryMuted", "primaryContainer"],
  ["primary", "onPrimaryContainer"],
  ["primary", "inversePrimary"],
  ["secondary", "secondary"],
  ["secondaryForeground", "onSecondary"],
  ["secondary", "secondaryContainer"],
  ["secondaryForeground", "onSecondaryContainer"],
  ["accent", "tertiary"],
  ["accentForeground", "onTertiary"],
  ["accent", "tertiaryContainer"],
  ["accentForeground", "onTertiaryContainer"],
  ["background", "background"],
  ["foreground", "onBackground"],
  ["card", "surface"],
  ["cardForeground", "onSurface"],
  ["muted", "surfaceVariant"],
  ["mutedForeground", "onSurfaceVariant"],
  ["primary", "surfaceTint"],
  ["foreground", "inverseSurface"],
  ["background", "inverseOnSurface"],
  ["destructive", "error"],
  ["destructiveForeground", "onError"],
  ["destructive", "errorContainer"],
  ["destructiveForeground", "onErrorContainer"],
  ["border", "outline"],
  ["border", "outlineVariant"],
  ["scrim", "scrim"],
  ["card", "surfaceBright"],
  ["background", "surfaceDim"],
  ["card", "surfaceContainer"],
  ["popover", "surfaceContainerHigh"],
  ["popover", "surfaceContainerHighest"],
  ["background", "surfaceContainerLow"],
  ["background", "surfaceContainerLowest"],
  ["primary", "primaryFixed"],
  ["ring", "primaryFixedDim"],
  ["primaryForeground", "onPrimaryFixed"],
  ["primaryForeground", "onPrimaryFixedVariant"],
  ["secondary", "secondaryFixed"],
  ["muted", "secondaryFixedDim"],
  ["secondaryForeground", "onSecondaryFixed"],
  ["secondaryForeground", "onSecondaryFixedVariant"],
  ["accent", "tertiaryFixed"],
  ["muted", "tertiaryFixedDim"],
  ["accentForeground", "onTertiaryFixed"],
  ["accentForeground", "onTertiaryFixedVariant"],
];

function colorObject(name, tokens) {
  const lines = COLOR_TOKENS.map(([k, css]) => {
    const source = css in tokens ? css : ALIASES[css];
    if (!source || !(source in tokens)) throw new Error(`gen-compose-theme: missing --${css} in ${name}`);
    return `        val ${k} = Color(${argb(tokens[source])})`;
  });
  return `    object ${name} {\n${lines.join("\n")}\n    }`;
}

function colorScheme(fnName, valName, objName) {
  const args = M3_MAP.map(([tok, slot]) => `    ${slot} = EffyColor.${objName}.${tok},`);
  return `val ${valName}: ColorScheme = ${fnName}(\n${args.join("\n")}\n)`;
}

const banner = (sourceName) => `// GENERATED FROM packages/design-system/${sourceName} — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen`;

function generate(target) {
  // Comments are stripped first: prose naming a selector would otherwise be matched as the block.
  const css = stripComments(readFileSync(CONSOLE_CSS, "utf8"));
  const colorCss = stripComments(readFileSync(STOREFRONT_CSS, "utf8"));
  const light = parseBlock(colorCss, ":root");
  const dark = parseBlock(colorCss, ".dark");

  // Radii: rem -> dp at the 16px root, so web px == these dp. A pill is RoundedCornerShape(50%).
  const radiusRem = (name) => {
    const m = css.match(new RegExp(`${name}\\s*:\\s*([\\d.]+)rem`));
    if (!m) throw new Error(`gen-compose-theme: no ${name} in tokens.css`);
    return Math.round(parseFloat(m[1]) * 16);
  };
  const radiusDefaultDp = radiusRem("--radius");
  const radiusSmDp = radiusRem("--radius-sm");
  const radiusMdDp = radiusRem("--radius-md");

  const out = `${banner("src/tokens.css")}
package ${target.pkg}

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * The raw Effy storefront tokens, light and dark. Colour is rationed: black, white, zinc, Effy blue
 * (primary, every action) and Effy green (brand: Sale, savings, "Delivered by Effy", paid; never an
 * action). No red: destructive is the text colour.
 */
object EffyColor {
${colorObject("Light", light)}

${colorObject("Dark", dark)}
}

${colorScheme("lightColorScheme", "EffyLightColorScheme", "Light")}

${colorScheme("darkColorScheme", "EffyDarkColorScheme", "Dark")}
`;

  mkdirSync(dirname(target.out), { recursive: true });
  writeFileSync(target.out, out);

  const shared = `${banner("src/tokens.css")}
package ${SHARED_PKG}

import androidx.compose.ui.unit.dp

/** Corner radii (dp) — sm/md pinned to equal the web --radius-sm/md; default = md. Pill via RoundedCornerShape(50%). */
object EffyRadius {
    val sm = ${radiusSmDp}.dp
    val md = ${radiusMdDp}.dp
    val default = ${radiusDefaultDp}.dp
}

/** The Effy spacing scale (dp), mirroring the design tokens (xs 4 · s 8 · md 12 · lg 16 · xl 20 · 4xl 40 → xxxl). */
object EffySpacing {
    val xs = 4.dp
    val s = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 20.dp
    val xxxl = 40.dp
}

/**
 * The promotional banner canvas, from packages/shared-types/src/banner-canvas.json. The render box and
 * conformant artwork share [ratio], so nothing is ever cropped.
 */
object EffyBanner {
    /** The authored canvas, in pixels. Artwork conforms to exactly this. */
    const val widthPx = ${BANNER_CANVAS.width}
    const val heightPx = ${BANNER_CANVAS.height}

    /** Width ÷ height. The render box is locked to this at every window size. */
    const val ratio = ${BANNER_CANVAS.aspectRatio}f

    /** Above this the banner is centred rather than grown. */
    val maxRenderWidth = ${BANNER_CANVAS.maxRenderWidthDp}.dp

    /** Where the live message is drawn over the artwork, as fractions of the canvas: the part an operator leaves quiet. */
    const val textInsetLeft = ${BANNER_CANVAS.textZone.insetLeftPct / 100}f
    const val textInsetBottom = ${BANNER_CANVAS.textZone.insetBottomPct / 100}f
    const val textWidth = ${BANNER_CANVAS.textZone.widthPct / 100}f
    const val textHeight = ${BANNER_CANVAS.textZone.heightPct / 100}f
}
`;
  writeFileSync(target.sharedOut, shared);
  writeFileSync(target.typographyOut, typography(target));
  writeFileSync(target.shapeOut, shape(target, colorCss));

  console.log(`gen-compose-theme: wrote ${target.out} (${COLOR_TOKENS.length} colors) + ${target.sharedOut} (radius sm/md/default ${radiusSmDp}/${radiusMdDp}/${radiusDefaultDp}.dp)`);
}

/**
 * The type scale, bound to Geist. Sizes map the design's steps onto Material 3's slots:
 *  display L/M/S — 36 thank-you · 34 large title (tab roots) · 30 product price
 *  headline L/M/S — 32 auth title · 24 page / arrival · 20 section
 *  title L/M/S — 20 sheet / empty-state title · 17 app-bar title · 16 row title
 *  body — 16 default · 14 secondary · 12 meta
 *  label — 16 buttons · 14 chips · 12 badges / tab labels
 */
function typography(target) {
  return `${banner("src/tokens.css")}
package ${target.pkg}

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import org.jetbrains.compose.resources.Font
import ${target.resPkg}.Res
import ${target.resPkg}.geist_bold
import ${target.resPkg}.geist_medium
import ${target.resPkg}.geist_mono_medium
import ${target.resPkg}.geist_regular
import ${target.resPkg}.geist_semibold

/** Geist, bundled; no run-time download. */
@Composable
fun effyFontFamily(): FontFamily = FontFamily(
    Font(Res.font.geist_regular, FontWeight.Normal),
    Font(Res.font.geist_medium, FontWeight.Medium),
    Font(Res.font.geist_semibold, FontWeight.SemiBold),
    Font(Res.font.geist_bold, FontWeight.Bold),
)

/** Geist Mono — one-time codes and order numbers, read out digit by digit. */
@Composable
fun effyMonoFontFamily(): FontFamily = FontFamily(Font(Res.font.geist_mono_medium, FontWeight.Medium))

/** The Material 3 type scale: all fifteen slots defined, so none falls back to the platform font. */
@Composable
fun effyTypography(): Typography {
    val family = effyFontFamily()
    return Typography(
        displayLarge = effyTextStyle(family, FontWeight.Bold, 36, 40, -0.025f),
        displayMedium = effyTextStyle(family, FontWeight.Bold, 34, 41, -0.025f),
        displaySmall = effyTextStyle(family, FontWeight.Bold, 30, 36, -0.02f),
        headlineLarge = effyTextStyle(family, FontWeight.SemiBold, 32, 36, -0.025f),
        headlineMedium = effyTextStyle(family, FontWeight.SemiBold, 24, 32, -0.025f),
        headlineSmall = effyTextStyle(family, FontWeight.SemiBold, 20, 28, -0.01f),
        titleLarge = effyTextStyle(family, FontWeight.SemiBold, 20, 28, -0.01f),
        titleMedium = effyTextStyle(family, FontWeight.SemiBold, 17, 24, -0.01f),
        titleSmall = effyTextStyle(family, FontWeight.SemiBold, 16, 22),
        bodyLarge = effyTextStyle(family, FontWeight.Normal, 16, 22),
        bodyMedium = effyTextStyle(family, FontWeight.Normal, 14, 20),
        bodySmall = effyTextStyle(family, FontWeight.Normal, 12, 16),
        labelLarge = effyTextStyle(family, FontWeight.Medium, 16, 22),
        labelMedium = effyTextStyle(family, FontWeight.Medium, 14, 20),
        labelSmall = effyTextStyle(family, FontWeight.Medium, 12, 16),
    )
}

private fun effyTextStyle(
    family: FontFamily,
    weight: FontWeight,
    size: Int,
    lineHeight: Int,
    /** Tracking as a fraction of the font size (em). */
    letterSpacingEm: Float = 0f,
) = TextStyle(
    fontFamily = family,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = (size * letterSpacingEm).sp,
)
`;
}

/** The storefront's own corner radii. */
function shape(target, css) {
  const rem = (name) => {
    const m = css.match(new RegExp(`${name}\\s*:\\s*([\\d.]+)rem`));
    if (!m) throw new Error(`gen-compose-theme: no ${name} in tokens.css`);
    return Math.round(parseFloat(m[1]) * 16);
  };
  return `${banner("src/tokens.css")}
package ${target.pkg}

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

/**
 * The storefront corner radii. sm checkboxes · md buttons, fields, chips · lg cards, image wells, sheets'
 * inner groups · xl banners · sheet the top corners of a bottom sheet. Pills are a shape (CircleShape),
 * used only for badges, dots, avatars and switches.
 */
object EffyStorefrontShape {
    val sm = ${rem("--radius-sm")}.dp
    val md = ${rem("--radius-md")}.dp
    val lg = ${rem("--radius-lg")}.dp
    val xl = ${rem("--radius-xl")}.dp
    val sheet = ${rem("--radius-sheet")}.dp

    val small = RoundedCornerShape(sm)
    val control = RoundedCornerShape(md)
    val card = RoundedCornerShape(lg)
    val banner = RoundedCornerShape(xl)
    val sheetTop = RoundedCornerShape(topStart = sheet, topEnd = sheet)
}
`;
}

for (const target of TARGETS) generate(target);
