import { useQuery } from "@tanstack/react-query";
import { Gauge, History, Pencil, ShieldCheck, Snowflake, Truck, UserRound } from "lucide-react";

import { Skeleton, Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";
import type { VehicleDetail } from "@effy/shared-types";

import { PageHeader } from "@/components/patterns/Page";
import { DetailRows, Panel } from "@/components/patterns/Panel";
import { Callout } from "@/components/patterns/States";
import { StatusWord } from "@/components/patterns/StatusWord";
import { useHeaderDetail } from "@/components/shell/SiteHeader";
import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { HoldingControl } from "./components/HoldingControl";
import { HoldingHistory } from "./components/HoldingHistory";
import { VehicleEditForm } from "./components/VehicleEditForm";
import { VehicleStatusControl } from "./components/VehicleStatusControl";
import { canManageVehicles } from "./access";
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
} from "./model";
import { vehicleDetailQuery } from "./queries";
import { vehicleStatusTone } from "./VehiclesListScreen";

/**
 * A vehicle's record (061 US1/US2; redesign, board "Vehicle record"): Details · Edit details ·
 * Handover history in tabs; who has it, compliance and status on the right. Sectioned detail rows
 * the same shape as the driver profile, no cards.
 */
const dash = <span className="text-muted-foreground">—</span>;

function inDays(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  if (Number.isNaN(days)) return null;
  return days < 0 ? "Expired" : `${days} ${days === 1 ? "day" : "days"}`;
}

export function VehicleDetailScreen({ vehicleId }: { vehicleId: string }) {
  const roles = useSessionRoles();
  const canManage = canManageVehicles(roles);
  const query = useQuery(vehicleDetailQuery(vehicleId));
  useHeaderDetail(query.data?.registrationPlate ?? null);

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  const v: VehicleDetail = query.data;
  const regDays = inDays(v.registrationExpiresOn);

  return (
    <>
      <PageHeader
        back={{ label: "All vehicles", link: { to: "/vehicles" } }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="bo-code">{v.registrationPlate}</span>
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
      />

      {/* Compliance is derived on read and names the lapsed item, because the remedy differs. */}
      {v.complianceIssues.length > 0 ? (
        <Callout tone="destructive" title={v.complianceIssues.map((i) => COMPLIANCE_LABEL[i]).join(" · ")} role="status">
          Its driver cannot be given work until it is put right. Record the new date under Compliance.
        </Callout>
      ) : null}

      <div className="bo-detail">
        <div className="bo-detail__main">
          <Tabs defaultValue="details">
            <div className="bo-tabsbar">
              <div className="bo-tabsbar__list">
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
                  <TabsTrigger value="history">
                    <History aria-hidden="true" />
                    Handover history
                    <TabsCount>{v.holdings.length}</TabsCount>
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
            <TabsContent value="details" className="bo-tabpanel">
              <Panel title="Details" icon={<Truck aria-hidden="true" />}>
                <DetailRows
                  rows={[
                    {
                      label: "Status",
                      value: (
                        <>
                          {STATUS_LABEL[v.status]} <span className="text-muted-foreground">{STATUS_MEANING[v.status]}</span>
                        </>
                      ),
                    },
                    { label: "Reason", value: v.statusReason ?? dash },
                    { label: "Year", value: v.year ?? dash },
                    { label: "Fuel", value: v.fuelType ? FUEL_TYPE_LABEL[v.fuelType] : dash },
                    { label: "Carries", value: refrigerationLabel(v.canCarryChilled, v.canCarryFrozen) },
                    { label: "Payload", value: v.payloadKg ? `${v.payloadKg.toLocaleString("en-AU")} kg` : dash },
                    { label: "Load volume", value: v.loadVolumeLitres ? `${v.loadVolumeLitres.toLocaleString("en-AU")} L` : dash },
                    { label: "Crates", value: v.crateCapacity ?? dash },
                    { label: "Odometer", value: formatOdometer(v.odometerKm) },
                    { label: "Notes", value: v.notes ?? dash },
                  ]}
                />
              </Panel>
            </TabsContent>
            {canManage ? (
              <TabsContent value="edit" className="bo-tabpanel">
                <Panel title="Edit details" icon={<Pencil aria-hidden="true" />}>
                  <VehicleEditForm vehicle={v} />
                </Panel>
              </TabsContent>
            ) : null}
            <TabsContent value="history" className="bo-tabpanel">
              <Panel title="Handover history" icon={<History aria-hidden="true" />} description="Every time it was issued and returned, newest first.">
                <HoldingHistory holdings={v.holdings} />
              </Panel>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="bo-detail__aside is-first">
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
                      {regDays ? <div className="bo-sub">{regDays}</div> : null}
                    </>
                  ),
                },
                {
                  label: "Insurance",
                  value: (
                    <>
                      {v.insurancePolicyReference ?? dash}
                      {v.insuranceExpiresOn ? <div className="bo-sub">Expires {formatDate(v.insuranceExpiresOn)}</div> : null}
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
                <p className="bo-sub">Off the road is temporary — in the workshop, or awaiting repair. Retired is for good.</p>
                <VehicleStatusControl vehicle={v} />
              </div>
            </Panel>
          ) : null}
        </aside>
      </div>
    </>
  );
}
