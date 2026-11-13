import { BACK_OFFICE_ROLES, TEAM_ROLE_LINES, TEAM_ROLE_WORDS, type BackOfficeRole } from "@effy/shared-types"
import { RadioGroup, RadioGroupItem } from "@effy/design-system/ui"

/** The three roles, each with one line of what it may do (FR-005). */
export function RoleChoice({
  value,
  onChange,
  name,
}: {
  value: BackOfficeRole | null
  onChange: (role: BackOfficeRole) => void
  name: string
}) {
  return (
    <RadioGroup
      aria-label="Role"
      name={name}
      value={value ?? ""}
      onValueChange={(v) => onChange(v as BackOfficeRole)}
      className="space-y-2"
    >
      {BACK_OFFICE_ROLES.map((r) => (
        <label key={r} className="flex items-start gap-3 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary">
          <RadioGroupItem value={r} className="mt-0.5" />
          <span>
            <span className="block font-medium">{TEAM_ROLE_WORDS[r]}</span>
            <span className="block text-muted-foreground">{TEAM_ROLE_LINES[r]}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  )
}
