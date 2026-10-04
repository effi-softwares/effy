import type { MarginDTO, ReviewKind } from "@effy/shared-types";

export const KIND_LABEL: Record<ReviewKind, string> = {
  new_product: "New product",
  change: "Change",
};

export function waitingLabel(hours: number): string {
  if (hours < 1) return "Under an hour";
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

export function marginLabel(m: MarginDTO | null): string {
  if (!m) return "Not set";
  return m.kind === "percent" ? `${m.value}%` : `+ ${m.value}`;
}

/**
 * What the product would sell for, shown to the reviewer BEFORE they confirm (067 FR-030).
 *
 * ⚠ A PREVIEW ONLY. The price that is stored is computed by the server, in whole cents, by the one
 * margin rule in `@effy/edge-shared`. This mirrors it closely enough to show a reviewer the figure
 * they are about to set; if the two ever disagree, the server's is the one that sells.
 */
export function previewCustomerPrice(shopPrice: string, kind: "percent" | "amount", value: string): string | null {
  const v = value.trim();
  if (!/^\d+(\.\d+)?$/.test(v) || !/^\d+(\.\d{1,2})?$/.test(shopPrice)) return null;
  const shopCents = Math.round(Number(shopPrice) * 100);
  const cents =
    kind === "amount"
      ? shopCents + Math.round(Number(v) * 100)
      : shopCents + Math.floor((shopCents * Number(v)) / 100 + 0.5);
  if (!Number.isFinite(cents)) return null;
  return (cents / 100).toFixed(2);
}

export type MarginEntry = { kind: "percent" | "amount"; value: string };

/** A margin the form can send, or null while what is typed is not one. Zero is a margin; blank is not. */
export function toMargin(entry: MarginEntry): MarginDTO | null {
  const v = entry.value.trim();
  return /^\d+(\.\d+)?$/.test(v) ? { kind: entry.kind, value: v } : null;
}
