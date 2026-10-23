/**
 * Delivery instructions: how to hand the order over, and a short note. The vocabulary, the length limit
 * and the normalisation rule live here only; the customer surfaces use them for a remaining-characters
 * count and checkout calls `normaliseDeliveryInstructions` itself, so client and server agree.
 * `delivery-instructions.fixtures.json` is the rule's table of cases.
 */

export type HandoverPreference = "leave_at_door" | "meet_at_door";

export const HANDOVER_PREFERENCES: readonly HandoverPreference[] = ["leave_at_door", "meet_at_door"];

/** The words for each preference, shared by the storefront, the receipt and back-office. */
export const HANDOVER_LABEL: Readonly<Record<HandoverPreference, string>> = {
  leave_at_door: "Leave at the door",
  meet_at_door: "Meet at the door",
};

/** Counted in Unicode code points (an emoji is one character), as PostgreSQL's `char_length` counts. */
export const DELIVERY_NOTE_MAX = 250;

export interface DeliveryInstructionsDTO {
  handover: HandoverPreference | null;
  /** Plain text, already normalised; never interpreted as markup. */
  note: string | null;
}

export type DeliveryInstructionsResult =
  | { ok: true; value: DeliveryInstructionsDTO }
  | { ok: false; field: "handover" | "note"; reason: "invalid" | "too_long" };

/** Code points, the unit `DELIVERY_NOTE_MAX` is stated in. */
export function deliveryNoteLength(note: string): number {
  return Array.from(note).length;
}

/**
 * The note as it will be stored, or null when nothing is left:
 *  1. line endings become `\n`; tabs become spaces;
 *  2. control characters other than `\n` are removed;
 *  3. within each line, runs of spaces collapse and the line is trimmed;
 *  4. empty lines are dropped.
 * Never truncates: a note that is too long is refused by the caller.
 */
export function normaliseDeliveryNote(raw: string): string | null {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, "")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .filter((line) => line !== "");
  return lines.length === 0 ? null : lines.join("\n");
}

function isHandover(v: unknown): v is HandoverPreference {
  return typeof v === "string" && (HANDOVER_PREFERENCES as readonly string[]).includes(v);
}

/**
 * Validates and normalises what a client sent. `null`, `undefined` and both parts empty mean "no
 * instructions". A refusal names the field and why, never the value (a note may hold a gate code).
 */
export function normaliseDeliveryInstructions(input: unknown): DeliveryInstructionsResult {
  if (input === null || input === undefined) return { ok: true, value: { handover: null, note: null } };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, field: "note", reason: "invalid" };

  const { handover: rawHandover, note: rawNote } = input as { handover?: unknown; note?: unknown };

  let handover: HandoverPreference | null = null;
  if (rawHandover !== null && rawHandover !== undefined) {
    if (!isHandover(rawHandover)) return { ok: false, field: "handover", reason: "invalid" };
    handover = rawHandover;
  }

  let note: string | null = null;
  if (rawNote !== null && rawNote !== undefined) {
    if (typeof rawNote !== "string") return { ok: false, field: "note", reason: "invalid" };
    note = normaliseDeliveryNote(rawNote);
    if (note !== null && deliveryNoteLength(note) > DELIVERY_NOTE_MAX) {
      return { ok: false, field: "note", reason: "too_long" };
    }
  }

  return { ok: true, value: { handover, note } };
}

/** True when there is nothing to show. */
export function hasDeliveryInstructions(v: DeliveryInstructionsDTO | null | undefined): v is DeliveryInstructionsDTO {
  return !!v && (v.handover !== null || v.note !== null);
}
