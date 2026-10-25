import { AttributeField } from "../AttributeField"
import type { AttributeDraftValue } from "../draft"
import type { ProductType } from "../model"

interface Props {
  type: ProductType | undefined
  values: Record<string, AttributeDraftValue>
  errors: Record<string, string>
  onChange: (id: string, value: AttributeDraftValue) => void
}

function groupByLabel(attributes: ProductType["attributes"]) {
  const groups = new Map<string, ProductType["attributes"]>()
  for (const attr of [...attributes].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const key = attr.groupLabel ?? ""
    groups.set(key, [...(groups.get(key) ?? []), attr])
  }
  return [...groups.entries()]
}

export function AttributesStep({ type, values, errors, onChange }: Props) {
  if (!type) return null
  if (type.attributes.length === 0) {
    return <p className="text-sm text-muted-foreground">This product type has no extra details to fill in.</p>
  }

  return (
    <div className="space-y-6">
      {groupByLabel(type.attributes).map(([groupLabel, attrs]) => (
        <section key={groupLabel || "_"} className="space-y-4">
          {groupLabel ? <h3 className="text-sm font-semibold text-muted-foreground">{groupLabel}</h3> : null}
          {attrs.map((attr) => (
            <AttributeField
              key={attr.attributeId}
              attr={attr}
              value={values[attr.attributeId]}
              error={errors[attr.attributeId]}
              onChange={(next) => onChange(attr.attributeId, next)}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
