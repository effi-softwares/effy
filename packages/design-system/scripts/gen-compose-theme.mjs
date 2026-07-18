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
  { out: resolve(here, "../compose/EffyTokens.kt"), pkg: "com.effyshopping.customer.mobile.design" },
  { out: resolve(here, "../compose-shop/EffyTokens.kt"), pkg: "com.effyshopping.shop.mobile.design" },
  { out: resolve(here, "../compose-driver/EffyTokens.kt"), pkg: "com.effyshopping.driver.mobile.design" },
];

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
import androidx.compose.ui.unit.dp

/** The raw Effy brand tokens, light and dark. Effy Emerald #065f46 is the primary accent. */
object EffyColor {
${colorObject("Light", light)}

${colorObject("Dark", dark)}
}

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

${colorScheme("lightColorScheme", "EffyLightColorScheme", "Light")}

${colorScheme("darkColorScheme", "EffyDarkColorScheme", "Dark")}
`;

  mkdirSync(dirname(target.out), { recursive: true });
  writeFileSync(target.out, out);
  console.log(`gen-compose-theme: wrote ${target.out} (${COLOR_TOKENS.length} colors, radius sm/md/default ${radiusSmDp}/${radiusMdDp}/${radiusDefaultDp}.dp)`);
}

for (const target of TARGETS) generate(target);
