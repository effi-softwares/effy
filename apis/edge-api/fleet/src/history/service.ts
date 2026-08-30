// Work-history use-cases (056 US5).
import type {
  DriverHistoryResponse,
  DriverProofResponse,
  DriverRunDetail,
} from "@effy/shared-types";

import { recordAudit } from "../shared/audit";
import { notFound } from "../shared/errors";
import * as repo from "./repository";

/** Default reporting window when the caller names none: the last 30 days, inclusive. */
function defaultRange(from?: string, to?: string): { from: string; to: string } {
  const today = new Date();
  const end = to ?? today.toISOString().slice(0, 10);
  const startDate = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: from ?? startDate.toISOString().slice(0, 10), to: end };
}

export async function readHistory(params: {
  driverId: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}): Promise<DriverHistoryResponse> {
  const range = defaultRange(params.from, params.to);
  const [page, summary] = await Promise.all([
    repo.listRuns({ ...params, from: range.from, to: range.to }),
    repo.periodSummary(params.driverId, range.from, range.to),
  ]);
  return { items: page.items, nextCursor: page.nextCursor, summary };
}

export async function readRun(runId: string): Promise<DriverRunDetail> {
  const detail = await repo.getRunDetail(runId);
  if (!detail) throw notFound("run not found");
  return detail;
}

/**
 * Proof for one drop (FR-041, FR-042).
 *
 * ⚠ Issuing the presigned URL is AUDITED. The audit records the MINTING, not the fetching — a URL
 * issued and never opened still logs one row. That is the honest limit of presigning, and it is
 * stated here rather than left for someone to discover from an audit trail that quietly means
 * something other than what it says.
 */
export async function readProof(
  deliveryTaskId: string,
  actorSub: string,
): Promise<DriverProofResponse> {
  const proof = await repo.getProof(deliveryTaskId);
  if (!proof) throw notFound("no proof of delivery was captured for this drop");

  await recordAudit({
    actorSub,
    action: "driver.proof.viewed",
    driverId: proof.capturedByDriverId,
    detail: {
      changed: [],
      values: { deliveryTaskId, method: proof.method, mediaIssued: proof.mediaUrl !== null },
    },
  });
  return proof;
}
