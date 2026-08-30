import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestScope } from "@effy/edge-shared";

import { FleetError } from "../shared/errors";

vi.mock("./repository");
vi.mock("../shared/audit");

import { recordAudit } from "../shared/audit";
import * as repo from "./repository";
import { releaseStranded } from "./service";

const scope = { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as unknown as
  RequestScope & { log: { info: ReturnType<typeof vi.fn> } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(recordAudit).mockResolvedValue(undefined);
});

describe("releaseStranded — FR-021, the one place work moves by human hand", () => {
  it("requires a note saying where the goods are", async () => {
    // ⚠ Releasing asserts something about the PHYSICAL world — the packages are back at the hub, or
    // they are written off. No query can know that, so the assertion needs a name against it.
    const err = (await releaseStranded(["ct-1"], [], "  ", "actor-1", scope).catch(
      (e) => e,
    )) as FleetError;
    expect(err.kind).toBe("validation");
    expect(err.fields?.[0]?.field).toBe("note");
    expect(repo.releaseStranded).not.toHaveBeenCalled();
  });

  it("refuses an empty selection instead of reporting a successful no-op", async () => {
    const err = (await releaseStranded([], [], "all recovered", "actor-1", scope).catch(
      (e) => e,
    )) as FleetError;
    expect(err.kind).toBe("validation");
  });

  it("audits the release and emits the metric line", async () => {
    vi.mocked(repo.releaseStranded).mockResolvedValue(2);
    const out = await releaseStranded(["ct-1"], ["dt-1"], "returned to hub", "actor-1", scope);
    expect(out.released).toBe(2);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "driver.work_released" }),
    );
    expect(scope.log.info).toHaveBeenCalledWith({ released: 2 }, "fleet.stranded_work_released");
  });
});
