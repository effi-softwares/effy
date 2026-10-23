/** A list name is the shopper's own text: stored and returned, never logged or put in a path. */
import { LIST_NAME_MAX } from "@effy/shared-types";

export class InvalidListNameError extends Error {}
/** Compared case-insensitively; the default's name counts. */
export class ListNameTakenError extends Error {}

/** A named list may not take it in any case; the unique index cannot, as the default's name is null. */
const RESERVED = "Saved";

// Unicode White_Space for separators (excludes U+feff, includes U+0085); category Cc for control.
const isSpace = (ch: string) => ch === "\u0085" || (ch !== "﻿" && /\s/u.test(ch));
const isControl = (ch: string) => /\p{Cc}/u.test(ch);

/**
 * Trims, collapses whitespace runs to one space and drops control characters (newlines become
 * spaces). Length counts code points, not graphemes.
 */
export function normaliseListName(raw: string): string {
  let name = "";
  let pendingSpace = false;
  for (const ch of raw) {
    if (isSpace(ch)) {
      pendingSpace = true;
    } else if (isControl(ch)) {
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
