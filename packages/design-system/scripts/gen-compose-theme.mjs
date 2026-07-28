// GENERATOR — parses src/tokens.css and emits compose/EffyTokens.kt (013 research D16).
//
// tokens.css is the SINGLE SOURCE OF TRUTH for the brand. This script makes the Compose
// theme a DERIVED, COMMITTED artifact that cannot drift: CI runs `tokens:check`, which snapshots the
// committed artifacts, regenerates them, and fails if their contents changed. This stays reliable in a
// dirty development worktree and does not depend on Git staging state.
//
// Zero dependencies by design — Node's stdlib only. If this script ever needs a package,
// reconsider it: the whole point is that the generator is NOT load-bearing in any build graph.
//
// Design notes:
//  - The shadcn token names → Material 3 ColorScheme slots via a FIXED lookup table below.
//  - Every Material role used by the mobile foundation maps to an existing semantic token. Container,
//    inverse, fixed and tertiary roles intentionally reuse the nearest authored Effy role; no library
//    default is allowed to leak a second palette into navigation, controls or feedback.
//  - The brand is Effy Emerald: `#065f46` is the accent in both modes; `#d0735a` is the authored
//    terracotta reference, contrast-tuned per mode in tokens.css. Retired Jade values are gone.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CSS = resolve(here, "../src/tokens.css");

// ONE generator, ONE brand source — one derived, diff-guarded theme PER KMP app (Principle II/V). Each
// app has its own package root, so each gets its own committed copy. tokens:check compares them all.
const TARGETS = [
  {
    out: resolve(here, "../compose/EffyTokens.kt"),
    pkg: "com.effyshopping.customer.mobile.design",
    sharedOut: resolve(here, "../compose/EffyLayoutTokens.kt"),
    typographyOut: resolve(here, "../compose/EffyTypography.kt"),
    resPkg: "com.effyshopping.customer.mobile.resources",
  },
  {
    out: resolve(here, "../compose-shop/EffyTokens.kt"),
    pkg: "com.effyshopping.shop.mobile.design",
    sharedOut: resolve(here, "../compose-shop/EffyLayoutTokens.kt"),
    typographyOut: resolve(here, "../compose-shop/EffyTypography.kt"),
    resPkg: "com.effyshopping.shop.mobile.resources",
  },
  {
    out: resolve(here, "../compose-driver/EffyTokens.kt"),
    pkg: "com.effyshopping.driver.mobile.design",
    sharedOut: resolve(here, "../compose-driver/EffyLayoutTokens.kt"),
    // ⚠ No typography target: driver-mobile is still the untouched KMP template with no
    // composeResources, so there are no font accessors to import. It gains one with its shell.
    typographyOut: null,
  },
];

// The AUDIENCE-NEUTRAL package for the layout vocabulary (spacing + radius).
//
// ⚠ Why this is not in the per-app package like the colours: `packages/mobile-kit` holds components
// shared by every mobile surface, and a shared component cannot import
// `com.effyshopping.<app>.mobile.design`. Duplicating the scale into the kit would be exactly the
// copy-paste Principle II prohibits, and the two copies would drift the first time a step changed.
//
// Each app still gets its OWN generated copy of this file (they are separate Gradle builds, so the
// identical package name never collides) — the same authored-source → committed-derived-artifact →
// drift-check pattern the colours already use.
const SHARED_PKG = "com.effyshopping.mobile.design";

/** Parse a `:root { … }` or `.dark { … }` block into { cssVarName: "#rrggbb" }. */
function parseBlock(css, selector) {
  // Match the FIRST top-level `selector { … }` — tokens.css has exactly one of each.
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m");
  const body = css.match(re);
  if (!body) throw new Error(`gen-compose-theme: no '${selector}' block in tokens.css`);
  const out = {};
  for (const line of body[1].split("\n")) {
    // --name: #hex;   (ignore non-color values like --radius, and calc()/var() in the @theme block)
    const m = line.match(/^\s*--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
    if (m) out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

/** "#0fb57e" -> "0xFF0FB57E" (opaque ARGB for Compose Color). */
const argb = (hex) => `0xFF${hex.slice(1).toUpperCase()}`;

// The tokens we surface to Compose, in a stable order. camelCase Kotlin name -> css var name.
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
  ["border", "border"],
  ["input", "input"],
  ["ring", "ring"],
];

// Authored token -> Material 3 ColorScheme slot. FIXED. Reuse is deliberate: CSS remains the only
// color authority while Material components receive a complete semantic scheme rather than defaults.
const M3_MAP = [
  ["primary", "primary"],
  ["primaryForeground", "onPrimary"],
  ["accent", "primaryContainer"],
  ["accentForeground", "onPrimaryContainer"],
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
  ["foreground", "scrim"],
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
    if (!(css in tokens)) throw new Error(`gen-compose-theme: missing --${css} in ${name}`);
    return `        val ${k} = Color(${argb(tokens[css])})`;
  });
  return `    object ${name} {\n${lines.join("\n")}\n    }`;
}

