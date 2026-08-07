import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canRepairDelivery } from "./access";
import { RepairDialog } from "./components/RepairDialog";
import { StateLabel } from "./DeliverabilityListScreen";
import { STATE_MEANING } from "./model";
import { deliverabilityDetailQuery } from "./queries";

/**
 * One address's delivery history, and the repair (037 FR-033/FR-034).
 *
 * ⚠ NO CARDS (Principle V) — detail rows and a table, which is what an operator reading a history
 * actually wants.
 */
export function DeliverabilityDetailScreen({ address }: { address: string }) {
  const { data, isPending, isError, error, refetch } = useQuery(deliverabilityDetailQuery(address));
  const { data: session } = useQuery(sessionQuery);
  // Same shape the shops slice reads — the roles live on the identity, not on the session itself.
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const mayRepair = canRepairDelivery(roles);

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/deliverability" className="text-sm text-primary hover:underline">
          ← All delivery problems
        </Link>
        <h1 className="mt-2 font-mono text-xl font-semibold tracking-tight">{data.address}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{STATE_MEANING[data.state]}</p>
      </div>

      <dl className="divide-y divide-border border-y border-border">
        <Row label="State">
          <StateLabel state={data.state} />
        </Row>
        <Row label="Account">
          {data.subject ? (
            <>
              {data.subject.name ?? "unnamed"}{" "}
              <span className="text-muted-foreground">({data.subject.kind.replace("_", " ")})</span>
            </>
          ) : (
            // ⚠ The honest answer. See the list screen's note — the driver audience has no platform
            // record at all, so this is expected rather than broken.
            <span className="text-muted-foreground">
              No platform record owns this address
            </span>
          )}
        </Row>
        <Row label="Reason">
          <span className="font-mono text-xs">{data.reason ?? "—"}</span>
        </Row>
        <Row label="Server said">
          {/* ⚠ Operator-only, and never shown to the account owner. "smtp;550 5.1.1 user unknown" is
              written for a postmaster; on an account page it is noise at best. */}
          <span className="font-mono text-xs text-muted-foreground">{data.diagnostic ?? "—"}</span>
        </Row>
        <Row label="Blocked by the mail service">
          {/* ⚠ Read LIVE on every request, never stored — two stored sources of truth for one fact
              disagree eventually, and then nobody can tell which is lying. `null` means the check
              FAILED; it must never render as "no", which reads as "fine" and stops the search. */}
          {data.suppressedInSes === null ? (
            <span className="text-muted-foreground">Couldn&apos;t check just now</span>
          ) : data.suppressedInSes ? (
            <span className="font-medium text-destructive">
              Yes — sends to this address are accepted and silently dropped
            </span>
          ) : (
            <span>No</span>
          )}
        </Row>
        <Row label="Failures">
          {data.bounceCount} bounced · {data.complaintCount} reported as spam
        </Row>
        <Row label="Last event">
          {new Date(data.lastEventAt).toLocaleString()}
          {data.lastMessageId && (
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {data.lastMessageId}
            </span>
          )}
        </Row>
        {data.repairedAt && (
          <Row label="Last repaired">
            {new Date(data.repairedAt).toLocaleString()}{" "}
            <span className="font-mono text-xs text-muted-foreground">{data.repairedBy}</span>
          </Row>
        )}
      </dl>

      {mayRepair && data.state !== "reachable" && (
        <RepairDialog address={data.address} state={data.state} />
      )}

      <section>
        <h2 className="text-lg font-semibold">History</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 font-medium">When</th>
              <th className="py-2 font-medium">Outcome</th>
              <th className="py-2 font-medium">Detail</th>
              <th className="py-2 font-medium">Template</th>
              <th className="py-2 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {data.events.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-muted-foreground">
                  No events recorded.
                </td>
              </tr>
            )}
            {data.events.map((e) => (
              <tr key={`${e.messageId}-${e.eventType}`} className="border-b border-border">
                <td className="py-2">{new Date(e.occurredAt).toLocaleString()}</td>
                <td className="py-2">{e.eventType.replace("_", " ")}</td>
                <td className="py-2 font-mono text-xs">{e.subType ?? "—"}</td>
                {/* ⚠ A null template is an ANSWER, not a gap: Cognito sends cannot be tagged. Say so
                    plainly rather than rendering blank, which would read as missing data. */}
                <td className="py-2 font-mono text-xs">
                  {e.templateId ?? <span className="text-muted-foreground">Cognito / pre-038</span>}
                </td>
                <td className="py-2 font-mono text-xs text-muted-foreground">{e.messageId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm">{children}</dd>
    </div>
  );
}
