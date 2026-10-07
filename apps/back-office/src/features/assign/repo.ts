import { api } from "@/lib/api";

// "Assign to…" and "Unassign" (073) — the two things a person can do to one package's driver.
// Every endpoint is on the fleet service, which owns auto-assign and takes its lock.

export type Stage = "collection" | "delivery";

export interface DriverFit {
  driverId: string;
  name: string;
  packagesToday: number;
  fit: "fine" | "concern" | "cannot";
  notes: string[];
}

export async function driversFor(packageId: string, stage: Stage): Promise<DriverFit[]> {
  return (await api.get<{ drivers: DriverFit[] }>(`/fleet/v1/dispatch/packages/${packageId}/drivers?stage=${stage}`)).drivers;
}

export async function assignTo(
  packageId: string,
  body: { stage: Stage; driverId: string; expectedAssignmentId: string | null; acceptConcerns?: boolean },
): Promise<{ message: string }> {
  return api.post(`/fleet/v1/dispatch/packages/${packageId}/assign`, body);
}

export async function unassign(
  packageId: string,
  body: { stage: Stage; expectedAssignmentId: string },
): Promise<{ message: string }> {
  return api.post(`/fleet/v1/dispatch/packages/${packageId}/unassign`, body);
}
