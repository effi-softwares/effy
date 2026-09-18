import { useEffect } from "react";

import { isDomainError } from "@effy/api-client";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
  Spinner,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { track } from "@/lib/telemetry";

import { TeamRoster } from "@/features/team/TeamRoster";

import { managerPingQuery } from "./queries";

/**
 * US3 — the manager-only area.
 *
 * Reaching this screen is not authorization. The backend decides, from the platform record
 * (role AND status AND shop scope), and refuses with a uniform 403 that says nothing about WHICH
 * term failed. A shop_staff operator who types /manager into the address bar lands here and is
 * refused by the backend, exactly as if they had found a hidden button.
 */
export function ManagerOnlyScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(managerPingQuery);

  const denied = isError && isDomainError(error) && error.kind === "forbidden";
  useEffect(() => {
    if (denied) track({ name: "shop_manager_area_access_denied" });
  }, [denied]);

  return (
    <div className="flex flex-col gap-(--pad)">
      <TeamRoster />

    </div>
  );
}
