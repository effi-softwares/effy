import { TeamRoster } from "@/features/team/TeamRoster";

/**
 * US3 — the manager-only area.
 *
 * Reaching this screen is not authorization. Every read and write the roster makes is refused by the
 * backend (role AND status AND shop scope) with a uniform 403 unless the operator is an active
 * shop_manager at an active shop: the roster's own requests are the gate.
 */
export function ManagerOnlyScreen() {
  return (
    <div className="flex flex-col gap-(--pad)">
      <TeamRoster />
    </div>
  );
}
