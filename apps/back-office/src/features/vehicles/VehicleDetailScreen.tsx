import { useQuery } from "@tanstack/react-query";

import { ErrorState } from "@effy/web-kit/console";
import type { VehicleDetail } from "@effy/shared-types";

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
} from "./model";
import { vehicleDetailQuery } from "./queries";

/**
 * A vehicle's record (061 US1/US2).
 *
 * ⚠ A SECTIONED PAGE OF DETAIL ROWS — no cards, no metric tiles (Principle V, no exception claimed).
 * The same shape the driver profile uses, because they are the same kind of screen: one entity, read
 * carefully by one person who came here with a specific question.
 */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 py-2">
      <dt className="w-48 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? "—"}</dd>
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

export function VehicleDetailScreen({ vehicleId }: { vehicleId: string }) {
  const roles = useSessionRoles();
  const canManage = canManageVehicles(roles);
  const query = useQuery(vehicleDetailQuery(vehicleId));

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (!query.data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const v: VehicleDetail = query.data;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tabular-nums">{v.registrationPlate}</h1>
        <p className="text-sm text-muted-foreground">
          {v.make} {v.model} · {BODY_TYPE_LABEL[v.bodyType]} · {OWNERSHIP_LABEL[v.ownership]}
        </p>
      </div>

      {/* ⚠ Compliance is DERIVED on read and NAMES the lapsed item, because the remedy differs:
          renew a registration, renew a policy, book an inspection. */}
      {v.complianceIssues.length > 0 ? (
        <p role="status" className="border-l-2 border-destructive py-1 pl-3 text-sm font-medium">
          {v.complianceIssues.map((i) => COMPLIANCE_LABEL[i]).join(" · ")}
        </p>
      ) : null}

      <Section title="Who has it">
        {canManage ? (
          <HoldingControl vehicle={v} />
        ) : v.currentHolderDriverId ? (
          <p className="text-sm">Out with {v.currentHolderName}.</p>
        ) : (
          <p className="text-sm text-muted-foreground">Available — nobody has this vehicle.</p>
        )}
      </Section>

      <Section title="Details">
        <dl className="divide-y">
          <Row label="Status" value={STATUS_LABEL[v.status]} />
          <Row label="Reason" value={v.statusReason} />
          <Row label="Year" value={v.year} />
          <Row label="Fuel" value={v.fuelType ? FUEL_TYPE_LABEL[v.fuelType] : null} />
          <Row label="Carries" value={refrigerationLabel(v.canCarryChilled, v.canCarryFrozen)} />
          <Row label="Payload" value={v.payloadKg ? `${v.payloadKg} kg` : null} />
          <Row label="Load volume" value={v.loadVolumeLitres ? `${v.loadVolumeLitres} L` : null} />
          <Row label="Crates" value={v.crateCapacity} />
          <Row label="Odometer" value={formatOdometer(v.odometerKm)} />
          <Row label="Notes" value={v.notes} />
        </dl>
      </Section>

      <Section title="Compliance">
        <dl className="divide-y">
          <Row label="Registration expires" value={formatDate(v.registrationExpiresOn)} />
          <Row label="Insurance policy" value={v.insurancePolicyReference} />
          <Row label="Insurance expires" value={formatDate(v.insuranceExpiresOn)} />
          <Row label="Roadworthy expires" value={formatDate(v.roadworthyExpiresOn)} />
        </dl>
      </Section>

      {canManage ? (
        <>
          <Section title="Edit">
            <VehicleEditForm vehicle={v} />
          </Section>
          <Section title="Status">
            <VehicleStatusControl vehicle={v} />
          </Section>
        </>
      ) : null}

      <Section title="Handover history">
        <HoldingHistory holdings={v.holdings} />
      </Section>
    </div>
  );
}
