import { useQuery } from "@tanstack/react-query"
import { Gauge, Pencil, ShieldCheck, Snowflake, Truck, UserRound } from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@effy/design-system/ui"
import { ActivityButton, ActivityLogDrawer } from "@effy/web-kit/activity-log"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"
import type { VehicleDetail } from "@effy/shared-types"

import {
  Bone,
  Callout,
  DetailPageSkeleton,
  DetailRows,
  DetailRowsSkeleton,
  PageHeader,
  Panel,
  PanelSkeleton,
  StatusWord,
} from "@effy/web-kit/patterns"
import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { api } from "@/lib/api"

import { HoldingControl } from "./components/HoldingControl"
import { VehicleEditForm } from "./components/VehicleEditForm"
import { VehicleStatusControl } from "./components/VehicleStatusControl"
import { canManageVehicles } from "./access"
import {
  BODY_TYPE_LABEL,
  COMPLIANCE_LABEL,
  formatDate,
  formatOdometer,
  FUEL_TYPE_LABEL,
  OWNERSHIP_LABEL,
  refrigerationLabel,
  STATUS_LABEL,
  STATUS_MEANING,
} from "./model"
import { vehicleDetailQuery, vehicleKeys } from "./queries"
import { vehicleStatusTone } from "./VehiclesListScreen"

const dash = <span className="text-muted-foreground">—</span>

function inDays(iso: string | null): string | null {
  if (!iso) return null
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000)
  if (Number.isNaN(days)) return null
  return days < 0 ? "Expired" : `${days} ${days === 1 ? "day" : "days"}`
}

