// What one read means at one step, on every surface: the twin of the driver app's
// `core/scan/ScanRule.kt`, both held to `scan-rule.fixtures.json` (the app's embedded copy is checked by
// `scan-rule.test.ts`). Pure, from what the surface already holds, so it works offline.

import { isPackageCode, parsePackageToken } from "./package-code";
import type { ParcelDTO, ReadMethod, ReadOutcome } from "./parcels";

export interface ScanContext {
  /** The live bags this step expects. */
  expected: ReadonlyArray<Pick<ParcelDTO, "code" | "seq" | "of">>;
  /** Codes already counted at this step. */
  counted: ReadonlySet<string> | readonly string[];
  /** Codes elsewhere on this work, with where they belong ("Drop 3 · Northcote"). */
  elsewhere?: Readonly<Record<string, string>>;
  /** Codes of bags that were voided (a label no longer used). */
  voided?: ReadonlySet<string> | readonly string[];
  /** Codes of bags whose package was cancelled or refunded in full. */
  cancelled?: ReadonlySet<string> | readonly string[];
}

export interface ScanJudgement {
  outcome: ReadOutcome;
  /** The bag's code, when the read named one. */
  code: string | null;
  /** The sentence every surface shows for this outcome. */
  words: string;
}

/** The fixed words per outcome. `accepted` and `belongs_elsewhere` are filled in by `judgeRead`. */
export const READ_OUTCOME_WORDS: Record<ReadOutcome, string> = {
  accepted: "Counted",
  already_counted: "Already scanned",
  belongs_elsewhere: "Not here",
  not_on_this_work: "Not expected here",
  voided: "This label is no longer used",
  cancelled: "This order was cancelled",
  not_a_label: "Not an Effy label",
  not_found: "No bag has this code",
};

const has = (s: ReadonlySet<string> | readonly string[] | undefined, v: string): boolean =>
  s === undefined ? false : Array.isArray(s) ? s.includes(v) : (s as ReadonlySet<string>).has(v);

/**
 * The bag code a read names. A scan carries the `EFY1:` token; a typed code may arrive bare, in lower
 * case or grouped for reading aloud ("wtm zhx").
 */
export function readCode(raw: string, method: ReadMethod): string | null {
  const token = parsePackageToken(raw);
  if (token) return token;
  const bare = method === "typed" ? raw.replace(/[\s-]+/g, "").toUpperCase() : raw.trim();
  return isPackageCode(bare) ? bare : null;
}

/** Judge one read against one step. */
export function judgeRead(raw: string, method: ReadMethod, context: ScanContext): ScanJudgement {
  const code = readCode(raw, method);
  if (!code) return { outcome: "not_a_label", code: null, words: READ_OUTCOME_WORDS.not_a_label };
  if (has(context.voided, code)) return { outcome: "voided", code, words: READ_OUTCOME_WORDS.voided };
  if (has(context.cancelled, code)) return { outcome: "cancelled", code, words: READ_OUTCOME_WORDS.cancelled };
  const bag = context.expected.find((p) => p.code === code);
  if (bag && has(context.counted, code)) return { outcome: "already_counted", code, words: READ_OUTCOME_WORDS.already_counted };
  if (bag) return { outcome: "accepted", code, words: `Bag ${bag.seq} of ${bag.of}` };
  const where = context.elsewhere?.[code];
  if (where) return { outcome: "belongs_elsewhere", code, words: `For ${where} - not here` };
  return { outcome: "not_on_this_work", code, words: READ_OUTCOME_WORDS.not_on_this_work };
}
