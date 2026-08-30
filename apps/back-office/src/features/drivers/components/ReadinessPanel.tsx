import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { BLOCKED_LABEL, formatDate } from "../model";
import { readinessQuery } from "../queries";

/**
 * The gaps, before an order is affected (US6, FR-044…FR-046).
 *
 * ⚠ SC-009 IS THE WHOLE POINT. A driver with no delivery zone is inert for assignment TODAY — the
 * assignment round will never pick them — and nothing anywhere said so. The symptom was an order
 * that did not move, hours later, in a place nobody was looking. Here it is a line on a list.
 *
 * ⚠ THREE LISTS, NOT THREE METRIC CARDS (Principle V). This is the single most card-shaped screen in
 * the feature and it takes no exception: each section states the gap and names who or what it is
 * about, which is what an operator needs to act.
 */
export function ReadinessPanel() {
  const { data, isPending } = useQuery(readinessQuery());

  if (isPending) return <p className="text-sm text-muted-foreground">Loading readiness…</p>;
  if (!data) return null;

  const uncovered = data.uncoveredZones.filter((z) => z.activeDrivers === 0);
  const nothingWrong =
    data.blocked.length === 0 && uncovered.length === 0 && data.expiring.length === 0;

  if (nothingWrong) {
    return (
      <p className="text-sm text-muted-foreground">
        Every driver can be given work, every zone has someone in it, and no licence or registration
        is close to expiring.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {data.blocked.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Drivers who cannot be given work</h3>
          <ul className="divide-y border-y">
            {data.blocked.map((b) => (
              <li key={b.driverId} className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm">
                <Link
                  to="/drivers/$driverId"
                  params={{ driverId: b.driverId }}
                  className="font-medium text-primary hover:underline"
                >
                  {b.driverName}
                </Link>
                <span className="text-muted-foreground">
                  {b.reasons.map((r) => BLOCKED_LABEL[r]).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {uncovered.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Zones with nobody in them</h3>
          <ul className="divide-y border-y">
            {uncovered.map((z) => (
              <li key={z.zoneId} className="py-2 text-sm">
                <span className="font-medium">{z.zoneName}</span>{" "}
                <span className="text-muted-foreground">
                  — no active driver is assigned to this zone
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.expiring.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Licences and registrations to renew</h3>
          <ul className="divide-y border-y">
            {data.expiring.map((e) => (
              <li
                key={`${e.driverId}:${e.kind}`}
                className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm"
              >
                <Link
                  to="/drivers/$driverId"
                  params={{ driverId: e.driverId }}
                  className="font-medium text-primary hover:underline"
                >
                  {e.driverName}
                </Link>
                <span>{e.kind === "licence" ? "Driving licence" : "Vehicle registration"}</span>
                <span className={e.expired ? "font-medium" : "text-muted-foreground"}>
                  {e.expired ? "expired" : "expires"} {formatDate(e.expiresOn)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
