import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { toast, Toaster } from "./index";
import { toaster } from "./instance";

afterEach(() => {
  act(() => toaster.dismiss(undefined, { immediate: true }));
  cleanup();
});

describe("the toast's drawing code is fetched apart (research R7)", () => {
  it("a toast raised before it has loaded is read out at once and drawn when it arrives", async () => {
    render(<Toaster />);
    act(() => void toast.error("Couldn't save."));
    expect(document.querySelector('[role="alert"]')!.textContent).toBe("Couldn't save.");
    await waitFor(() => expect(document.querySelector(".ef-toast")).not.toBeNull());
    expect(document.querySelector(".ef-toast")!.textContent).toContain("Couldn't save.");
  });
});
