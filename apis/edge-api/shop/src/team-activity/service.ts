// Team activity → the wire (058, US5).
import type { ShopTeamActivityDTO, TeamActivityEntryDTO } from "@effy/shared-types";

import { readTeamActivity } from "./repository";
import type { ActivityRow } from "./repository";

/**
 * Who acted.
 *
 * ⚠ THREE ANSWERS, AND "NOBODY" IS NOT ONE OF THEM. A named staff member; a person at this shop
 * whose operator record has since been removed (020: a NULL actor means "the person is gone", never
 * "nobody did it"); or Effy, for anything the platform or back-office did. A blank actor would read
 * as an action with no author, which is the opposite of what an accountability log is for.
 */
function actorOf(row: ActivityRow): TeamActivityEntryDTO["actor"] {
  if (row.actorName) return { kind: "staff", name: row.actorName };
  if (row.actorWasStaff) return { kind: "former_staff" };
  return { kind: "effy" };
}

function actionOf(row: ActivityRow): TeamActivityEntryDTO["action"] {
  switch (row.kind) {
    case "state_changed":
      return { kind: "state_changed", orderNumber: row.orderNumber ?? "", to: row.reason ?? "" };
    case "item_gathered":
    case "item_unavailable":
    case "item_restored":
      return {
        kind: row.kind,
        orderNumber: row.orderNumber ?? "",
        productName: row.productName ?? "",
        quantity: row.quantity ?? 0,
      };
    case "note_added":
    case "tags_changed":
      return { kind: row.kind, orderNumber: row.orderNumber ?? "" };
    case "stock_changed":
      return {
        kind: "stock_changed",
        productName: row.productName ?? "",
        reason: row.reason ?? "",
        delta: row.quantity ?? 0,
      };
    case "refund_issued":
      return { kind: "refund_issued", orderNumber: row.orderNumber ?? "", amount: row.amount ?? "0" };
  }
}

/** The dot beside a row. ⚠ A marker, never a text colour (Principle V). */
function toneOf(row: ActivityRow): TeamActivityEntryDTO["tone"] {
  if (row.kind === "item_unavailable" || row.kind === "refund_issued") return "problem";
  if (row.kind === "state_changed" || row.kind === "item_gathered") return "done";
  return "neutral";
}

export async function readActivity(shopId: string): Promise<ShopTeamActivityDTO> {
  const rows = await readTeamActivity(shopId);
  return {
    entries: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actor: actorOf(r),
      action: actionOf(r),
      tone: toneOf(r),
    })),
  };
}
