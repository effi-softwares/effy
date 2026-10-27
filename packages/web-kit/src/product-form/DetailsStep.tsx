import type {
  CategoryFormDTO,
  DetailInput,
  DetailVariant,
  FactKey,
  ProductFacts,
} from "@effy/shared-types";

import { DetailField } from "./DetailField";
import { FactsSection } from "./FactsSection";

interface Props {
  form: CategoryFormDTO;
  details: readonly DetailInput[];
  variants: readonly DetailVariant[];
  /** Attributes that are this product's options: set through Sizes & prices, not here. */
  optionAttributeIds: readonly string[];
  errors: Record<string, string>;
  facts: ProductFacts;
  factsTouched: readonly FactKey[];
  onDetail: (attributeId: string, next: DetailInput | null) => void;
  onFacts: (facts: ProductFacts, touched: FactKey[]) => void;
  disabled?: boolean;
}

/** The leaf's form, in its sections and order, then the product's facts. */
export function DetailsStep({
  form,
  details,
  variants,
  optionAttributeIds,
  errors,
  facts,
  factsTouched,
  onDetail,
  onFacts,
  disabled,
}: Props) {
  const byAttr = new Map(details.map((d) => [d.attributeId, d]));
  const options = new Set(optionAttributeIds);
  const sections = form.sections
    .map((s) => ({
      ...s,
      rows: s.rows.filter((r) => !options.has(r.attributeId)),
    }))
    .filter((s) => s.rows.length > 0);

  return (
    <div className="grid gap-8">
      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This category asks for no details beyond the basics.
        </p>
      ) : (
        sections.map((s) => (
          <section key={s.title} className="grid gap-5" aria-label={s.title}>
            <h3 className="text-sm font-semibold">{s.title}</h3>
            {s.rows.map((row) => (
              <DetailField
                key={row.attributeId}
                row={row}
                entry={byAttr.get(row.attributeId)}
                variants={variants}
                errors={errors}
                disabled={disabled}
                onChange={(next) => onDetail(row.attributeId, next)}
              />
            ))}
          </section>
        ))
      )}
      <FactsSection
        facts={facts}
        defaults={form.defaults}
        touched={factsTouched}
        onChange={onFacts}
        disabled={disabled}
      />
    </div>
  );
}
