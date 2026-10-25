import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CONSOLE_CSS = resolve(here, "../src/tokens.css");
const STOREFRONT_CSS = resolve(here, "../src/tokens.css");
const BANNER_CANVAS = JSON.parse(readFileSync(resolve(here, "../../shared-types/src/banner-canvas.json"), "utf8"));

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

const SHARED_PKG = "com.effyshopping.mobile.design";

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function parseBlock(css, selector) {
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m");
  const body = css.match(re);
  if (!body) throw new Error(`gen-compose-theme: no '${selector}' block in tokens.css`);
  const out = {};
  for (const line of body[1].split("\n")) {
    const m = line.match(/^\s*--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
    if (m) out[m[1]] = m[2].toLowerCase();
    const r = line.match(/^\s*--([\w-]+)\s*:\s*rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)\s*;/);
    if (r) {
      const hex = (n) => Number(n).toString(16).padStart(2, "0");
      out[r[1]] = `#${hex(Math.round(Number(r[5]) * 255))}${hex(r[2])}${hex(r[3])}${hex(r[4])}`;
    }
  }
  return out;
}

const argb = (hex) => (hex.length === 9 ? `0x${hex.slice(1).toUpperCase()}` : `0xFF${hex.slice(1).toUpperCase()}`);

const COLOR_TOKENS = [
  ["background", "background"],
  ["foreground", "foreground"],
  ["card", "card"],
  ["cardForeground", "card-foreground"],
  ["popover", "popover"],
  ["popoverForeground", "popover-foreground"],
  ["primary", "primary"],
  ["primaryForeground", "primary-foreground"],
  ["primaryFill", "primary-fill"],
  ["secondary", "secondary"],
  ["secondaryForeground", "secondary-foreground"],
  ["muted", "muted"],
  ["mutedForeground", "muted-foreground"],
  ["accent", "accent"],
  ["accentForeground", "accent-foreground"],
  ["destructive", "destructive"],
  ["destructiveForeground", "destructive-foreground"],
  ["destructiveFill", "destructive-fill"],
  ["success", "success"],
  ["disabled", "disabled"],
  ["disabledForeground", "disabled-foreground"],
  ["placeholder", "placeholder"],
  ["border", "border"],
  ["input", "input"],
  ["ring", "ring"],
  ["primaryMuted", "primary-muted"],
  ["brand", "brand"],
  ["brandForeground", "brand-foreground"],
  ["brandFill", "brand-fill"],
  ["brandMuted", "brand-muted"],
  ["scrim", "scrim"],
];

const ALIASES = {
  success: "brand",
  disabled: "muted",
  "disabled-foreground": "muted-foreground",
  placeholder: "muted-foreground",
};

const M3_MAP = [
  ["primaryFill", "primary"],
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
  ["primaryFill", "surfaceTint"],
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
  ["primaryFill", "primaryFixed"],
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
  const css = stripComments(readFileSync(CONSOLE_CSS, "utf8"));
  const colorCss = stripComments(readFileSync(STOREFRONT_CSS, "utf8"));
  const light = parseBlock(colorCss, ":root");
  const dark = parseBlock(colorCss, ".dark");

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
 * action). Rose for problems (destructive); a filled control (*Fill) carries white type in both appearances.
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
