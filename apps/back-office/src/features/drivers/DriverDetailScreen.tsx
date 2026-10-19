import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, Car, History, IdCard, Mail, Pencil, ShieldCheck, Truck, UserRound, Warehouse } from "lucide-react";

import { Button, Skeleton, Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";
import type { AdminDriverProfile } from "@effy/shared-types";

import { PageHeader } from "@/components/patterns/Page";
import { DetailRows, Panel } from "@/components/patterns/Panel";
import { ResponsiveSheet } from "@/components/patterns/ResponsiveSheet";
import { Callout } from "@/components/patterns/States";
import { DotWord, StatusWord } from "@/components/patterns/StatusWord";
import { initialsOf } from "@/components/shell/identity";
import { useHeaderDetail } from "@/components/shell/SiteHeader";
import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { AuditTrail } from "./components/AuditTrail";
import { CapabilityEditor } from "./components/CapabilityEditor";
import { ProfileEditForm } from "./components/ProfileEditForm";
import { StatusControl } from "./components/StatusControl";
import { canManageDrivers } from "./access";
import { BLOCKED_LABEL, formatDate, formatDateTime, STATUS_LABEL, STATUS_MEANING } from "./model";
import { driverDetailQuery } from "./queries";

/**
 * The driver's profile of record (056 US1; redesign, board "Driver profile"): a head with who they
 * are and where they stand, the record in tabs (Profile · Clearances · Change history), and their
 * employment and today on the right. Sectioned detail rows — no cards, no metric tiles.
 */

const dash = <span className="text-muted-foreground">—</span>;

function statusTone(s: AdminDriverProfile["status"]) {
  return s === "active" ? "done" : s === "suspended" ? "problem" : "quiet";
}

function daysUntil(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  if (Number.isNaN(days)) return null;
  if (days < 0) return "Expired";
  if (days === 0) return "Today";
  return `In ${days} ${days === 1 ? "day" : "days"}`;
}

export function DriverDetailScreen({ driverId }: { driverId: string }) {
  const roles = useSessionRoles();
  const canManage = canManageDrivers(roles);
  const [editing, setEditing] = useState(false);

  const { data, error, isPending, isError, refetch } = useQuery(driverDetailQuery(driverId));
  useHeaderDetail(data?.name ?? null);

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  const d: AdminDriverProfile = data;
  const onDuty = d.dutyState === "on_duty";
  const expiry = daysUntil(d.credentials.licenceExpiresOn);

  return (
    <>
      <PageHeader
        back={{ label: "All drivers", link: { to: "/drivers" } }}
        title={
          <span className="flex items-center gap-3">
            <span className="bo-avatar bo-avatar--lg bo-avatar--blue" aria-hidden="true">
              {initialsOf(d.name)}
            </span>
            <span className="min-w-0">
              {d.name}
              <span className="mt-1 flex flex-wrap items-center gap-3 text-sm font-normal">
                <StatusWord tone={statusTone(d.status)}>{STATUS_LABEL[d.status]}</StatusWord>
                {onDuty ? <DotWord tone="busy">on duty now</DotWord> : <DotWord tone="off">off duty</DotWord>}
              </span>
            </span>
          </span>
        }
        meta={
          <>
            <span>
              <Mail aria-hidden="true" />
              {d.workEmail}
            </span>
            {d.hub ? (
              <span>
                <Warehouse aria-hidden="true" />
                Hub · {d.hub}
              </span>
            ) : null}
            {d.vehicle.plate ? (
              <span>
                <Truck aria-hidden="true" />
                <span className="bo-code">{d.vehicle.plate}</span>
                {d.vehicle.type ? ` · ${d.vehicle.type}` : ""}
              </span>
            ) : null}
          </>
        }
        actions={
          canManage ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" />
              Edit profile
            </Button>
          ) : null
        }
      />

      {/* ⚠ FR-044/SC-009 — stated at the top of the record, in words, with the remedy implied. */}
      {d.blockedReasons.length > 0 ? (
        <Callout tone="destructive" title="This driver cannot be given work.">
          {d.blockedReasons.map((r) => BLOCKED_LABEL[r]).join(" · ")}
        </Callout>
      ) : null}

      {/* ⚠ THE HALF-PROVISIONED DRIVER. Creating a driver writes to two systems and cannot be atomic;
          the profile must SHOW a half rather than render a half-working driver as normal. */}
      {d.accountState !== "ok" ? (
        <Callout tone="destructive" title="This driver is only half set up.">
          {d.accountState === "record_only"
            ? "There is a record but no sign-in account, so they cannot use the driver app. This needs fixing outside the console."
            : "There is a sign-in account with no record behind it."}
        </Callout>
      ) : null}

      <div className="bo-detail">
        <div className="bo-detail__main">
          <Tabs defaultValue="profile">
            <div className="bo-tabsbar">
              <div className="bo-tabsbar__list">
                <TabsList aria-label="Driver sections">
                  <TabsTrigger value="profile">
                    <UserRound aria-hidden="true" />
                    Profile
                  </TabsTrigger>
                  <TabsTrigger value="clearances">
                    <ShieldCheck aria-hidden="true" />
                    Clearances
                    <TabsCount>{d.capabilities.length}</TabsCount>
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History aria-hidden="true" />
                    Change history
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="profile" className="bo-tabpanel">
              <Panel title="Identity and contact" icon={<IdCard aria-hidden="true" />}>
                <DetailRows
                  rows={[
                    { label: "Name", value: d.name },
                    {
                      label: "Work email",
                      value: (
                        <>
                          {d.workEmail}
                          <div className="bo-sub">The sign-in identity. It cannot be changed here.</div>
                        </>
                      ),
                    },
                    { label: "Phone", value: d.contactPhone ?? dash },
                    {
                      label: "Emergency contact",
                      value:
                        d.emergencyContact.name || d.emergencyContact.phone
                          ? [d.emergencyContact.name, d.emergencyContact.phone].filter(Boolean).join(" · ")
                          : dash,
                    },
                  ]}
                />
              </Panel>
              <Panel title="Work assignment" icon={<Car aria-hidden="true" />}>
                {/* ⚠ 061: the vehicle is the one the driver is CURRENTLY HOLDING (the open holding row). */}
                <DetailRows
                  rows={[
                    { label: "Hub", value: d.hub ?? dash },
                    {
                      label: "Vehicle",
                      value: d.vehicle.type ? (
                        <>
                          {d.vehicle.type}
                          {d.vehicle.plate ? ` · ${d.vehicle.plate}` : ""}
                          <div className="bo-sub">Issued from the vehicle's record</div>
                        </>
                      ) : (
                        <>
                          {dash}
                          <div className="bo-sub">
                            Issue one from a{" "}
                            <Link to="/vehicles" className="bo-link">
                              vehicle's record
                            </Link>
                            .
                          </div>
                        </>
                      ),
                    },
                    { label: "Registration plate", value: d.vehicle.plate ? <span className="bo-code">{d.vehicle.plate}</span> : dash },
                    { label: "Licence", value: d.credentials.licenceReference ?? dash },
                    { label: "Licence class", value: d.credentials.licenceClass ?? dash },
                    {
                      label: "Licence expires",
                      value: d.credentials.licenceExpiresOn ? (
                        <>
                          {formatDate(d.credentials.licenceExpiresOn)}
                          {expiry ? <div className="bo-sub">{expiry}</div> : null}
                        </>
                      ) : (
                        dash
                      ),
                    },
                  ]}
                />
              </Panel>
            </TabsContent>

            <TabsContent value="clearances" className="bo-tabpanel">
              {/* ⚠ 062 — what this driver may actually do: one row per (function, area). */}
              <Panel title="Cleared for" icon={<BadgeCheck aria-hidden="true" />} description="Each clearance is one kind of work in one area, or everywhere.">
                <CapabilityEditor driverId={driverId} />
              </Panel>
            </TabsContent>

            <TabsContent value="history" className="bo-tabpanel">
              <Panel title="Change history" icon={<History aria-hidden="true" />} description="Who changed what, newest first.">
                <AuditTrail driverId={driverId} />
              </Panel>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="bo-detail__aside">
          <Panel title="Employment">
            <div className="space-y-4">
              <div>
                <StatusWord tone={statusTone(d.status)}>{STATUS_LABEL[d.status]}</StatusWord>
                <p className="bo-sub mt-1.5">{STATUS_MEANING[d.status]}</p>
              </div>
              <DetailRows
                tight
                rows={[
                  { label: "Since", value: formatDateTime(d.statusChangedAt) },
                  { label: "Reason", value: d.statusReason ?? dash },
                  { label: "Started on", value: formatDate(d.startedOn) },
                  { label: "Notes", value: d.notes ?? dash },
                ]}
              />
              {canManage ? <StatusControl driver={d} /> : null}
            </div>
          </Panel>
          <Panel title="Today">
            <div className="space-y-3">
              {onDuty ? <StatusWord tone="moving">On duty</StatusWord> : <StatusWord tone="quiet">Off duty</StatusWord>}
              <p className="bo-sub">
                {onDuty ? "Signed in to the driver app and taking work." : "Not on duty. Work is offered once they start a shift."}
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/drivers">
                  All drivers
                </Link>
              </Button>
            </div>
          </Panel>
        </aside>
      </div>

      {canManage ? (
        <ResponsiveSheet open={editing} onOpenChange={setEditing} title="Edit profile" description={d.name} wide>
          <ProfileEditForm driver={d} onDone={() => setEditing(false)} />
        </ResponsiveSheet>
      ) : null}
    </>
  );
}
