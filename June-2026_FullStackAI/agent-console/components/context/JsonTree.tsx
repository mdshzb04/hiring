"use client";

import { useState, useMemo } from "react";
import type { DiffOp } from "@/lib/utils/contextDiff";

const LARGE_PAYLOAD_BYTES = 500_000;
const MAX_INITIAL_CHILDREN = 50;

interface JsonTreeProps {
  data: unknown;
  path?: string;
  diffMap?: Map<string, DiffOp>;
  defaultCollapsed?: boolean;
  depth?: number;
}

function diffClass(op: DiffOp | undefined): string {
  switch (op) {
    case "add":
      return "bg-green-50 text-green-900";
    case "remove":
      return "bg-red-50 text-red-900 line-through";
    case "change":
      return "bg-amber-50 text-amber-900";
    default:
      return "";
  }
}

function JsonNode({
  label,
  value,
  path,
  diffMap,
  defaultCollapsed,
  depth = 0,
}: {
  label: string;
  value: unknown;
  path: string;
  diffMap?: Map<string, DiffOp>;
  defaultCollapsed?: boolean;
  depth?: number;
}) {
  const [open, setOpen] = useState(!defaultCollapsed && depth < 2);
  const op = diffMap?.get(path);

  if (value === null || typeof value !== "object") {
    return (
      <div className={`py-0.5 pl-4 font-mono text-xs ${diffClass(op)}`}>
        <span className="text-violet-600">{label}: </span>
        <span className="text-gray-800">{JSON.stringify(value)}</span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  const truncated = entries.length > MAX_INITIAL_CHILDREN;
  const visible = truncated ? entries.slice(0, MAX_INITIAL_CHILDREN) : entries;

  return (
    <div className={`text-xs ${diffClass(op)}`}>
      <button
        type="button"
        className="flex items-center gap-1 py-0.5 pl-2 font-mono hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? "▼" : "▶"}</span>
        <span className="text-violet-600">{label}</span>
        <span className="text-gray-400">
          {isArray ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {open && (
        <div className="border-l border-gray-200 ml-3">
          {visible.map(([k, v]) => (
            <JsonNode
              key={`${path}.${k}`}
              label={k}
              value={v}
              path={isArray ? `${path}[${k}]` : path ? `${path}.${k}` : k}
              diffMap={diffMap}
              defaultCollapsed={defaultCollapsed}
              depth={depth + 1}
            />
          ))}
          {truncated && (
            <p className="py-1 pl-4 text-gray-400">
              … {entries.length - MAX_INITIAL_CHILDREN} more keys (expand lazily
              by collapsing siblings)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function JsonTree({
  data,
  path = "",
  diffMap,
  defaultCollapsed = false,
  depth = 0,
}: JsonTreeProps) {
  return (
    <JsonNode
      label="root"
      value={data}
      path={path || "root"}
      diffMap={diffMap}
      defaultCollapsed={defaultCollapsed}
      depth={depth}
    />
  );
}

export function useLargePayloadMode(sizeBytes: number): boolean {
  return useMemo(() => sizeBytes >= LARGE_PAYLOAD_BYTES, [sizeBytes]);
}
