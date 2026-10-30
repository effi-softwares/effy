import type { AdminSkinDTO } from "@effy/shared-types"
import { Panel } from "@effy/web-kit/patterns"

export function SkinUsage({ skin }: { skin: AdminSkinDTO }) {
  const { usage } = skin
  return (
    <Panel title="Where it's used">
      {usage.placements === 0 && usage.defaultOf.length === 0 ? (
        <p className="mt-0.5 block text-sm text-muted-foreground">Nowhere yet. Choose it on a display group's page.</p>
      ) : (
        <ul className="space-y-2 text-sm" data-testid="skin-usage">
          {usage.defaultOf.map((g) => (
            <li key={`d-${g.id}-${g.forCode}`}>
              Default of <span className="font-medium">{g.name}</span>
              {g.forCode ? " (promotions with a code)" : ""}
            </li>
          ))}
          {usage.groups.map((g) => (
            <li key={g.id}>
              <span className="font-medium">{g.name}</span> - {g.members} {g.members === 1 ? "promotion" : "promotions"}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
