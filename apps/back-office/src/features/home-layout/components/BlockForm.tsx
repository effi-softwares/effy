import { Plus, Trash2 } from "lucide-react";

import {
  BLOCK_CATALOGUE,
  type BlockField,
  type BlockType,
  DESTINATION_KINDS,
  type LayoutBlock,
} from "@effy/shared-types";
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui";

import { ArtworkField } from "./ArtworkField";

/**
 * A block's editor, GENERATED FROM ITS FIELD SCHEMA (042 US2, T062).
 *
 * ⚠ ONE FORM FOR EVERY BLOCK TYPE, NOT ONE PER TYPE, and that is the decision this file exists to
 * make. Hand-built forms would mean a block type could be added to the catalogue — where the server
 * validates it, the storefront renders it and the composer offers it — and simply have no way to be
 * edited. That failure is silent: the block appears in the list, the operator opens it, and there is
 * nothing there. Generating from the schema makes "the catalogue knows about it" and "the operator
 * can edit it" the same fact.
 *
 * ⚠ THE FIELD KINDS ARE THE CONSTITUTIONAL BOUNDARY (FR-007). There are eight, none of which can
 * carry a colour, a size, a spacing value, an alignment or markup — so an operator cannot produce an
 * off-brand page, because the vocabulary has no word for it. This renderer switches exhaustively over
 * those eight and nothing else; adding a ninth is a constitutional question, and `shared-types` has a
 * compile-time guard and a test saying so.
 *
 * ⚠ EVERY CONSTRAINT HERE IS ADVISORY (FR-032). `maxLength` on an input, a select instead of a text
 * box, a required marker — all of it is for the operator's benefit. The server re-checks every one,
 * because the operator can reach the API directly and a rule that lives only in a form is not a rule.
 */

