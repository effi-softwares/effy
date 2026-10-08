// The customer's own points (074 US1): balance and history. No HTTP, no SQL — the reads are
// @effy/edge-shared/points, the same ones back-office uses, so the two can never disagree.
import { formatCents, pooled, type Queryable } from "@effy/edge-shared";
import { balanceSummary, history } from "@effy/edge-shared/points";
import type { PointsBalanceDTO, PointsHistoryPageDTO } from "@effy/shared-types";

import { findByCognitoSub } from "../customer/repo";
import { CustomerBarredError, CustomerNotFoundError } from "../customer/service";

/**
 * THE ACCESS DECISION, the same as the address book's: the caller's record must exist, be active, and
 * not be inside the closure grace window. The record decides, not the token (Principle IV).
 */
async function resolveActiveCustomerId(sub: string): Promise<string> {
  const row = await findByCognitoSub(sub);
  if (!row) throw new CustomerNotFoundError();
  if (row.status !== "active" || row.closure_state === "closing") throw new CustomerBarredError();
  return row.id;
}

export function createPointsService(deps: { db?: Queryable; now?: () => Date } = {}) {
  const db = deps.db ?? pooled;
  const now = deps.now ?? (() => new Date());
  return {
    async balance(sub: string): Promise<PointsBalanceDTO> {
      const id = await resolveActiveCustomerId(sub);
      const s = await balanceSummary(db, id, now());
      return { points: s.usable, valueAmount: formatCents(s.valueCents), centsPerPoint: s.centsPerPoint, nextExpiry: s.nextExpiry };
    },

    async history(sub: string, cursor: string | undefined, limit: number): Promise<PointsHistoryPageDTO> {
      const id = await resolveActiveCustomerId(sub);
      // ⚠ NOT the staff read: no note, no author — the customer shape has nowhere to put them.
      const page = await history(db, id, { cursor, limit });
      return {
        entries: page.lines.map((l) => ({ ...l, at: l.at.toISOString() })),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },
  };
}

/** Module-scope singleton (ARCHITECTURE.md). */
export const pointsService = createPointsService();
