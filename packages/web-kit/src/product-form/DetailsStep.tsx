import { Check, Layers } from "lucide-react";

import type {
  CategoryFormDTO,
  DetailInput,
  DetailVariant,
  FactKey,
  ProductFacts,
} from "@effy/shared-types";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Progress,
} from "@effy/design-system/ui";

import { DetailField } from "./DetailField";
import { FactsSection } from "./FactsSection";
import { EditorSection } from "./fields";

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

const filled = (d: DetailInput | undefined) =>
  !!d && (d.value !== undefined || (d.perVariant?.length ?? 0) > 0);

/** The leaf's form, in its sections and order, with how much of it is done; then the product's facts. */
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
  const required = sections.flatMap((s) => s.rows.filter((r) => r.level === "required"));
  const done = required.filter((r) => filled(byAttr.get(r.attributeId))).length;

  return (
    <div className="ef-editor__body">
      {required.length > 0 ? (
        <div className="flex items-center gap-4 rounded-lg border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{form.path[form.path.length - 1]}</p>
            <p className="text-sm text-muted-foreground">
              {done} of {required.length} required filled
            </p>
          </div>
          <Progress
            value={(done / required.length) * 100}
            tone={done === required.length ? "success" : "brand"}
            className="flex-1"
            label="Required details filled"
          />
        </div>
      ) : null}

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This category asks for no details beyond the basics.
        </p>
      ) : (
        sections.map((s) => {
          const req = s.rows.filter((r) => r.level === "required");
          const ok = req.filter((r) => filled(byAttr.get(r.attributeId))).length;
          return (
            <EditorSection
              key={s.title}
              title={s.title}
              aside={
                req.length === 0 ? (
                  <span className="text-xs font-medium text-muted-foreground">Optional</span>
                ) : ok === req.length ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-brand">
                    <Check aria-hidden="true" className="size-3.5" />
                    Done
                  </span>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    {ok} of {req.length} required
                  </span>
                )
              }
            >
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
            </EditorSection>
          );
        })
      )}
      <EditorSection
        title="How it is kept and sold"
        description="Set by the category. Change one only if this product is different; Effy sees the change when it reviews."
      >
        <FactsSection
          facts={facts}
          defaults={form.defaults}
          touched={factsTouched}
          onChange={onFacts}
          disabled={disabled}
          legend={false}
        />
      </EditorSection>
    </div>
  );
}

/** The details step before a category is chosen: the details depend on it. */
export function ChooseCategoryFirst({ onGo }: { onGo: () => void }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Layers aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Choose a category first</EmptyTitle>
        <EmptyDescription>The details asked for depend on what the product is.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" onClick={onGo}>
          Go to Name &amp; category
        </Button>
      </EmptyContent>
    </Empty>
  );
}
