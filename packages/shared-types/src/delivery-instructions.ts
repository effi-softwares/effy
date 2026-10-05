/**
 * Delivery instructions — 066-delivery-instructions.
 *
 * What a customer tells the driver: how to hand the order over, and a short note. The vocabulary,
 * the length limit and the normalisation rule live HERE and nowhere else (Principle II): the two
 * customer surfaces use them to show a remaining-characters count, and the two backends use them to
 * decide. A client holding a looser opinion than the server is how a 300-character note is typed,
 * accepted by the screen and refused at payment.
 *
 * ⚠ THE SERVER IMPORTS THIS FILE. Checkout (`edge-api/commerce`) calls `normaliseDeliveryInstructions`
 * itself, so the client's opinion and the server's are the same function. (Until 070 the server was
 * a second language and carried a mirror, pinned by `delivery-instructions.fixtures.json`; the
 * fixture remains as this rule's table of cases.)
 */

export type HandoverPreference = "leave_at_door" | "meet_at_door";

export const HANDOVER_PREFERENCES: readonly HandoverPreference[] = ["leave_at_door", "meet_at_door"];

/**
 * The words for each preference, as the CUSTOMER chose them. One copy, so the storefront, the
 * receipt and the back-office console cannot drift into three phrasings of one choice.
 */
export const HANDOVER_LABEL: Readonly<Record<HandoverPreference, string>> = {
  leave_at_door: "Leave at the door",
  meet_at_door: "Meet at the door",
};

/**
 * ⚠ COUNTED IN UNICODE CODE POINTS, not UTF-16 units — an emoji is one character to the person
 * typing it, and PostgreSQL's `char_length` (the database's backstop) counts the same way.
 */
export const DELIVERY_NOTE_MAX = 250;

export interface DeliveryInstructionsDTO {
  handover: HandoverPreference | null;
  /** Plain text, already normalised. Never interpreted as markup anywhere it is shown. */
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
 * The note, as it will be stored — or null when there is nothing left to store.
 *
 *  1. Line endings become `\n`; tabs become spaces.
 *  2. Control characters other than `\n` are removed.
 *  3. Within each line, runs of spaces collapse to one and the line is trimmed.
 *  4. Empty lines are dropped.
 *
 * ⚠ NEVER TRUNCATES. A note that is too long is refused by the caller; silently cutting a
 * customer's sentence in half could cut it before "not".
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
 * Validate and normalise whatever a client sent.
 *
 * `null`, `undefined` and a value with both parts empty all mean "no instructions" and come back as
 * `{ handover: null, note: null }`. The refusal says WHICH field and WHY and never carries the
 * value: a note may hold a gate code, and an error is the kind of thing that gets logged.
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

/** True when there is nothing to show — the test every surface uses before rendering an area. */
export function hasDeliveryInstructions(v: DeliveryInstructionsDTO | null | undefined): v is DeliveryInstructionsDTO {
  return !!v && (v.handover !== null || v.note !== null);
}
