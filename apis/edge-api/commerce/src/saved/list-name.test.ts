import { LIST_NAME_MAX } from "@effy/shared-types";
import { describe, expect, it } from "vitest";

import { InvalidListNameError, ListNameTakenError, normaliseListName } from "./list-name";

const forty = "a".repeat(LIST_NAME_MAX);

describe("normaliseListName", () => {
  it.each([
    ["plain", "Weekly Items", "Weekly Items"],
    ["trims both ends", "  Weekly Items \n", "Weekly Items"],
    ["collapses inner whitespace", "Weekly \t\n  Items", "Weekly Items"],
    ["drops control characters", "Week\x00ly\x07", "Weekly"],
    ["exactly the limit", forty, forty],
    ["forty emoji — counted in code points, not UTF-16 units", "🥚".repeat(LIST_NAME_MAX), "🥚".repeat(LIST_NAME_MAX)],
    ["over the limit only before trimming", `${forty}   `, forty],
    ["non-English", "週の買い物", "週の買い物"],
    ["markup is just characters", "<script>x</script>", "<script>x</script>"],
    ["a name that merely contains the reserved one", "Saved for later", "Saved for later"],
    ["a no-break space separates like any other", "Weekly Items", "Weekly Items"],
  ])("%s", (_name, input, want) => {
    expect(normaliseListName(input)).toBe(want);
  });

  it.each([
    ["empty", ""],
    ["only whitespace", " \t\n "],
    ["only control characters", "\x00\x01"],
    ["one over the limit", `${forty}a`],
    ["forty-one emoji", "🥚".repeat(LIST_NAME_MAX + 1)],
  ])("%s is invalid", (_name, input) => {
    expect(() => normaliseListName(input)).toThrow(InvalidListNameError);
  });

  it.each(["Saved", "  sAVED ", "SAVED"])("%j is the default's name and cannot be taken", (input) => {
    expect(() => normaliseListName(input)).toThrow(ListNameTakenError);
  });
});
