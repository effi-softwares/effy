import type { PostcodeCoverageDTO } from "@effy/shared-types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PostcodeCoverageNotice } from "./PostcodeCoverageNotice";

/**
 * ⚠ THESE CASES COME FROM THE CONTRACT'S WORKED TABLE, NOT FROM THE COMPONENT.
 *
 * `specs/031-delivery-areas/contracts/delivery-areas.contract.md` §2, whose numbers were confirmed
 * against the live `public.locality` table before any of this was written: 3350 covers **20** Ballarat
 * localities, 3550 covers **12** in Bendigo, 3000 covers exactly one place.
 *
 * Writing them against the contract rather than the implementation is deliberate. 028 and 029 both
 * shipped tests whose fixtures agreed with the code rather than with the world, and 029's banner test
 * asserted the very defect it existed to catch.
 */
const coverage = (postcode: string, names: string[]): PostcodeCoverageDTO => ({
  postcode,
  places: names.map((name) => ({ name, state: "VIC", postcode })),
  count: names.length,
});

const BALLARAT = coverage(
  "3350",
  Array.from({ length: 20 }, (_, i) => `Ballarat ${i + 1}`),
);

describe("PostcodeCoverageNotice — the FR-006 disclosure", () => {
  /**
   * ⚠ THE ASSERTION THIS COMPONENT EXISTS FOR.
   *
   * An admin choosing "Alfredton" is choosing all twenty Ballarat localities. If this sentence is
   * missing or wrong, they believe they made a narrow decision when they made a broad one — and the
   * first evidence otherwise is an order from a suburb they never meant to serve.
   */
  it("states how many OTHER places a postcode also serves", () => {
    render(<PostcodeCoverageNotice coverage={BALLARAT} />);

    // 20 places → "19 other places". The derivation is `count - 1` (contract §2 rule 2).
    expect(screen.getByTestId("coverage-many")).toHaveTextContent(/19 other places in 3350/i);
  });

  /** The list itself, not just a number — an admin needs to see WHICH places. */
  it("lists the places, not only the count", () => {
    render(<PostcodeCoverageNotice coverage={BALLARAT} />);

    const list = screen.getByTestId("coverage-places");
    expect(list).toBeInTheDocument();
    expect(list.children).toHaveLength(20);
  });

  /** FR-034a's sole-candidate case: nothing else is being enabled, so say so plainly. */
  it("says a sole-candidate postcode covers only that place", () => {
    render(<PostcodeCoverageNotice coverage={coverage("3000", ["Melbourne"])} />);

    expect(screen.getByTestId("coverage-sole")).toHaveTextContent(/covers only Melbourne/i);
    expect(screen.queryByTestId("coverage-places")).not.toBeInTheDocument();
  });

  /**
   * ⚠ FR-007 — the MORE DANGEROUS direction. Removal silently stops serving customers who were
   * already being served, so it carries the same disclosure with the opposite sentence.
   */
  it("flips the sentence on removal, naming everything that stops being served", () => {
    render(<PostcodeCoverageNotice coverage={BALLARAT} mode="remove" />);

    expect(screen.getByTestId("coverage-many")).toHaveTextContent(
      /Removing this stops serving all 20 places in 3350/i,
    );
  });

  /**
   * ⚠ THE 3001 CASE — the defect that motivated feature 031.
   *
   * Zero places means no locality names this postcode. It is warned about, not refused: the reference
   * record can lag reality, and a hard block would stall legitimate operations work (FR-005).
   */
  it("warns loudly when no locality names the postcode", () => {
    render(<PostcodeCoverageNotice coverage={coverage("3001", [])} />);

    const warning = screen.getByTestId("coverage-unknown");
    expect(warning).toHaveTextContent(/not a recognised delivery destination/i);
    expect(warning).toHaveTextContent(/3001/);
    // It must still be addable — the copy says confirmation, not refusal.
    expect(warning).toHaveTextContent(/confirmation/i);
  });

  /** Singular vs plural, because "1 other places" reads as a bug and undermines the warning. */
  it("uses singular wording for exactly one other place", () => {
    render(<PostcodeCoverageNotice coverage={coverage("3121", ["Richmond", "Richmond East"])} />);

    expect(screen.getByTestId("coverage-many")).toHaveTextContent(/1 other place in 3121/i);
    expect(screen.getByTestId("coverage-many")).not.toHaveTextContent(/other places/i);
  });

  it("renders nothing before coverage has loaded", () => {
    const { container } = render(<PostcodeCoverageNotice coverage={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * ⚠ Contract §2 rule 2: `count` comes from the SERVER, never from `places.length`. If a truncated
   * list ever arrives, the sentence must still report the true total — a client that measures the list
   * it was handed can say "1 other place" when there are twenty.
   */
  it("trusts the server's count over the length of the list it was given", () => {
    const truncated: PostcodeCoverageDTO = {
      postcode: "3350",
      places: [{ name: "Alfredton", state: "VIC", postcode: "3350" }],
      count: 20,
    };
    render(<PostcodeCoverageNotice coverage={truncated} />);

    expect(screen.getByTestId("coverage-many")).toHaveTextContent(/19 other places/i);
  });
});
