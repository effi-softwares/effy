// Reading and closing delivery exceptions (064, US3).

import { query, withTransaction } from "@effy/edge-shared";
import type {
  DeliveryExceptionDTO,
  DeliveryExceptionListDTO,
  DeliveryFailureReason,
  ResolveExceptionResponse,
} from "@effy/shared-types";

import { recordAudit } from "../shared/audit";
import { EXCEPTION_BY_ID, LIST_EXCEPTIONS, RESOLVE_EXCEPTION } from "./sql";

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
  driver_id: string;
  driver_name: string;
  order_number: string;
  destination_suburb: string | null;
  package_location: "with_driver" | "at_hub";
}

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

/**
 * Every delivery that could not be completed (FR-019).
 *
 * @param includeResolved false (the default) shows only what still needs a decision — FR-022's
 *        "leaves the list once resolved". The record itself is never deleted and stays retrievable.
 */
export async function listExceptions(includeResolved = false): Promise<DeliveryExceptionListDTO> {
  const res = await query<ExceptionRow>(LIST_EXCEPTIONS, [includeResolved]);

  const exceptions: DeliveryExceptionDTO[] = res.rows.map((r) => ({
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
  }));

  return {
    exceptions,
    openCount: exceptions.filter((e) => e.resolvedAt === null).length,
  };
}

/**
 * Close an exception (FR-021, FR-022).
 *
 * ⚠ RESOLVING IS AN ASSERTION ABOUT THE PHYSICAL WORLD, which is why it is gated to staff who may
 * change an order's fate and why it is audited. No query can know that a package came back to the
 * hub, went out again or was written off — a person decided that, and the audit row is the only
 * record there will ever be of who and when.
 *
 * ⚠ The audit write shares the transaction with the change, and goes through the SHARED helper. 063
 * nearly added a second audit writer and would have skipped the PII redaction with it (Principle II).
 */
export async function resolveException(
  exceptionId: string,
  actorSub: string,
  note: string | null,
): Promise<ResolveExceptionResponse> {
  return withTransaction(async (tx: any) => {
    const updated = await tx.query(RESOLVE_EXCEPTION, [exceptionId]);

    if (updated.rowCount === 0) {
      // Either it does not exist, or somebody already closed it. Both are answered the same way: the
      // caller re-reads the list and sees the truth, and a second resolve never overwrites the first
      // person's name with a later one.
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
        // ⚠ The operator's note is recorded; the DRIVER'S note is not. That one is free text typed at
        // a doorstep and may name a person or a property (FR-028, 050's no-PII rule). The reason is
        // a closed-set value and is safe.
        detail: { noteProvided: note !== null },
      },
      tx,
    );

    return { exceptionId, resolvedAt: iso(updated.rows[0].resolved_at) };
  });
}
