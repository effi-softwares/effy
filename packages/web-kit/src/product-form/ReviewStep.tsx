import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, Pencil } from "lucide-react";

import {
  AGE_RESTRICTED_LABEL,
  formatAttributeValue,
  formRows,
  GST_STATUS_WORDS,
  STORAGE_WORDS,
  type CategoryFormDTO,
} from "@effy/shared-types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
} from "@effy/design-system/ui";

import type { ProductDraft } from "./draft";
import { pathText } from "./model";
import {
  money,
  previewSizes,
  STEP_WORDS,
  type ReadinessItem,
  type StepKey,
} from "./steps";

type Row = [label: string, value: ReactNode | null];

interface Props {
  draft: ProductDraft;
  form: CategoryFormDTO | undefined;
  imageUrl: string | null;
  uploadProgress: number | null;
  /** The steps to summarise, in the editor's order (review itself is skipped). */
  steps: readonly StepKey[];
  onEdit: (key: StepKey) => void;
  /** At the top: ready, or what is still missing. */
  banner: ReactNode;
  /** A console's own step (back-office's shop and margin), summarised the same way. */
  extra?: Partial<Record<StepKey, Row[]>>;
  /** A size's price as shown beside the shop's (back-office adds its margin). */
  shown?: (shopPrice: string) => string | null;
  /** What a missing photo means here. */
  noImage?: string;
  /** Under the summary: what happens next. */
  after?: ReactNode;
}

/** Everything entered, one block per step, each with a way back to change it. */
export function ReviewStep({
  draft,
  form,
  imageUrl,
  uploadProgress,
  steps,
  onEdit,
  banner,
  extra = {},
  shown,
  noImage,
  after,
}: Props) {
  const rows = form ? formRows(form) : [];
  const text = (s: string) => (s.trim() ? s.trim() : null);
  const sizes = previewSizes(draft, form);
  const priced = (p: string) => /^\d+(\.\d{1,2})?$/.test(p);

  const blocks: Partial<Record<StepKey, Row[]>> = {
    ...extra,
    basics: [
      ["Name", text(draft.name)],
      ["Brand", text(draft.brand) ?? "-"],
      ["Category", form ? pathText(form.path) : null],
      ["Short description", text(draft.shortDescription)],
      ...(draft.longDescription.trim()
        ? ([["Longer description", draft.longDescription.trim()]] as Row[])
        : []),
    ],
    image: [
      [
        "Main photo",
        imageUrl ? (
          <img src={imageUrl} alt="Main product" className="size-14 rounded-md border object-cover" />
        ) : (
          (noImage ?? null)
        ),
      ],
    ],
    sizes: sizes.map((s) => {
      const variant = draft.variantSet.variants.find((v) => v.id === s.id);
      const was = variant?.shopCompareAtAmount.trim();
      const extraPrice = shown && priced(s.price) ? shown(s.price) : null;
      return [
        s.label,
        priced(s.price) ? (
          <span className="tabular-nums">
            {money(s.price)}
            {extraPrice ? (
              <span className="text-muted-foreground"> · shoppers pay {money(extraPrice)}</span>
            ) : null}
            {was && priced(was) ? (
              <span className="text-muted-foreground"> · was {money(was)}</span>
            ) : null}
          </span>
        ) : null,
      ];
    }),
    details: form
      ? [
        ...rows
          .filter((r) => r.level === "required" || draft.details.some((d) => d.attributeId === r.attributeId))
          .map((r): Row => {
            const d = draft.details.find((x) => x.attributeId === r.attributeId);
            if (!d || (d.value === undefined && !(d.perVariant?.length ?? 0)))
              return [r.name, r.level === "required" ? null : "-"];
            return [r.name, d.value ? formatAttributeValue(r, d.value) : "Differs by variant"];
          }),
        ["Storage", draft.facts.storage ? STORAGE_WORDS[draft.facts.storage] : null],
        ["GST", draft.facts.gstStatus ? GST_STATUS_WORDS[draft.facts.gstStatus] : null],
        [`${AGE_RESTRICTED_LABEL} only`, draft.facts.ageRestricted === null ? null : draft.facts.ageRestricted ? "Yes" : "No"],
      ]
      : [["Category", null]],
  };

  return (
    <div className="ef-editor__body">
      {uploadProgress != null ? (
        <div className="grid gap-1.5">
          <Progress value={uploadProgress} tone="brand" height={6} label="Photo upload" />
          <p className="text-xs text-muted-foreground">Uploading the photo… {uploadProgress}%</p>
        </div>
      ) : null}
      {banner}
      <div className="grid gap-3">
        {steps
          .filter((k) => k !== "review" && blocks[k])
          .map((k) => (
            <Card key={k} className="gap-0 overflow-hidden py-0">
              <CardHeader className="border-b py-3 [.border-b]:pb-3">
                <CardTitle className="leading-8">{STEP_WORDS[k].title}</CardTitle>
                <CardAction>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(k)}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="py-1">
                <dl className="ef-dl">
                  {blocks[k]!.map(([label, value], i) => (
                    <div key={`${label}-${i}`} className="ef-dl__row">
                      <dt>{label}</dt>
                      <dd>
                        {value ?? <span className="font-medium text-destructive">Missing</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ))}
      </div>
      {after}
    </div>
  );
}

/** The review's first line: ready, or the list of what is missing with a way to each. */
export function ReadinessBanner({
  tone,
  title,
  description,
  items = [],
  onFix,
}: {
  tone: "ready" | "missing" | "note";
  title: string;
  description?: string;
  items?: readonly ReadinessItem[];
  onFix?: (item: ReadinessItem) => void;
}) {
  const Icon = tone === "ready" ? CircleCheck : tone === "missing" ? CircleAlert : Info;
  return (
    <Alert variant={tone === "missing" ? "destructive" : tone === "ready" ? "info" : "muted"}>
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      {description || items.length > 0 ? (
        <AlertDescription>
          {description ? <p>{description}</p> : null}
          {items.length > 0 ? (
            <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
              {items.map((i) => (
                <li key={i.key} className="flex items-center gap-2">
                  {i.label}
                  {onFix ? (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => onFix(i)}
                    >
                      Fix
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </AlertDescription>
      ) : null}
    </Alert>
  );
}

/** The shop's last step: what happens after it is sent. */
export function WhatHappensNext({ steps }: { steps: readonly { title: string; text: string }[] }) {
  return (
    <section className="ef-editor__section">
      <div className="ef-editor__section-head">
        <h3 className="ef-editor__section-title">What happens next</h3>
      </div>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold text-muted-foreground"
            >
              {i + 1}
            </span>
            <span className="grid gap-0.5">
              <span className="text-sm font-semibold">{s.title}</span>
              <span className="text-sm text-muted-foreground">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
