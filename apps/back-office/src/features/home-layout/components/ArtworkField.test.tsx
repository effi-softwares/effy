import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARTWORK_CANVASES } from "@effy/shared-types";

const repo = vi.hoisted(() => ({ presignArtwork: vi.fn(), viewArtwork: vi.fn() }));
vi.mock("../repo", () => repo);

import { ArtworkField } from "./ArtworkField";

/**
 * ⚠ jsdom does not decode images, so `Image.onload` never fires and the natural dimensions are
 * always 0. Every test here would report "wrong shape" for a correctly-shaped file. Stubbing the
 * decode is what lets the ORDERING and the CONFORMANCE rules be tested at all.
 */
function stubImageDecoder(dims: { width: number; height: number } | null) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = dims?.width ?? 0;
    naturalHeight = dims?.height ?? 0;
    set src(_v: string) {
      queueMicrotask(() => (dims ? this.onload?.() : this.onerror?.()));
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

const LARGE = ARTWORK_CANVASES["tile-large"];

function file(name = "art.jpg", type = "image/jpeg") {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

async function choose(f: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, f);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));
  repo.presignArtwork.mockResolvedValue({ uploadUrl: "https://s3.test/put", storageKey: "home-layout/artwork/1.jpg" });
  repo.viewArtwork.mockResolvedValue({ url: "https://s3.test/get" });
});

afterEach(() => vi.unstubAllGlobals());

describe("the upload's ordering (T068)", () => {
  /**
   * ⚠ THE KEY IS ATTACHED ONLY AFTER THE PUT SUCCEEDS, and the order is the whole design. Attaching
   * first leaves a block pointing at an object that does not exist — a broken frame on the storefront,
   * from a save that reported success.
   */
  it("presigns, PUTs, and only then attaches the key", async () => {
    stubImageDecoder({ width: LARGE.width, height: LARGE.height });
    const onChange = vi.fn();
    render(<ArtworkField label="Artwork" canvas="tile" size="large" value={undefined} onChange={onChange} />);

    await choose(file());

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("home-layout/artwork/1.jpg"));
    expect(repo.presignArtwork).toHaveBeenCalledWith("image/jpeg", expect.any(Number));
    expect(fetch).toHaveBeenCalledWith("https://s3.test/put", expect.objectContaining({ method: "PUT" }));
  });

  it("leaves NO orphan attachment when the PUT fails", async () => {
    stubImageDecoder({ width: LARGE.width, height: LARGE.height });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    const onChange = vi.fn();
    render(<ArtworkField label="Artwork" canvas="tile" size="large" value={undefined} onChange={onChange} />);

    await choose(file());

    await screen.findByRole("alert");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("canvas conformance", () => {
  /**
   * ⚠ EXACT, NOT "CLOSE ENOUGH". The platform's promise is that artwork is never cropped, and it
   * holds only because the accepted shape and the rendered box share one ratio. A tolerance here
   * would quietly reintroduce the cropping the design forbids.
   */
  it("refuses a file one pixel off, before uploading anything", async () => {
    stubImageDecoder({ width: LARGE.width + 1, height: LARGE.height });
    const onChange = vi.fn();
    render(<ArtworkField label="Artwork" canvas="tile" size="large" value={undefined} onChange={onChange} />);

    await choose(file());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(new RegExp(`${LARGE.width}`));
    // ⚠ Nothing was sent. The operator learns in a moment rather than after uploading eight megabytes.
    expect(repo.presignArtwork).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts exactly the declared size", async () => {
    stubImageDecoder({ width: LARGE.width, height: LARGE.height });
    const onChange = vi.fn();
    render(<ArtworkField label="Artwork" canvas="tile" size="large" value={undefined} onChange={onChange} />);

    await choose(file());
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("takes the canvas from the sibling size, not from a copy of the mapping", async () => {
    // ⚠ tile-wide and tile-tall are inverses, so a mapping written twice would accept a wide image
    // for a tall tile and vice versa — and the picture would render stretched rather than refused.
    const TALL = ARTWORK_CANVASES["tile-tall"];
    stubImageDecoder({ width: TALL.width, height: TALL.height });
    const onChange = vi.fn();
    render(<ArtworkField label="Artwork" canvas="tile" size="tall" value={undefined} onChange={onChange} />);

    await choose(file());
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("says which control to use first when no size has been chosen", async () => {
    stubImageDecoder({ width: 10, height: 10 });
    render(<ArtworkField label="Artwork" canvas="tile" size={undefined} value={undefined} onChange={vi.fn()} />);

    await choose(file());
    expect((await screen.findByRole("alert")).textContent).toMatch(/tile size/i);
  });

  it("states the required size up front, before anything is chosen", () => {
    // An operator who learns the shape only from a rejection has to go back to whoever made the
    // image and ask again.
    render(<ArtworkField label="Artwork" canvas="tile" size="large" value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText(new RegExp(`${LARGE.width} × ${LARGE.height}`))).toBeInTheDocument();
  });
});

describe("showing the operator their own artwork (T061)", () => {
  /**
   * ⚠ THE STORED VALUE IS AN S3 KEY, WHICH A BROWSER CANNOT FETCH. Without the presigned read this
   * field displays a filename — which is what the promotions console does today, and it means an
   * operator attaches a photograph and has no way to confirm they attached the right one.
   */
  it("resolves an attached key to a viewable image", async () => {
    render(<ArtworkField label="Artwork" canvas="tile" size="large" value="home-layout/artwork/1.jpg" onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("presentation")).toHaveAttribute("src", "https://s3.test/get"));
  });

  it("still says the artwork is attached when the preview cannot be resolved", async () => {
    // A preview that will not load is not worth an error — the key IS attached, and failing loudly
    // here would suggest the artwork itself was lost.
    repo.viewArtwork.mockRejectedValue(new Error("nope"));
    render(<ArtworkField label="Artwork" canvas="tile" size="large" value="home-layout/artwork/1.jpg" onChange={vi.fn()} />);
    expect(await screen.findByText(/Artwork attached/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks for nothing when there is no artwork yet", () => {
    render(<ArtworkField label="Artwork" canvas="tile" size="large" value={undefined} onChange={vi.fn()} />);
    expect(repo.viewArtwork).not.toHaveBeenCalled();
  });
});
