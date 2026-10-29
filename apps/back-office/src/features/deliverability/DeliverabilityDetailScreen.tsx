import { useQuery } from "@tanstack/react-query"

import { ActivityButton, ActivityLogDrawer } from "@effy/web-kit/activity-log"
import { ErrorState } from "@effy/web-kit/console"

import {
  DetailRowsSkeleton,
  Loading,
  PageHeader,
  PageHeaderSkeleton,
  Panel,
  PanelSkeleton,
} from "@effy/web-kit/patterns"
import { api } from "@/lib/api"
import { moment } from "@/lib/format"

import { sessionQuery } from "@/features/auth/queries"

import { canRepairDelivery } from "./access"
import { RepairDialog } from "./components/RepairDialog"
import { StateLabel } from "./DeliverabilityListScreen"
import { STATE_MEANING } from "./model"
import { deliverabilityDetailQuery, ROOT } from "./queries"

export function DeliverabilityDetailScreen({ address }: { address: string }) {
  const { data, isPending, isError, error, refetch } = useQuery(deliverabilityDetailQuery(address))
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const mayRepair = canRepairDelivery(roles)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isPending) {
    return (
      <Loading>
        <PageHeaderSkeleton back={{ label: "All delivery problems", link: { to: "/deliverability" } }} actions={2} />
        <div className="max-w-220">
          <PanelSkeleton title="Address">
            <DetailRowsSkeleton tight labels={["State", "Account", "Reason", "Server said", "Since", "Last checked"]} />
          </PanelSkeleton>
        </div>
      </Loading>
    )
  }

  return (
    <>
      <PageHeader
        back={{ label: "All delivery problems", link: { to: "/deliverability" } }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="break-all">{data.address}</span>
            <StateLabel state={data.state} />
          </span>
        }
        description={STATE_MEANING[data.state]}
        actions={
          <>
            {mayRepair && data.state !== "reachable" ? (
              <RepairDialog address={data.address} state={data.state} />
            ) : null}
            <ActivityButton />
          </>
        }
      />

      {/* Its email events — every send the platform heard back about — are its activity (104). */}
      <div className="max-w-220">
        <Panel title="Address">
          <dl className="ef-dl ef-dl--tight">
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
                <span className="text-muted-foreground">No platform record owns this address</span>
              )}
            </Row>
            <Row label="Reason">
              <span className="font-mono text-xs">{data.reason ?? "—"}</span>
            </Row>
            <Row label="Server said">
              <span className="font-mono text-xs text-muted-foreground">{data.diagnostic ?? "—"}</span>
            </Row>
            <Row label="Blocked by the mail service">
              {data.suppressedInSes === null ? (
                <span className="text-muted-foreground">Couldn&apos;t check just now</span>
              ) : data.suppressedInSes ? (
                <span className="font-medium">Yes — sends to this address are accepted and silently dropped</span>
              ) : (
                <span>No</span>
              )}
            </Row>
            <Row label="Failures">
              {data.bounceCount} bounced · {data.complaintCount} reported as spam
            </Row>
            <Row label="Last event">
              {moment(data.lastEventAt)}
              {data.lastMessageId && (
                <span className="ml-2 font-mono text-xs text-muted-foreground">{data.lastMessageId}</span>
              )}
            </Row>
            {data.repairedAt && (
              <Row label="Last repaired">
                {moment(data.repairedAt)}{" "}
                <span className="font-mono text-xs text-muted-foreground">{data.repairedBy}</span>
              </Row>
            )}
          </dl>
        </Panel>
      </div>

      <ActivityLogDrawer
        app="back-office"
        log="bo-email"
        title="Email events"
        description={`${data.address} — every send the platform heard back about.`}
        api={api}
        path={`/admin/v1/deliverability/${encodeURIComponent(data.address)}/activity`}
        queryKey={[...ROOT, "detail", data.address]}
        fileName="email-events"
      />
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ef-dl__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
