// ─────────────────────────────────────────────────────────────
// JSON diff — pure functions for context inspector
// ─────────────────────────────────────────────────────────────

export type DiffOp = "add" | "remove" | "change" | "same";

export interface DiffEntry {
  path: string;
  op: DiffOp;
  before?: unknown;
  after?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Shallow+deep diff for nested JSON objects and arrays.
 * Produces flat path entries suitable for tree highlighting.
 */
export function diffJson(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  basePath = "",
): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));
  const allKeys = new Set([...beforeKeys, ...afterKeys]);

  for (const key of allKeys) {
    const path = basePath ? `${basePath}.${key}` : key;
    const bVal = before[key];
    const aVal = after[key];

    if (!beforeKeys.has(key)) {
      entries.push({ path, op: "add", after: aVal });
      continue;
    }
    if (!afterKeys.has(key)) {
      entries.push({ path, op: "remove", before: bVal });
      continue;
    }

    if (isRecord(bVal) && isRecord(aVal)) {
      entries.push(...diffJson(bVal, aVal, path));
      continue;
    }

    if (Array.isArray(bVal) && Array.isArray(aVal)) {
      const maxLen = Math.max(bVal.length, aVal.length);
      for (let i = 0; i < maxLen; i++) {
        const itemPath = `${path}[${i}]`;
        if (i >= bVal.length) {
          entries.push({ path: itemPath, op: "add", after: aVal[i] });
        } else if (i >= aVal.length) {
          entries.push({ path: itemPath, op: "remove", before: bVal[i] });
        } else if (JSON.stringify(bVal[i]) !== JSON.stringify(aVal[i])) {
          entries.push({
            path: itemPath,
            op: "change",
            before: bVal[i],
            after: aVal[i],
          });
        }
      }
      continue;
    }

    if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      entries.push({ path, op: "change", before: bVal, after: aVal });
    } else {
      entries.push({ path, op: "same", before: bVal, after: aVal });
    }
  }

  return entries;
}

export function diffPathMap(entries: DiffEntry[]): Map<string, DiffOp> {
  const map = new Map<string, DiffOp>();
  for (const e of entries) {
    if (e.op !== "same") {
      map.set(e.path, e.op);
    }
  }
  return map;
}

export function countDiffChanges(entries: DiffEntry[]): number {
  return entries.filter((e) => e.op !== "same").length;
}
