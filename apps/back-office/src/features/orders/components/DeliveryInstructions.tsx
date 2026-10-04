import { HANDOVER_LABEL, hasDeliveryInstructions, type DeliveryInstructionsDTO } from "@effy/shared-types";

/**
 * What the customer told the driver (066) — shown to staff so "I said leave it at the door" can be
 * answered without asking the customer to repeat it.
 *
 * Renders NOTHING when the customer said nothing: no heading, no "none given". Every order placed
 * before 066 is in that state, and the console must look exactly as it did for them.
 *
 * ⚠ `note` IS CUSTOMER-AUTHORED TEXT RENDERED INSIDE AN INTERNAL CONSOLE — the classic stored-XSS
 * position: an attacker types it on the public storefront and a signed-in admin's browser shows it.
 * It goes through a React text node and nowhere else. `whitespace-pre-line` keeps the line breaks
 * they typed without interpreting a single character.
 */
export function DeliveryInstructions({ instructions }: { instructions?: DeliveryInstructionsDTO | null }) {
  if (!hasDeliveryInstructions(instructions)) return null;
  return (
    <>
      <h3 className="pt-2 text-sm font-medium">Delivery instructions</h3>
      {instructions.handover ? <p className="text-sm">{HANDOVER_LABEL[instructions.handover]}</p> : null}
      {instructions.note ? (
        <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{instructions.note}</p>
      ) : null}
    </>
  );
}
