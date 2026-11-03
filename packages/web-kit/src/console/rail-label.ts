import { RAIL_FONT_ADVANCE, RAIL_FONT_FIRST_CHAR, RAIL_FONT_UNITS_PER_EM } from "./rail-metrics";

/**
 * The folded rail's label line, in px: the rail is 96px, less the group's 8px each side and the button's 4px each
 * side. Labels are 12px, and SemiBold when the page is active, so the widest weight is the one measured.
 */
export const RAIL_LINE_PX = 72;
const LABEL_PX = 12;

// Anything outside printable ASCII is measured as an "M", the widest letter, so it errs towards "too wide".
const FALLBACK = RAIL_FONT_ADVANCE["M".charCodeAt(0) - RAIL_FONT_FIRST_CHAR]!;

/** How wide `text` is in the rail's type (Geist SemiBold 12px), from the font's own advance widths. */
export function railTextWidth(text: string): number {
  let units = 0;
  for (const ch of text) units += RAIL_FONT_ADVANCE[ch.charCodeAt(0) - RAIL_FONT_FIRST_CHAR] ?? FALLBACK;
  return (units * LABEL_PX) / RAIL_FONT_UNITS_PER_EM;
}

/**
 * The words of a rail label that cannot fit on one line, or that need a third line. Empty means it fits. A
 * console's nav test calls this for every entry, so a long name is caught before it is cut in the rail.
 */
export function railLabelProblems(label: string): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const problems = words.filter((w) => railTextWidth(w) > RAIL_LINE_PX).map((w) => `"${w}" is wider than the rail`);
  let lines = 0;
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && railTextWidth(next) > RAIL_LINE_PX) {
      lines += 1;
      line = w;
    } else line = next;
  }
  if (line) lines += 1;
  if (lines > 2) problems.push(`"${label}" needs ${lines} lines (the rail shows two)`);
  return problems;
}

/** What the folded rail shows for an entry. */
export const railLabelOf = (entry: { label: string; railLabel?: string }): string => entry.railLabel ?? entry.label;
