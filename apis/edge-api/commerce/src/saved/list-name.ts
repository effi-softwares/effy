/**
 * List names (068). A name is the shopper's own text: it is stored, returned to them, and NEVER
 * logged or placed in a path.
 */
import { LIST_NAME_MAX } from "@effy/shared-types";

/** Empty after normalising, or longer than the limit. */
export class InvalidListNameError extends Error {}
/** The shopper already uses this name (compared without regard to case), or it is the default's. */
export class ListNameTakenError extends Error {}

/**
 * The default list's name on every client. A named list may not take it in any letter case; the
 * unique index cannot enforce that, because the default's stored name is NULL.
 */
const RESERVED = "Saved";

// The exact character classes the retired backend used: Unicode White_Space for separators (which
// excludes U+FEFF and includes U+0085), category Cc for control characters.
const isSpace = (ch: string) => ch === "\u0085" || (ch !== "﻿" && /\s/u.test(ch));
const isControl = (ch: string) => /\p{Cc}/u.test(ch);

/**
 * Trim, collapse each run of whitespace to one space, drop control characters. A newline is
 * whitespace and becomes a space; it is tested before the control check for that reason.
 *
 * Length is counted in Unicode code points. A flag or a joined-family emoji therefore counts as
 * more than one character: the limit is about storage and layout, not graphemes.
 */
export function normaliseListName(raw: string): string {
  let name = "";
  let pendingSpace = false;
  for (const ch of raw) {
    if (isSpace(ch)) {
      pendingSpace = true;
    } else if (isControl(ch)) {
      // dropped
    } else {
      if (pendingSpace && name !== "") name += " ";
      pendingSpace = false;
      name += ch;
    }
  }
  if (name === "" || [...name].length > LIST_NAME_MAX) throw new InvalidListNameError();
  if (name.toUpperCase() === RESERVED.toUpperCase()) throw new ListNameTakenError();
  return name;
}