export function VehicleDetailScreen({ vehicleId }: { vehicleId: string }) {
  const roles = useSessionRoles()
  const canManage = canManageVehicles(roles)
  const query = useQuery(vehicleDetailQuery(vehicleId))
  useHeaderDetail(query.data?.registrationPlate ?? null)

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <VehicleSkeleton />

  const v: VehicleDetail = query.data
  const regDays = inDays(v.registrationExpiresOn)

  return (
    <>
      <PageHeader
        back={{ label: "All vehicles", link: { to: "/vehicles" } }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{v.registrationPlate}</span>
            <StatusWord tone={vehicleStatusTone(v.status)}>{STATUS_LABEL[v.status]}</StatusWord>
          </span>
        }
        meta={
          <>
            <span>
              <Truck aria-hidden="true" />
              {v.make} {v.model} · {BODY_TYPE_LABEL[v.bodyType]} · {OWNERSHIP_LABEL[v.ownership]}
            </span>
            <span>
              <Snowflake aria-hidden="true" />
              {refrigerationLabel(v.canCarryChilled, v.canCarryFrozen)}
            </span>
          </>
        }
        actions={<ActivityButton />}
      />

      {v.complianceIssues.length > 0 ? (
        <Callout
          tone="destructive"
          title={v.complianceIssues.map((i) => COMPLIANCE_LABEL[i]).join(" · ")}
          role="status"
        >
          Its driver cannot be given work until it is put right. Record the new date under Compliance.
        </Callout>
      ) : null}

      <div className="ef-detail">
        <div className="ef-detail__main">
          <Tabs defaultValue="details">
            <div className="ef-tabsbar">
              <div className="ef-tabsbar__list">
                <TabsList aria-label="Vehicle sections">
                  <TabsTrigger value="details">
                    <Gauge aria-hidden="true" />
                    Details
                  </TabsTrigger>
                  {canManage ? (
                    <TabsTrigger value="edit">
                      <Pencil aria-hidden="true" />
                      Edit details
                    </TabsTrigger>
                  ) : null}
                </TabsList>
              </div>
            </div>
            <TabsContent value="details" className="ef-tabpanel">
              <Panel title="Details" icon={<Truck aria-hidden="true" />}>
                <DetailRows
                  rows={[
                    {
                      label: "Status",
                      value: (
                        <>
                          {STATUS_LABEL[v.status]}{" "}
                          <span className="text-muted-foreground">{STATUS_MEANING[v.status]}</span>
                        </>
                      ),
                    },
                    { label: "Reason", value: v.statusReason ?? dash },
                    { label: "Year", value: v.year ?? dash },
                    { label: "Fuel", value: v.fuelType ? FUEL_TYPE_LABEL[v.fuelType] : dash },
                    { label: "Carries", value: refrigerationLabel(v.canCarryChilled, v.canCarryFrozen) },
                    { label: "Payload", value: v.payloadKg ? `${v.payloadKg.toLocaleString("en-AU")} kg` : dash },
                    {
                      label: "Load volume",
                      value: v.loadVolumeLitres ? `${v.loadVolumeLitres.toLocaleString("en-AU")} L` : dash,
                    },
                    { label: "Crates", value: v.crateCapacity ?? dash },
                    { label: "Odometer", value: formatOdometer(v.odometerKm) },
                    { label: "Notes", value: v.notes ?? dash },
                  ]}
                />
              </Panel>
            </TabsContent>
            {canManage ? (
              <TabsContent value="edit" className="ef-tabpanel">
                <Panel title="Edit details" icon={<Pencil aria-hidden="true" />}>
                  <VehicleEditForm vehicle={v} />
                </Panel>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <aside className="ef-detail__aside is-first">
          <Panel title="Who has it" icon={<UserRound aria-hidden="true" />}>
            {canManage ? (
              <HoldingControl vehicle={v} />
            ) : v.currentHolderDriverId ? (
              <p className="text-sm">Out with {v.currentHolderName}.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Available — nobody has this vehicle.</p>
            )}
          </Panel>
          <Panel title="Compliance" icon={<ShieldCheck aria-hidden="true" />}>
            <DetailRows
              tight
              rows={[
                {
                  label: "Registration",
                  value: (
                    <>
                      {formatDate(v.registrationExpiresOn)}
                      {regDays ? <div className="mt-0.5 block text-sm text-muted-foreground">{regDays}</div> : null}
                    </>
                  ),
                },
                {
                  label: "Insurance",
                  value: (
                    <>
                      {v.insurancePolicyReference ?? dash}
                      {v.insuranceExpiresOn ? (
                        <div className="mt-0.5 block text-sm text-muted-foreground">
                          Expires {formatDate(v.insuranceExpiresOn)}
                        </div>
                      ) : null}
                    </>
                  ),
                },
                { label: "Roadworthy", value: formatDate(v.roadworthyExpiresOn) },
              ]}
            />
          </Panel>
          {canManage ? (
            <Panel title="Status">
              <div className="space-y-3">
                <p className="mt-0.5 block text-sm text-muted-foreground">
                  Off the road is temporary — in the workshop, or awaiting repair. Retired is for good.
                </p>
                <VehicleStatusControl vehicle={v} />
              </div>
            </Panel>
          ) : null}
        </aside>
      </div>
      <ActivityLogDrawer
        app="back-office"
        log="bo-vehicle"
        title="Vehicle activity"
        description={`${v.registrationPlate} — who had it and when, changes to it, and cleared checks.`}
        api={api}
        path={`/fleet/v1/vehicles/${v.id}/activity`}
        queryKey={vehicleKeys.detail(v.id)}
        fileName={`vehicle-${v.registrationPlate}-activity`}
      />
    </>
  )
}

function VehicleSkeleton() {
  return (
    <DetailPageSkeleton
      back={{ label: "All vehicles", link: { to: "/vehicles" } }}
      actions={1}
      asideFirst
      tabs={[
        <>
          <Gauge aria-hidden="true" />
          Details
        </>,
      ]}
      main={
        <PanelSkeleton title="Details" icon={<Truck aria-hidden="true" />}>
          <DetailRowsSkeleton
            labels={[
              "Status",
              "Reason",
              "Year",
              "Fuel",
              "Carries",
              "Payload",
              "Load volume",
              "Crates",
              "Odometer",
              "Notes",
            ]}
          />
        </PanelSkeleton>
      }
      aside={
        <>
          <PanelSkeleton title="Who has it" icon={<UserRound aria-hidden="true" />}>
            <Bone className="w-3/4" />
          </PanelSkeleton>
          <PanelSkeleton title="Compliance" icon={<ShieldCheck aria-hidden="true" />}>
            <DetailRowsSkeleton tight labels={["Registration", "Insurance", "Roadworthy"]} />
          </PanelSkeleton>
        </>
      }
    />
  )
}