function colorScheme(fnName, valName, objName) {
  const args = M3_MAP.map(([tok, slot]) => `    ${slot} = EffyColor.${objName}.${tok},`);
  return `val ${valName}: ColorScheme = ${fnName}(\n${args.join("\n")}\n)`;
}

function generate(target) {
  const css = readFileSync(CSS, "utf8");
  const light = parseBlock(css, ":root");
  const dark = parseBlock(css, ".dark");

  // Radii: rem -> dp at the 16px root. --radius (base = md), --radius-sm, --radius-md — pinned EXPLICITLY
  // in tokens.css so web px == these dp (017 SC-004). Pill (scale xl = 100) is RoundedCornerShape(50%),
  // NOT a numeric token, so it is not emitted here.
  const radiusRem = (name) => {
    const m = css.match(new RegExp(`${name}\\s*:\\s*([\\d.]+)rem`));
    if (!m) throw new Error(`gen-compose-theme: no ${name} in tokens.css`);
    return Math.round(parseFloat(m[1]) * 16);
  };
  const radiusDefaultDp = radiusRem("--radius"); // 16
  const radiusSmDp = radiusRem("--radius-sm"); // 8
  const radiusMdDp = radiusRem("--radius-md"); // 16

  const banner = `// GENERATED FROM packages/design-system/src/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
// The brand lives in tokens.css ONCE (constitution Principle V); this file is derived and diff-guarded (013 D16).`;

  const out = `${banner}
package ${target.pkg}

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/** The raw Effy brand tokens, light and dark. Effy Emerald #065f46 is the primary accent. */
object EffyColor {
${colorObject("Light", light)}

${colorObject("Dark", dark)}
}

${colorScheme("lightColorScheme", "EffyLightColorScheme", "Light")}

${colorScheme("darkColorScheme", "EffyDarkColorScheme", "Dark")}
`;

  mkdirSync(dirname(target.out), { recursive: true });
  writeFileSync(target.out, out);

  // The audience-neutral half: spacing + radius, consumable by packages/mobile-kit.
  const shared = `${banner}
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
`;
  writeFileSync(target.sharedOut, shared);

  // The Material 3 type scale, bound to Nunito Sans.
  //
  // ⚠ Generated PER APP rather than shared, because it is the one part of the theme that genuinely
  // cannot be: it imports the app's own generated Compose resource accessors (`Res.font.…`), whose
  // package differs per module. The SCALE itself is identical everywhere — it is data, and it comes
  // from here so the two surfaces cannot drift into different type hierarchies. 018 authored this by
  // hand inside shop-mobile, which is exactly why customer-mobile never had it.
  if (target.typographyOut) {
    const typography = `${banner}
package ${target.pkg}

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import org.jetbrains.compose.resources.Font
import ${target.resPkg}.Res
import ${target.resPkg}.nunito_sans_bold
import ${target.resPkg}.nunito_sans_regular
import ${target.resPkg}.nunito_sans_semibold

/** Nunito Sans, the platform typeface (constitution Principle V). */
@Composable
fun effyFontFamily(): FontFamily = FontFamily(
    Font(Res.font.nunito_sans_regular, FontWeight.Normal),
    Font(Res.font.nunito_sans_semibold, FontWeight.SemiBold),
    Font(Res.font.nunito_sans_bold, FontWeight.Bold),
)

/** The Effy Material 3 type scale. Identical across every mobile surface by construction. */
@Composable
fun effyTypography(): Typography {
    val family = effyFontFamily()
    return Typography(
        displayLarge = effyTextStyle(family, FontWeight.Bold, 48, 56),
        headlineLarge = effyTextStyle(family, FontWeight.Bold, 34, 40),
        headlineMedium = effyTextStyle(family, FontWeight.Bold, 30, 36),
        headlineSmall = effyTextStyle(family, FontWeight.Bold, 26, 32),
        titleLarge = effyTextStyle(family, FontWeight.Bold, 22, 28),
        titleMedium = effyTextStyle(family, FontWeight.SemiBold, 18, 24),
        titleSmall = effyTextStyle(family, FontWeight.SemiBold, 16, 22),
        bodyLarge = effyTextStyle(family, FontWeight.Normal, 17, 25),
        bodyMedium = effyTextStyle(family, FontWeight.Normal, 15, 22),
        bodySmall = effyTextStyle(family, FontWeight.Normal, 13, 18),
        labelLarge = effyTextStyle(family, FontWeight.SemiBold, 15, 20),
        labelMedium = effyTextStyle(family, FontWeight.SemiBold, 13, 18),
        labelSmall = effyTextStyle(family, FontWeight.SemiBold, 11, 16),
    )
}

private fun effyTextStyle(
    family: FontFamily,
    weight: FontWeight,
    size: Int,
    lineHeight: Int,
) = TextStyle(
    fontFamily = family,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
)
`;
    writeFileSync(target.typographyOut, typography);
  }

  console.log(`gen-compose-theme: wrote ${target.out} (${COLOR_TOKENS.length} colors) + ${target.sharedOut} (radius sm/md/default ${radiusSmDp}/${radiusMdDp}/${radiusDefaultDp}.dp)`);
}

for (const target of TARGETS) generate(target);
