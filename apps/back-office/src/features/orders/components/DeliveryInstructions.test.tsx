import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeliveryInstructions } from "./DeliveryInstructions";

describe("066 — delivery instructions on the back-office order", () => {
  it("shows the preference in words and the note as the customer typed it", () => {
    render(<DeliveryInstructions instructions={{ handover: "meet_at_door", note: "Ring twice" }} />);
    expect(screen.getByRole("heading", { name: "Delivery instructions" })).toBeInTheDocument();
    expect(screen.getByText("Meet at the door")).toBeInTheDocument();
    expect(screen.getByText("Ring twice")).toBeInTheDocument();
  });

  it("⚠ renders nothing at all when the customer said nothing", () => {
    for (const instructions of [undefined, null, { handover: null, note: null }]) {
      const { container, unmount } = render(<DeliveryInstructions instructions={instructions} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  /**
   * ⚠ STORED XSS, THE REAL ONE. This text is typed by anyone on the public storefront and displayed
   * to a signed-in admin. It must come out as characters.
   */
  it("⚠ renders markup in the note as literal text and creates no element", () => {
    const hostile =
      '<b>bold</b> <a href="javascript:alert(1)">link</a> <img src=x onerror=alert(1)> <script>alert(1)</script>';
    const { container } = render(<DeliveryInstructions instructions={{ handover: null, note: hostile }} />);
    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(container.querySelector("b, a, img, script")).toBeNull();
  });
});
