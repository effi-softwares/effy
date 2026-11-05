import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Route, Search } from "lucide-react"

import { Button } from "@effy/design-system/ui"
import { Kbd, PageHeader } from "@effy/web-kit/patterns"
import { useTourPage } from "@effy/web-kit/tour"

import { displayName } from "@/components/shell/identity"
import { sessionQuery } from "@/features/auth/queries"
import { setCommandPaletteOpen } from "@/lib/ui-store"

import { DayLine } from "./DayLine"
import { NeedsAttention } from "./NeedsAttention"
import { OnDuty } from "./OnDuty"
import { OrdersToday } from "./OrdersToday"
import { dateLine, greeting } from "./overviewFormat"
import { PackageFlow } from "./PackageFlow"
import { overviewRunsQuery } from "./queries"
import { CourierParcels, FleetReadiness, ShopsBehind, Shortcuts } from "./SidePanels"
import { StatusBrief } from "./StatusBrief"
import { useNow } from "./useNow"
import { useOverview } from "./useOverview"

/**
 * Three questions in order: are we OK (one sentence), what needs me (a ranked list), how is the day going (one
 * timeline). Grey until something is wrong. Every figure is re-read when the live channel says it changed.
 */
export function OverviewScreen() {
  const session = useQuery(sessionQuery)
  const email = session.data?.status === "signed-in" ? session.data.identity.email : ""
  const first = displayName(email).split(" ")[0] ?? ""
  const now = useNow()
  const o = useOverview(now)
  const runs = useQuery(overviewRunsQuery())
  useTourPage("overview", { status: "ready" })

  return (
    <div className="ef-board">
      <PageHeader
        title={first ? `${greeting()}, ${first}` : greeting()}
        description={`${dateLine.format(new Date(now))} · What needs attention now, and how today's deliveries are going.`}
        actions={
          <>
            <Button data-tour="overview.find" variant="outline" onClick={() => setCommandPaletteOpen(true)}>
              <Search aria-hidden="true" />
              Find an order
              <Kbd>⌘K</Kbd>
            </Button>
            <Button asChild>
              <Link to="/orders/assignments">
                <Route aria-hidden="true" />
                Open dispatch
              </Link>
            </Button>
          </>
        }
      />

      <StatusBrief brief={o.brief} coming={o.coming} nowH={o.nowH} />

      <div className="ef-board-layout">
        <div className="ef-board-main">
          <DayLine now={now} runs={o.runs} />
          <PackageFlow />
          <OrdersToday nowH={o.nowH} />
          <div className="grid items-start gap-x-10 gap-y-9 md:grid-cols-2 max-[1359px]:contents">
            <CourierParcels />
            <ShopsBehind runs={o.runs} failed={runs.isError} />
          </div>
          <div className="grid items-start gap-x-10 gap-y-9 md:grid-cols-2 max-[1359px]:contents">
            <FleetReadiness />
            <Shortcuts />
          </div>
        </div>
        <div className="ef-board-rail">
          <NeedsAttention rows={o.rows} />
          <OnDuty unsafe={o.unsafe} waiting={o.waiting} />
        </div>
      </div>
    </div>
  )
}
