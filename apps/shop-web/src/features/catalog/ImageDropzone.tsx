import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardPaste, ImageUp, MousePointerClick, Upload, X } from "lucide-react";

import { Button } from "@effy/design-system/ui";

import { cn } from "@/lib/utils";

/**
 * The primary-image capture control for the create flow's dedicated Image step (FR-010b, research
 * R16). Three input modalities, all native (no library):
 *   • click   — opens the hidden file input (the zone is a focusable button; Enter/Space work too)
 *   • drop    — the HTML Drag-and-Drop API (onDragOver preventDefault → onDrop reads dataTransfer)
 *   • paste   — a document-scoped `paste` listener, mounted only while this control is shown, that
 *               takes the first image on the clipboard (Ctrl/⌘-V). Safe because the Image step has no
 *               other input to steal a paste from.
 *
 * Client-side validation mirrors the backend allow-list (apis/edge-api/shop/src/products/media.ts:
 * JPEG/PNG/WebP, ≤10 MB); the backend re-validates on presign, so this only fails fast with a
 * friendly message. The capture is preview-only — the presign → PUT → register runs on publish
 * (create-then-attach, R9); `progress` (0–100) renders a bar over the preview during that upload.
 */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — matches media.ts
const ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");

/** Client-side gate mirroring the backend allow-list. Returns an error message, or null when OK. */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return "Use a JPEG, PNG, or WebP image.";
  if (file.size > MAX_IMAGE_BYTES) return "Image must be 10 MB or smaller.";
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ImageDropzoneProps {
  file: File | null;
  onChange: (file: File | null) => void;
  /** 0–100 while uploading (on publish), or `null` when idle. */
  progress?: number | null;
  disabled?: boolean;
}

export function ImageDropzone({ file, onChange, progress, disabled }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URLs must be revoked or they leak — recreate on file change, clean up on unmount.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const accept = useCallback(
    (candidate: File | null | undefined) => {
      if (!candidate) return;
      const err = validateImageFile(candidate);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      onChange(candidate);
    },
    [onChange],
  );

  // Global paste while mounted — the operator can Ctrl/⌘-V a copied image straight in.
  useEffect(() => {
    if (disabled) return;
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      const pasted = item?.getAsFile();
      if (pasted) {
        e.preventDefault();
        accept(pasted);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [accept, disabled]);

  const uploading = progress != null;

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragLeave() {
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    accept(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = ""; // allow re-picking the same file after a remove
        }}
      />

      {previewUrl ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/30">
            <img
              src={previewUrl}
              alt="Selected product"
              className="max-h-full max-w-full object-contain"
            />
            {uploading ? (
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/10">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                  role="progressbar"
                  aria-valuenow={progress ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
            <p className="min-w-0 truncate text-sm">
              <span className="font-medium">{file?.name}</span>
              {file ? (
                <span className="text-muted-foreground"> · {formatBytes(file.size)}</span>
              ) : null}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || uploading}
                onClick={() => inputRef.current?.click()}
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || uploading}
                onClick={() => onChange(null)}
                aria-label="Remove image"
              >
                <X />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragEnter={onDragEnter}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          aria-label="Add primary image — click to browse, drag and drop, or paste"
          className={cn(
            "flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-60",
            dragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30",
          )}
        >
          <span
            className={cn(
              "flex size-16 items-center justify-center rounded-full transition-colors",
              dragging ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <ImageUp className="size-8" />
          </span>
          <span className="space-y-1">
            <span className="block text-base font-medium">
              {dragging ? "Drop the image to add it" : "Add the primary image"}
            </span>
            <span className="block text-sm text-muted-foreground">
              JPEG, PNG, or WebP · up to 10 MB
            </span>
          </span>
          <span className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MousePointerClick className="size-3.5" /> Click to browse
            </span>
            <span className="flex items-center gap-1.5">
              <Upload className="size-3.5" /> Drag &amp; drop
            </span>
            <span className="flex items-center gap-1.5">
              <ClipboardPaste className="size-3.5" /> Paste
            </span>
          </span>
        </button>
      )}

      {error ? <p className="shrink-0 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
