import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { Button, Label } from "@effy/design-system/ui";

// The accepted image types mirror the backend's presign allow-list (jpeg/png/webp, FR-026); the
// backend re-validates content-type + size, so this is only a courtesy filter.
const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Primary-image picker with preview + upload progress.
 *
 * In the create flow this collects the file (preview only); the actual presign → PUT → register runs
 * on publish once the product row exists (see ProductCreateFlow's ordering note). During that upload
 * the parent passes `progress` (0–100) and this renders a bar. Reusable by US4's media gallery later.
 */
export interface MediaUploadProps {
  file: File | null;
  onChange: (file: File | null) => void;
  /** 0–100 while uploading, or `null` when idle. */
  progress?: number | null;
  error?: string;
  disabled?: boolean;
}

export function MediaUpload({ file, onChange, progress, error, disabled }: MediaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Object URLs must be revoked or they leak — recreate on every file change, clean up on unmount.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="space-y-2">
      <Label>
        Primary image<span className="ml-0.5 text-destructive">*</span>
      </Label>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />

      {previewUrl ? (
        <div className="flex items-center gap-3">
          <img
            src={previewUrl}
            alt="Selected product"
            className="h-16 w-16 rounded-md border object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{file?.name}</p>
            {progress != null ? (
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            ) : null}
          </div>
          {progress == null ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => onChange(null)}
              aria-label="Remove image"
            >
              <X />
            </Button>
          ) : null}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus />
          Choose image
        </Button>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