export interface BlockFormProps {
  block: LayoutBlock;
  onChange: (props: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function BlockForm({ block, onChange, disabled }: BlockFormProps) {
  const def = BLOCK_CATALOGUE[block.type as BlockType];

  if (!def) {
    // ⚠ A block type this build does not know is DATA, not a crash (FR-042) — a layout published by a
    // newer deploy must not break the composer for everyone on the older one.
    return (
      <p className="text-sm text-muted-foreground">
        This block was created by a newer version of the platform. You can move or remove it here, but
        editing it needs an updated console.
      </p>
    );
  }

  if (def.fields.length === 0) {
    // `recently_viewed` is the case: its content is the shopper's own device history, so only its
    // POSITION is authorable. Saying so is better than an empty panel that looks broken.
    return (
      <p className="text-sm text-muted-foreground">
        This block has nothing to fill in — its content comes from each shopper. Move it to change
        where it appears.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {def.fields.map((field) => (
        <FieldEditor
          key={field.key}
          field={field}
          value={block.props[field.key]}
          disabled={disabled}
          siblings={block.props}
          onChange={(next) => onChange({ ...block.props, [field.key]: next })}
        />
      ))}
    </div>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
  disabled,
  idPrefix = "",
  siblings,
}: {
  field: BlockField;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
  idPrefix?: string;
  /** The other fields of the same item — the artwork editor needs the sibling `size`. */
  siblings?: Record<string, unknown>;
}) {
  const id = `${idPrefix}${field.key}`;

  switch (field.kind) {
    case "text":
      return (
        <Field id={id} field={field}>
          <Input
            id={id}
            value={typeof value === "string" ? value : ""}
            maxLength={field.maxLength}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );

    case "longText":
      return (
        <Field id={id} field={field}>
          <Textarea
            id={id}
            rows={3}
            value={typeof value === "string" ? value : ""}
            maxLength={field.maxLength}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );

    case "enum":
      return (
        <Field id={id} field={field}>
          {/* ⚠ A closed set, presented as a closed set. A free-text box here would let an operator
              author a tile size the bento cannot lay out — refused at publish, but only after they
              had written it. */}
          <Select
            value={typeof value === "string" ? value : ""}
            disabled={disabled}
            onValueChange={onChange}
          >
            <SelectTrigger id={id}>
              <SelectValue placeholder="Choose one" />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      );

    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={value === true}
            disabled={disabled}
            onCheckedChange={(c) => onChange(c === true)}
          />
          <Label htmlFor={id}>{field.label}</Label>
        </div>
      );

    case "destination":
      return (
        <DestinationEditor id={id} field={field} value={value} disabled={disabled} onChange={onChange} />
      );

    case "reference":
      return (
        <Field id={id} field={field}>
          {/* ⚠ BY ID, NEVER BY NAME (FR-011). A renamed or delisted promotion must not leave dead copy
              on the page — which is what storing its name would do. A picker is the better control and
              is its own task; the id is what the contract stores either way. */}
          <Input
            id={id}
            value={typeof value === "string" ? value : ""}
            disabled={disabled}
            placeholder={`${field.references} id`}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
        </Field>
      );

    case "artwork":
      return (
        <ArtworkField
          label={field.label}
          canvas={field.canvas}
          // ⚠ The canvas for a tile depends on its SIZE, which is a sibling field — so the editor
          // needs the whole item, not just its own value. That is why `siblings` is threaded down
          // rather than each field being rendered in isolation.
          size={typeof siblings?.size === "string" ? siblings.size : undefined}
          value={typeof value === "string" ? value : undefined}
          disabled={disabled}
          onChange={(k) => onChange(k)}
        />
      );

    case "list":
      return (
        <ListEditor field={field} value={value} disabled={disabled} onChange={onChange} idPrefix={id} />
      );

    default:
      // ⚠ Exhaustive over the eight field kinds. A ninth is a constitutional question (FR-007), and
      // this is where forgetting to answer it becomes a compile error rather than a blank control.
      return assertNever(field);
  }
}

function assertNever(field: never): null {
  void field;
  return null;
}

function Field({
  id,
  field,
  children,
}: {
  id: string;
  field: BlockField;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {field.label}
        {/* ⚠ The OPTIONAL ones are marked, not the required ones. Most fields are required, so
            marking those would decorate almost every label and say nothing; the useful signal is
            which fields an operator can safely leave alone. */}
        {!field.required && <span className="ml-1 text-xs text-muted-foreground">(optional)</span>}
      </Label>
      {children}
      {(field.kind === "text" || field.kind === "longText") && (
        <p className="text-xs text-muted-foreground">Up to {field.maxLength} characters</p>
      )}
    </div>
  );
}

/**
 * A destination, edited as a kind plus whatever that kind needs.
 *
 * ⚠ FOUR KINDS, AND `promotion` IS NOT ONE. This feature retires the promotion-detail page, so
 * offering that kind would let an operator author a tile aimed at a route that no longer exists —
 * the exact defect 029 spent a slice fixing, where every banner pointed at the unfiltered store for
 * its whole life because nothing asserted where a link led.
 */
function DestinationEditor({
  id,
  field,
  value,
  onChange,
  disabled,
}: {
  id: string;
  field: BlockField;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}) {
  const dest = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const kind = typeof dest.kind === "string" ? dest.kind : "";

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <Field id={id} field={field}>
        <Select
          value={kind}
          disabled={disabled}
          // ⚠ Changing the kind DISCARDS the old kind's parameter rather than carrying it. A
          // `categoryKey` left behind on a `product` destination is invisible in the form and
          // meaningless to the renderer — and it would reappear if the operator switched back,
          // pointing at whatever it used to.
          onValueChange={(k) => onChange({ kind: k })}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder="Where does this lead?" />
          </SelectTrigger>
          <SelectContent>
            {DESTINATION_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {DESTINATION_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {kind === "category" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-category`}>Category key</Label>
          <Input
            id={`${id}-category`}
            value={typeof dest.categoryKey === "string" ? dest.categoryKey : ""}
            disabled={disabled}
            onChange={(e) => onChange({ kind, categoryKey: e.target.value })}
          />
        </div>
      )}

      {kind === "product" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-product`}>Product id</Label>
          <Input
            id={`${id}-product`}
            value={typeof dest.productId === "string" ? dest.productId : ""}
            disabled={disabled}
            onChange={(e) => onChange({ kind, productId: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

const DESTINATION_LABELS: Record<string, string> = {
  search: "The whole store",
  sale: "Everything on sale",
  category: "A category",
  product: "One product",
};

/**
 * A repeating group — offer tiles, hero slides, value panels.
 *
 * ⚠ ITEMS CARRY NO STABLE ID, so the React key is the index. That is normally a mistake and here it
 * is the honest one: the contract stores a plain array and inventing ids would put data on the wire
 * that nothing else reads. The consequence is real and bounded — reordering items remounts their
 * inputs, so item reordering is deliberately NOT offered here. Add, edit, remove.
 */
function ListEditor({
  field,
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  field: Extract<BlockField, { kind: "list" }>;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const atMax = items.length >= field.max;

  const setItem = (i: number, next: Record<string, unknown>) =>
    onChange(items.map((item, j) => (j === i ? next : item)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>{field.label}</Label>
        <span className="text-xs text-muted-foreground">
          {items.length} of {field.max}
        </span>
      </div>

      {items.map((item, i) => (
        <div key={i} className="space-y-4 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {field.label} {i + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled || items.length <= field.min}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label={`Remove ${field.label} ${i + 1}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {field.of.map((sub) => (
            <FieldEditor
              key={sub.key}
              field={sub}
              value={item[sub.key]}
              disabled={disabled}
              idPrefix={`${idPrefix}-${i}-`}
              siblings={item}
              onChange={(next) => setItem(i, { ...item, [sub.key]: next })}
            />
          ))}
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || atMax}
          onClick={() => onChange([...items, {}])}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add {field.label.toLowerCase().replace(/s$/, "")}
        </Button>
        {/* ⚠ The limit is SAID, not merely enforced. A disabled button with no explanation reads as a
            broken tool, and the server refuses regardless — the only question is whether the operator
            finds out before or after they try. */}
        {atMax && (
          <p className="text-sm text-muted-foreground">
            At most {field.max}. Remove one to add another.
          </p>
        )}
      </div>
    </div>
  );
}
