// 096 US8 — the GST arithmetic of a tax invoice (research R15). PURE: every number on an invoice comes
// from here, and `gst.test.ts` holds each rule to worked examples.
//
// ⚠ ALL MONEY IS INTEGER CENTS. Prices are GST-inclusive (Australian practice), so the GST in a taxable
// amount is one eleventh of it, rounded half up ONCE over the invoice's taxable total — per-line
// rounding is allowed but drifts from the total. Fees are taxed as the business's fee treatment says.
// Points are a way of PAYING (074): they appear under payments and change no GST.
//
// ⚠ The fee treatment and the rounding approach are to be confirmed by Effy's accountant; both are
// configuration, not code (spec Assumptions).
import type { GstStatus } from "@effy/shared-types";

/** round(x / 11), half up, for x ≥ 0 cents. */
export const gstOf = (taxableCents: number): number => Math.floor((2 * taxableCents + 11) / 22);

/** "12.34" from 1234. */
export const money = (cents: number): string => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;

export interface InvoiceLineInput {
  name: string;
  quantity: number;
  /** What the line was sold for, after promotions: unit × quantity − its discount. */
  amountCents: number;
  taxable: boolean;
}

export interface InvoiceFeeInput {
  label: string;
  cents: number;
}

export interface InvoiceTotals {
  lines: InvoiceLineInput[];
  fees: Array<InvoiceFeeInput & { taxable: boolean }>;
  taxableCents: number;
  gstFreeCents: number;
  totalCents: number;
  gstCents: number;
}

export function invoiceTotals(lines: readonly InvoiceLineInput[], fees: readonly InvoiceFeeInput[], feeTreatment: GstStatus): InvoiceTotals {
  const feeTaxable = feeTreatment === "taxable";
  const shownFees = fees.filter((f) => f.cents > 0).map((f) => ({ ...f, taxable: feeTaxable }));
  const taxableCents =
    lines.filter((l) => l.taxable).reduce((a, l) => a + l.amountCents, 0) + shownFees.filter((f) => f.taxable).reduce((a, f) => a + f.cents, 0);
  const totalCents = lines.reduce((a, l) => a + l.amountCents, 0) + shownFees.reduce((a, f) => a + f.cents, 0);
  return { lines: [...lines], fees: shownFees, taxableCents, gstFreeCents: totalCents - taxableCents, totalCents, gstCents: gstOf(taxableCents) };
}

export interface RefundInput {
  amountCents: number;
  /** The lines an itemised refund covered; absent for an amount-only (goodwill) refund. */
  lines?: Array<{ amountCents: number; taxable: boolean }>;
}

/**
 * The GST a refund returns. An itemised refund: its taxable lines, and anything beyond the lines (a
 * delivery fee refunded with them) taxed as fees are. An amount-only refund: the invoice's own GST share.
 */
export function adjustmentGst(refund: RefundInput, invoice: { gstCents: number; totalCents: number }, feeTreatment: GstStatus): number {
  if (refund.lines && refund.lines.length > 0) {
    const linesCents = refund.lines.reduce((a, l) => a + l.amountCents, 0);
    const taxable = refund.lines.filter((l) => l.taxable).reduce((a, l) => a + l.amountCents, 0)
      + (feeTreatment === "taxable" ? Math.max(0, refund.amountCents - linesCents) : 0);
    return gstOf(taxable);
  }
  if (invoice.totalCents === 0) return 0;
  return Math.floor((2 * refund.amountCents * invoice.gstCents + invoice.totalCents) / (2 * invoice.totalCents));
}

/** The ABN's own checksum (ABR): first digit less one, weighted sum divisible by 89. */
export function isValidAbn(abn: string): boolean {
  const digits = abn.replace(/\s+/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = digits.split("").reduce((a, d, i) => a + (Number(d) - (i === 0 ? 1 : 0)) * weights[i]!, 0);
  return sum % 89 === 0;
}
