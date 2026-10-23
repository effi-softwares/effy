// The reads are @effy/edge-shared/points, the same as back-office's.
import { formatCents, pooled, type Queryable } from "@effy/edge-shared";
import { balanceSummary, history } from "@effy/edge-shared/points";
import type { CustomerPointsDTO } from "@effy/shared-types";

import { findByCognitoSub } from "../customer/repo";
import { CustomerBarredError, CustomerNotFoundError } from "../customer/service";

/** The record must exist, be active and not be closing. */
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
    /** `cursor` pages the history; the balance is always current. */
    async overview(sub: string, cursor: string | undefined, limit: number): Promise<CustomerPointsDTO> {
      const id = await resolveActiveCustomerId(sub);
      const at = now();
      // Not the staff read: no note, no author.
      const [s, page] = await Promise.all([balanceSummary(db, id, at), history(db, id, { cursor, limit })]);
      return {
        points: s.usable, valueAmount: formatCents(s.valueCents), centsPerPoint: s.centsPerPoint, nextExpiry: s.nextExpiry,
        history: {
          entries: page.lines.map((l) => ({ ...l, at: l.at.toISOString() })),
          ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        },
      };
    },
  };
}

export const pointsService = createPointsService();
