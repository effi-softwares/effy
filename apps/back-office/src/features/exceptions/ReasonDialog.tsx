import { useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@effy/design-system/ui";

interface Props {
  label: string;
  title: string;
  description: string;
  fieldLabel: string;
  confirmLabel: string;
  /** Resolves with null on success, or the sentence to show. */
  onConfirm: (text: string) => Promise<string | null>;
}

/**
 * A staff action that needs a few words of why (waive the order of work for a run, clear an unsafe
 * vehicle). The words are kept with the action; the server refuses fewer than 3 characters.
 */
export function ReasonDialog({ label, title, description, fieldLabel, confirmLabel, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    const problem = await onConfirm(text.trim());
    setBusy(false);
    if (problem) setError(problem);
    else setOpen(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setText(""); setError(null); setOpen(true); }}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason-text">{fieldLabel}</Label>
            <Textarea id="reason-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void confirm()} disabled={busy || text.trim().length < 3}>
              {busy ? "Saving…" : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
