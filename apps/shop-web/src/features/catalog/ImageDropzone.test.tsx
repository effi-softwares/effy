import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImageDropzone, MAX_IMAGE_BYTES, validateImageFile } from "./ImageDropzone";

function imageFile(name: string, type: string, size = 1024): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("validateImageFile (mirrors the backend allow-list)", () => {
  it("accepts jpeg / png / webp within the size limit", () => {
    expect(validateImageFile(imageFile("a.jpg", "image/jpeg"))).toBeNull();
    expect(validateImageFile(imageFile("a.png", "image/png"))).toBeNull();
    expect(validateImageFile(imageFile("a.webp", "image/webp"))).toBeNull();
  });

  it("rejects a non-image / wrong type", () => {
    expect(validateImageFile(imageFile("a.pdf", "application/pdf"))).toMatch(/JPEG, PNG, or WebP/);
    expect(validateImageFile(imageFile("a.gif", "image/gif"))).toMatch(/JPEG, PNG, or WebP/);
  });

  it("rejects an oversize image", () => {
    expect(validateImageFile(imageFile("big.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1))).toMatch(
      /10 MB or smaller/,
    );
  });
});

describe("ImageDropzone", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows the three-modality prompt when empty", () => {
    render(<ImageDropzone file={null} onChange={vi.fn()} />);
    expect(screen.getByText(/Add the primary image/i)).toBeInTheDocument();
    expect(screen.getByText(/Click to browse/i)).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop/i)).toBeInTheDocument();
    expect(screen.getByText(/Paste/i)).toBeInTheDocument();
  });

  it("accepts a dropped valid image (onChange called with the file)", () => {
    const onChange = vi.fn();
    render(<ImageDropzone file={null} onChange={onChange} />);
    const zone = screen.getByLabelText(/Add primary image/i);
    const file = imageFile("hero.png", "image/png");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onChange).toHaveBeenCalledWith(file);
  });

  it("rejects a dropped wrong-type file and surfaces an inline error (no onChange)", () => {
    const onChange = vi.fn();
    render(<ImageDropzone file={null} onChange={onChange} />);
    const zone = screen.getByLabelText(/Add primary image/i);
    fireEvent.drop(zone, { dataTransfer: { files: [imageFile("doc.pdf", "application/pdf")] } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Use a JPEG, PNG, or WebP image.")).toBeInTheDocument();
  });

  it("accepts a pasted image from the clipboard", () => {
    const onChange = vi.fn();
    render(<ImageDropzone file={null} onChange={onChange} />);
    const file = imageFile("pasted.webp", "image/webp");
    // Simulate a clipboard paste carrying an image item.
    fireEvent.paste(document, {
      clipboardData: { items: [{ type: "image/webp", getAsFile: () => file }] },
    });
    expect(onChange).toHaveBeenCalledWith(file);
  });
});
