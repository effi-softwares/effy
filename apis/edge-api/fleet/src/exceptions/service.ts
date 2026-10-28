import { likePattern, limitOffsetClause, offsetListPage, orderBy, query, runOffsetPage, withTransaction } from "@effy/edge-shared";
import { EXCEPTION_OUTCOMES } from "@effy/shared-types";
import type {
  ExceptionOutcome,
  DeliveryExceptionDTO,
  DeliveryExceptionListDTO,
  DeliveryFailureReason,
  ResolveExceptionResponse,
} from "@effy/shared-types";

import { heldPackages, overdueRuns, vehicleChecksToday } from "../sequence/service";
import { recordAudit } from "../shared/audit";
import { EXCEPTION_LIST, type ExceptionListRequest } from "./list";
import { EXCEPTION_BY_ID, EXCEPTION_FILTERS, LIST_EXCEPTIONS, RESOLVE_EXCEPTION } from "./sql";

export class ExceptionNotFoundError extends Error {
  constructor() {
    super("exception not found");
    this.name = "ExceptionNotFoundError";
  }
}

interface ExceptionRow {
  exception_id: string;
  stop_id: string;
  reason: DeliveryFailureReason;
  note: string | null;
  failed_at: Date | string;
  resolved_at: Date | string | null;
  resolution_outcome: ExceptionOutcome | null;
  resolution_note: string | null;
  driver_id: string;
  driver_name: string;
  order_number: string;
  destination_suburb: string | null;
  package_location: "with_driver" | "at_hub";
  round_id: string;
  returned_at: Date | string | null;
}

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

/**
 * The exceptions board: one page of failed deliveries (open by default — records are never deleted), the
 * open count, and what else needs a dispatcher.
 */
export async function listExceptions(req: ExceptionListRequest): Promise<DeliveryExceptionListDTO> {
  const view = req.filters.view ?? "open";
  const [page, open] = await Promise.all([
    runOffsetPage(req, async (read) => {
      const args: unknown[] = [view, req.q ? likePattern(req.q) : null];
      const paging = limitOffsetClause(read, args);
      const r = await query<ExceptionRow & { full_count: string }>(
        `${LIST_EXCEPTIONS.replace("SELECT f.id ", "SELECT count(*) OVER () AS full_count, f.id ")}
         ${EXCEPTION_FILTERS}
         ${orderBy(EXCEPTION_LIST, req)}
         ${paging}`,
        args,
      );
      return r.rows;
    }),
    query<{ n: number }>(`SELECT count(*)::int AS n FROM public.delivery_attempt_failure WHERE resolved_at IS NULL`),
  ]);

  const exceptions: DeliveryExceptionDTO[] = page.rows.map((r) => ({
    exceptionId: r.exception_id,
    stopId: r.stop_id,
    orderNumber: r.order_number,
    reason: r.reason,
    note: r.note,
    driverId: r.driver_id,
    driverName: r.driver_name,
    destinationSuburb: r.destination_suburb,
    failedAt: iso(r.failed_at),
    resolvedAt: r.resolved_at ? iso(r.resolved_at) : null,
    packageLocation: r.package_location,
    roundId: r.round_id,
    returnedAt: r.returned_at ? iso(r.returned_at) : null,
    resolution: r.resolved_at ? { outcome: r.resolution_outcome, note: r.resolution_note } : null,
  }));

  // What else needs a dispatcher: missing packages, overdue steps, unsafe vehicles.
  const [held, overdue, vehicleChecks] = await Promise.all([heldPackages(), overdueRuns(), vehicleChecksToday()]);

  return {
    exceptions: offsetListPage(exceptions, req, page),
    openCount: open.rows[0]?.n ?? 0,
    held,
    overdue,
    vehicleChecks,
  };
}

/**
 * Resolving asserts something about the physical world, so it is gated and audited (in the same
 * transaction, through the shared writer).
 */
export class ExceptionOutcomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExceptionOutcomeError";
  }
}

export async function resolveException(
  exceptionId: string,
  actorSub: string,
  note: string | null,
  outcome: ExceptionOutcome | null = null,
): Promise<ResolveExceptionResponse> {
  if (outcome !== null && !EXCEPTION_OUTCOMES.includes(outcome)) throw new ExceptionOutcomeError("outcome is redelivered, refunded, collected or other");
  // "Other" needs words for the next person.
  if (outcome === "other" && !note) throw new ExceptionOutcomeError("Say what happened when the outcome is Other.");
  if (note !== null && note.length > 500) throw new ExceptionOutcomeError("Keep the note to 500 characters.");
  return withTransaction(async (tx: any) => {
    const updated = await tx.query(RESOLVE_EXCEPTION, [exceptionId, outcome, note]);

    if (updated.rowCount === 0) {
      // Missing or already closed, answered alike: a second resolve never overwrites the first person's name.
      const existing = await tx.query(EXCEPTION_BY_ID, [exceptionId]);
      if (existing.rowCount === 0) throw new ExceptionNotFoundError();
      return {
        exceptionId,
        resolvedAt: iso(existing.rows[0].resolved_at),
      };
    }

    await recordAudit(
      {
        actorSub,
        action: "dispatch.exception_resolve",
        driverId: exceptionId,
        targetType: "delivery_exception",
        // The operator's note is recorded; the driver's is not (it may name a person or property).
        detail: { noteProvided: note !== null, outcome },
      },
      tx,
    );

    return { exceptionId, resolvedAt: iso(updated.rows[0].resolved_at) };
  });
}
