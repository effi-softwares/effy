// GENERATOR — parses src/tokens.css and emits compose/EffyTokens.kt (013 research D16).
//
// tokens.css is the SINGLE SOURCE OF TRUTH for the brand. This script makes the Compose
// theme a DERIVED, COMMITTED artifact that cannot drift: CI runs `tokens:check`
// (gen + `git diff --exit-code`), so a change to tokens.css that is not regenerated fails the build.
//
// Zero dependencies by design — Node's stdlib only. If this script ever needs a package,
// reconsider it: the whole point is that the generator is NOT load-bearing in any build graph.
//
// Design notes:
//  - The shadcn token names → Material 3 ColorScheme slots via a FIXED lookup table below.
//  - M3 slots with no CSS source (secondaryContainer, tertiary, …) are LEFT AT THE M3 DEFAULT
//    (i.e. not emitted into the ColorScheme call) — NEVER invented here, or we reintroduce the
//    second source of truth this whole approach exists to kill.
//  - `#047857` ("fill") is a documented-but-unused brand token; it is NOT in tokens.css, so it does
//    not appear here. `#0FB57E` is the live accent.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CSS = resolve(here, "../src/tokens.css");
const OUT = resolve(here, "../compose/EffyTokens.kt");

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

// shadcn token -> Material 3 ColorScheme slot. FIXED. M3 slots absent here keep the M3 default.
const M3_MAP = [
  ["primary", "primary"],
  ["primaryForeground", "onPrimary"],
  ["secondary", "secondary"],
  ["secondaryForeground", "onSecondary"],
  ["background", "background"],
  ["foreground", "onBackground"],
  ["card", "surface"],
  ["cardForeground", "onSurface"],
  ["muted", "surfaceVariant"],
  ["mutedForeground", "onSurfaceVariant"],
  ["destructive", "error"],
  ["destructiveForeground", "onError"],
  ["border", "outline"],
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

function generate() {
  const css = readFileSync(CSS, "utf8");
  const light = parseBlock(css, ":root");
  const dark = parseBlock(css, ".dark");

  // --radius: 0.625rem -> dp at the 16px root => 10.dp
  const radiusRem = css.match(/--radius\s*:\s*([\d.]+)rem/);
  if (!radiusRem) throw new Error("gen-compose-theme: no --radius in tokens.css");
  const radiusDp = Math.round(parseFloat(radiusRem[1]) * 16);

  const banner = `// GENERATED FROM packages/design-system/src/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
// The brand lives in tokens.css ONCE (constitution Principle V); this file is derived and diff-guarded (013 D16).`;

  const out = `${banner}
package com.effyshopping.customer.mobile.design

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** The raw Effy brand tokens, light and dark. Jade #0FB57E is the single accent. */
object EffyColor {
${colorObject("Light", light)}

${colorObject("Dark", dark)}
}

object EffyRadius {
    val default = ${radiusDp}.dp
}

${colorScheme("lightColorScheme", "EffyLightColorScheme", "Light")}

${colorScheme("darkColorScheme", "EffyDarkColorScheme", "Dark")}
`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, out);
  console.log(`gen-compose-theme: wrote ${OUT} (${COLOR_TOKENS.length} colors, radius ${radiusDp}.dp)`);
}

generate();
