import { TeamRoster } from "@/features/team/TeamRoster"

export function ManagerOnlyScreen() {
  return (
    <div className="flex flex-col gap-(--pad)">
      <TeamRoster />
    </div>
  )
}
