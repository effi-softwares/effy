import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

import { Input, Label } from "@effy/design-system/ui";

/** One part of a step: a heading, a line on what it is for, then its fields. */
export function EditorSection({
  title,
  description,
  aside,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** Beside the heading: a count, a status. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ef-editor__section">
      {title ? (
        <div className="ef-editor__section-head">
          <h3 className="ef-editor__section-title">
            {title}
            {aside ? <span className="ml-auto">{aside}</span> : null}
          </h3>
          {description ? <p className="ef-editor__section-desc">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A label, its control, a line of help and — once it applies — what is wrong. */
export function FormField({
  id,
  label,
  required,
  optional,
  help,
  error,
  trailing,
  children,
}: {
  id?: string;
  label: ReactNode;
  required?: boolean;
  optional?: boolean;
  help?: ReactNode;
  error?: string | null;
  /** Right of the help line: a character count. */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-2" data-invalid={error ? "true" : undefined}>
      <Label htmlFor={id} className="flex items-baseline gap-1.5">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
        {optional ? <span className="text-xs font-normal text-muted-foreground">optional</span> : null}
      </Label>
      {children}
      {help || trailing ? (
        <div className="flex items-start justify-between gap-3 text-sm text-muted-foreground">
          <span>{help}</span>
          {trailing ? <span className="shrink-0 text-xs tabular-nums">{trailing}</span> : null}
        </div>
      ) : null}
      <FieldError text={error} />
    </div>
  );
}

export function FieldError({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-destructive">
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {text}
    </p>
  );
}

/** A dollar amount: shadcn's Input with the currency sign inside it. */
export function MoneyInput({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  disabled,
  placeholder = "0.00",
  label,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** For a field with no visible label (a table cell). */
  label?: string;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
      >
        $
      </span>
      <Input
        id={id}
        inputMode="decimal"
        placeholder={placeholder}
        className="pl-7 tabular-nums"
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
