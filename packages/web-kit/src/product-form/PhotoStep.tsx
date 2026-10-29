import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { EditorSection, FieldError } from "./fields";
import { ImageDropzone } from "./ImageDropzone";

const TIPS = [
  "The product fills most of the frame",
  "A plain, light background, no props",
  "The front of the pack, its label readable",
  "No price stickers, text or watermarks",
];

/** The main photo: the drop zone, what makes a good one, and where shoppers will see it. */
export function PhotoStep({
  file,
  onChange,
  imageUrl,
  error,
  note,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  /** The photo shoppers will see: the new file's, else the one the product already has. */
  imageUrl: string | null;
  error?: string | null;
  /** Under the drop zone: whether it is needed now. */
  note?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="ef-editor__body">
      <EditorSection>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div
            className="flex min-h-80 flex-col gap-3"
            data-invalid={error ? "true" : undefined}
          >
            <ImageDropzone file={file} onChange={onChange} disabled={disabled} />
            <FieldError text={error} />
            {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
          </div>

          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">A good photo</h3>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {TIPS.map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            {imageUrl ? (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">Where it shows</h3>
                <div className="flex items-end gap-4">
                  {(
                    [
                      ["Product page", "size-24"],
                      ["Aisle", "size-16"],
                      ["Cart", "size-10"],
                    ] as const
                  ).map(([label, size]) => (
                    <figure key={label} className="m-0 flex flex-col items-center gap-1.5">
                      <img
                        src={imageUrl}
                        alt=""
                        className={`${size} rounded-md border object-cover`}
                      />
                      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </EditorSection>
    </div>
  );
}
