import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { UpdateProductRequest } from "@effy/shared-types";

import { track } from "@/lib/telemetry";

import { STALE_EDIT_MESSAGE, isConflict, productMutationError } from "./errorText";
import { useUpdateProduct } from "./queries";

/**
 * Drives one focused-edit dialog's save (US4). Centralizes the optimistic-concurrency contract
 * (FR-023a): on a 409 it does NOT show a generic error — it flips `stale`, so the dialog can offer a
 * "reload" that refetches the detail (re-seeding a fresh `expectedUpdatedAt`) instead of blindly
 * retrying a doomed PATCH. On success it emits `product_edit_saved` and closes.
 */
export function useFocusedEdit(id: string) {
  const mutation = useUpdateProduct(id);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  function reset() {
    setError(null);
    setStale(false);
  }

  async function save(body: UpdateProductRequest, onDone: () => void) {
    reset();
    try {
      await mutation.mutateAsync(body);
      track({ name: "product_edit_saved", productId: id });
      onDone();
    } catch (err) {
      if (isConflict(err)) {
        setStale(true);
        setError(STALE_EDIT_MESSAGE);
      } else {
        setError(productMutationError(err));
      }
    }
  }

  /** Discard the stale error and refetch the detail so the operator edits the latest row. */
  function reload() {
    reset();
    void queryClient.invalidateQueries({ queryKey: ["shop", "catalog", "product", id] });
  }

  return { save, reload, reset, error, stale, saving: mutation.isPending };
}
