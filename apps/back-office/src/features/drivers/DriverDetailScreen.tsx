import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Button } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";
import type { AdminDriverProfile } from "@effy/shared-types";

import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { AuditTrail } from "./components/AuditTrail";
import { ExceptionsList } from "./components/ExceptionsList";
import { ProfileEditForm } from "./components/ProfileEditForm";
import { StatusControl } from "./components/StatusControl";
import { WorkHistory } from "./components/WorkHistory";
import { canManageDrivers } from "./access";
import { BLOCKED_LABEL, formatDate, formatDateTime, STATUS_LABEL, STATUS_MEANING } from "./model";
import { driverDetailQuery } from "./queries";

/**
 * The driver's profile of record (056 US1, FR-006).
 *
 * ⚠ A SECTIONED PAGE OF DETAIL ROWS — no cards, no metric tiles (Principle V, no exception claimed).
 * Before this feature the closest thing that existed was five fields returned by an API with no
 * screen attached to it, so "the profile" had never actually been looked at by anybody.
 */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-4 border-b py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function DriverDetailScreen({ driverId }: { driverId: string }) {
  const roles = useSessionRoles();
  const canManage = canManageDrivers(roles);
  const [editing, setEditing] = useState(false);

  const { data, error, isPending, isError, refetch } = useQuery(driverDetailQuery(driverId));

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading driver…</p>;

  const d: AdminDriverProfile = data;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link to="/drivers" className="text-sm text-primary hover:underline">
          ← All drivers
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">{d.name}</h1>
            <p className="text-sm text-muted-foreground">
              {STATUS_LABEL[d.status]} · {d.dutyState === "on_duty" ? "on duty now" : "off duty"}
            </p>
          </div>
          {canManage && !editing ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit profile
            </Button>
          ) : null}
        </div>

        {/* ⚠ FR-044/SC-009 — stated at the top of the record, in words, with the remedy implied. */}
        {d.blockedReasons.length > 0 ? (
          <p className="border-l-2 border-foreground py-1 pl-3 text-sm">
            <span className="font-medium">This driver cannot be given work.</span>{" "}
            {d.blockedReasons.map((r) => BLOCKED_LABEL[r]).join(" · ")}
          </p>
        ) : null}

        {/* ⚠ THE HALF-PROVISIONED DRIVER. Creating a driver writes to two systems and cannot be
            atomic; if the second write fails, one half exists without the other. The profile must
            SHOW that rather than rendering a half-working driver as normal — an operator who cannot
            see it will keep trying actions that quietly do nothing. */}
        {d.accountState !== "ok" ? (
          <p className="border-l-2 border-destructive py-1 pl-3 text-sm">
            <span className="font-medium">This driver is only half set up.</span>{" "}
            {d.accountState === "record_only"
              ? "There is a record but no sign-in account, so they cannot use the driver app. This needs fixing outside the console."
              : "There is a sign-in account with no record behind it."}
          </p>
        ) : null}
      </div>

      {editing ? (
        <Section title="Edit profile">
          <ProfileEditForm driver={d} onDone={() => setEditing(false)} />
        </Section>
      ) : (
        <>
          <Section title="Identity and contact">
            <dl>
              <Row label="Name" value={d.name} />
              <Row label="Work email" value={d.workEmail} />
              <Row label="Phone" value={d.contactPhone} />
              <Row
                label="Emergency contact"
                value={
                  d.emergencyContact.name || d.emergencyContact.phone
                    ? [d.emergencyContact.name, d.emergencyContact.phone].filter(Boolean).join(" · ")
                    : null
                }
              />
            </dl>
          </Section>

          <Section title="Work assignment">
            <dl>
              <Row
                label="Delivery zone"
                value={d.zone ?? <span className="text-muted-foreground">Not assigned</span>}
              />
              <Row label="Hub" value={d.hub} />
              <Row label="Vehicle" value={d.vehicle.type} />
              <Row label="Registration plate" value={d.vehicle.plate} />
              <Row
                label="Registration expires"
                value={formatDate(d.credentials.vehicleRegistrationExpiresOn)}
              />
              <Row label="Licence" value={d.credentials.licenceReference} />
              <Row label="Licence expires" value={formatDate(d.credentials.licenceExpiresOn)} />
            </dl>
          </Section>

          <Section title="Employment">
            <dl>
              <Row
                label="Status"
                value={
                  <>
                    <span className="font-medium">{STATUS_LABEL[d.status]}</span>{" "}
                    <span className="text-muted-foreground">{STATUS_MEANING[d.status]}</span>
                  </>
                }
              />
              <Row label="Since" value={formatDateTime(d.statusChangedAt)} />
              <Row label="Reason" value={d.statusReason} />
              <Row label="Started on" value={formatDate(d.startedOn)} />
              <Row label="Notes" value={d.notes} />
            </dl>
            {canManage ? (
              <div className="pt-2">
                <StatusControl driver={d} />
              </div>
            ) : null}
          </Section>
        </>
      )}

      <Section title="Reports from the road">
        <ExceptionsList driverId={driverId} />
      </Section>

      <Section title="Work history">
        <WorkHistory driverId={driverId} />
      </Section>

      <Section title="Change history">
        <AuditTrail driverId={driverId} />
      </Section>
    </div>
  );
}
