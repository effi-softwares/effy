import {
  DELIVERY_NOTE_MAX,
  deliveryNoteLength,
  HANDOVER_LABEL,
  HANDOVER_PREFERENCES,
  normaliseDeliveryInstructions,
  type DeliveryInstructionsDTO,
  type HandoverPreference,
} from "@effy/shared-types"

/**
 * Delivery instructions on the storefront (066) — the draft a shopper edits, and the words shown
 * for a handover preference.
 *
 * ⚠ THE RULE IS NOT HERE. What is valid — the limit, what counts as blank, how whitespace is
 * collapsed — is `normaliseDeliveryInstructions` in `@effy/shared-types`, the same function the
 * server's decision is pinned to. This file only holds what is genuinely the storefront's: the
 * editable draft and the display copy.
 */

/** What the shopper is editing. `note` is RAW — as typed, not yet normalised. */
export interface InstructionsDraft {
  handover: HandoverPreference | null
  note: string
}

export const EMPTY_DRAFT: InstructionsDraft = { handover: null, note: "" }

/** The two choices, in the order they are offered, with the words a shopper reads. */
export const HANDOVER_CHOICES: ReadonlyArray<{ value: HandoverPreference; label: string }> =
  HANDOVER_PREFERENCES.map((value) => ({ value, label: HANDOVER_LABEL[value] }))

export function handoverLabel(handover: HandoverPreference): string {
  return HANDOVER_LABEL[handover]
}

/** A saved default (or a placed order's instructions) → an editable draft. */
export function draftFrom(saved: DeliveryInstructionsDTO | null | undefined): InstructionsDraft {
  return { handover: saved?.handover ?? null, note: saved?.note ?? "" }
}

/**
 * Keep typing inside the limit. ⚠ This clamps what can be TYPED, in the characters a person counts
 * (code points), so the counter can reach zero and stop — it is not the validation, and nothing a
 * shopper submitted is ever silently shortened: the server refuses an over-long note outright.
 */
export function clampNote(raw: string): string {
  return deliveryNoteLength(raw) <= DELIVERY_NOTE_MAX ? raw : Array.from(raw).slice(0, DELIVERY_NOTE_MAX).join("")
}

export function remainingCharacters(note: string): number {
  return DELIVERY_NOTE_MAX - deliveryNoteLength(note)
}

/**
 * The draft as the request carries it: normalised, or `null` when the shopper said nothing. A draft
 * that fails the rule (it cannot, while typing is clamped — but a paste into a future field might)
 * is sent as-is so the SERVER refuses it, rather than being quietly repaired here.
 */
export function draftToRequest(draft: InstructionsDraft): DeliveryInstructionsDTO | null {
  const out = normaliseDeliveryInstructions({ handover: draft.handover, note: draft.note })
  if (!out.ok) return { handover: draft.handover, note: draft.note }
  return out.value.handover === null && out.value.note === null ? null : out.value
}

export function sameInstructions(a: InstructionsDraft, b: InstructionsDraft): boolean {
  const x = draftToRequest(a)
  const y = draftToRequest(b)
  return (x?.handover ?? null) === (y?.handover ?? null) && (x?.note ?? null) === (y?.note ?? null)
}
