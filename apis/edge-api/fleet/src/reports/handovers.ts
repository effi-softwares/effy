// How bags were handed over (scan / typed / by hand) overall, per shop and per driver; refused reads,
// missing bags, and exceptions per 1,000 hand-overs.
import type { HandoverMixDTO, HandoverReportDTO, ParcelMissingReason, ReadOutcome } from "@effy/shared-types";

import { validationError } from "../shared/errors";
import * as repo from "./repository";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 92;

const mix = (r: repo.MixRow): HandoverMixDTO => ({ scan: Number(r.scan), typed: Number(r.typed), manual: Number(r.manual) });
const total = (m: HandoverMixDTO) => m.scan + m.typed + m.manual;
/** Most not-scanned first: the shops and drivers to look at. */
const worstFirst = <T extends HandoverMixDTO>(xs: T[]) => xs.sort((a, b) => total(b) - b.scan - (total(a) - a.scan) || total(b) - total(a));

export async function handoverReport(from: string, to: string): Promise<HandoverReportDTO> {
  if (!DATE.test(from) || !DATE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    throw validationError("choose a period", [{ field: "from", message: "dates as yyyy-mm-dd" }]);
  }
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days < 0 || days > MAX_DAYS) {
    throw validationError("choose a period of up to three months", [{ field: "to", message: `0–${MAX_DAYS} days after from` }]);
  }

  const [o, shops, drivers, actors, refusedRows, missingRows, disagreements] = await Promise.all([
    repo.overall(from, to), repo.byShop(from, to), repo.byDriver(from, to), repo.byActor(from, to),
    repo.refused(from, to), repo.missing(from, to), repo.disagreements(from, to),
  ]);
  const overall = mix(o);
  const refused = refusedRows.map((r) => ({ outcome: r.outcome as ReadOutcome, surface: r.surface as HandoverReportDTO["refused"][number]["surface"], count: Number(r.count) }));
  const missing = missingRows.map((r) => ({ reason: r.reason as ParcelMissingReason, count: Number(r.count) }));
  // A repeat scan is harmless; every other refusal, and every bag declared missing, is an exception.
  const exceptions =
    refused.filter((r) => r.outcome !== "already_counted").reduce((a, r) => a + r.count, 0) + missing.reduce((a, r) => a + r.count, 0);
  const handovers = total(overall);

  return {
    from, to, overall,
    byShop: worstFirst(shops.map((r) => ({ shopId: r.key!, shopName: r.name ?? "", ...mix(r) }))),
    byDriver: worstFirst(drivers.map((r) => ({ driverId: r.key!, driverName: r.name ?? "", ...mix(r) }))),
    byActor: actors.map((r) => ({ actor: r.key as HandoverReportDTO["byActor"][number]["actor"], ...mix(r) })),
    refused, missing, exceptions,
    exceptionsPer1000: handovers === 0 ? null : Math.round((exceptions * 1000 * 10) / handovers) / 10,
    disagreements,
  };
}
