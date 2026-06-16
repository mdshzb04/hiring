import { describe, it, expect } from "vitest";
import { diffJson, countDiffChanges, diffPathMap } from "@/lib/utils/contextDiff";

describe("contextDiff", () => {
  it("detects added keys", () => {
    const entries = diffJson({ a: 1 }, { a: 1, b: 2 });
    expect(entries.some((e) => e.op === "add" && e.path === "b")).toBe(true);
  });

  it("detects removed keys", () => {
    const entries = diffJson({ a: 1, b: 2 }, { a: 1 });
    expect(entries.some((e) => e.op === "remove" && e.path === "b")).toBe(true);
  });

  it("detects changed values", () => {
    const entries = diffJson({ a: 1 }, { a: 2 });
    const change = entries.find((e) => e.path === "a");
    expect(change?.op).toBe("change");
  });

  it("diffs nested objects", () => {
    const entries = diffJson(
      { user: { name: "Alice" } },
      { user: { name: "Bob" } },
    );
    expect(entries.some((e) => e.path === "user.name" && e.op === "change")).toBe(
      true,
    );
  });

  it("diffPathMap excludes same entries", () => {
    const entries = diffJson({ a: 1 }, { a: 1, b: 2 });
    const map = diffPathMap(entries);
    expect(map.has("a")).toBe(false);
    expect(map.get("b")).toBe("add");
  });

  it("countDiffChanges counts non-same ops", () => {
    const entries = diffJson({ a: 1 }, { a: 2, b: 3 });
    expect(countDiffChanges(entries)).toBeGreaterThan(0);
  });
});
