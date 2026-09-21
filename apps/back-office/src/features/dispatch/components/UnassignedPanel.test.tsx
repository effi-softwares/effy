import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { UnassignedWorkDTO } from "@effy/shared-types";

import { UnassignedPanel } from "./UnassignedPanel";

function item(over: Partial<UnassignedWorkDTO> = {}): UnassignedWorkDTO {
  return {
    packageId: "p-1",
    orderNumber: "EFY-ABC123",
    shopName: "Shop One",
    zoneName: "Inner North",
    method: "standard",
    readySince: "2026-09-21T01:00:00Z",
    reasons: ["not_cleared"],
    ...over,
  };
}

describe("UnassignedPanel — the reader that makes an unassigned package explainable (FR-028)", () => {
  it("names the reason, not the enum", () => {
    render(<UnassignedPanel items={[item()]} />);
    expect(screen.getByText("Not cleared for this work")).toBeInTheDocument();
    // ⚠ A raw enum explains nothing to the operator who has to decide whether to grant a clearance
    // or call somebody in.
    expect(screen.queryByText("not_cleared")).not.toBeInTheDocument();
  });

  it("lists EVERY reason, because fixing one of three wastes the trip (FR-026)", () => {
    render(<UnassignedPanel items={[item({ reasons: ["licence_expired", "no_vehicle"] })]} />);
    expect(screen.getByText(/Licence expired/)).toBeInTheDocument();
    expect(screen.getByText(/Holding no vehicle/)).toBeInTheDocument();
  });

  // ⚠ Two different problems. "Nobody is cleared" is a staffing decision; "everyone cleared failed a
  // condition" is a fixable list. Rendering both as "could not be assigned" hides which is happening.
  it("distinguishes no-candidate-at-all from a named failure", () => {
    render(<UnassignedPanel items={[item({ reasons: [] })]} />);
    expect(screen.getByText("No driver is cleared for this work at all")).toBeInTheDocument();
  });

  it("says so when nothing is stuck, rather than showing blank space", () => {
    render(<UnassignedPanel items={[]} />);
    expect(screen.getByText("Nothing needs attention")).toBeInTheDocument();
  });

  it("counts the packages needing attention", () => {
    render(<UnassignedPanel items={[item(), item({ packageId: "p-2" })]} />);
    expect(screen.getByText(/2 packages with no driver/)).toBeInTheDocument();
  });

  // ⚠ 062's lesson: a text query can match something incidental and pass vacuously. Anchoring on the
  // heading ELEMENT proves the section rendered, not that the words appear somewhere.
  it("renders as a labelled section, not loose text", () => {
    render(<UnassignedPanel items={[item()]} />);
    const heading = screen.getByRole("heading", { name: /Needs attention/ });
    expect(heading).toBeInTheDocument();
  });
});
