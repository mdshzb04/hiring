"use client";

import { useContextStore } from "@/lib/stores/contextStore";
import { useUiStore } from "@/lib/stores/uiStore";
import { diffJson, diffPathMap, countDiffChanges } from "@/lib/utils/contextDiff";
import { JsonTree, useLargePayloadMode } from "./JsonTree";
import { useMemo } from "react";

export function ContextPanel() {
  const snapshots = useContextStore((s) => s.snapshots);
  const activeContextId = useContextStore((s) => s.activeContextId);
  const selectedIndex = useContextStore((s) => s.selectedIndex);
  const setSelectedIndex = useContextStore((s) => s.setSelectedIndex);
  const contextOpen = useUiStore((s) => s.contextOpen);
  const setContextOpen = useUiStore((s) => s.setContextOpen);

  const contextId = activeContextId ?? Object.keys(snapshots)[0] ?? null;
  const history = contextId ? (snapshots[contextId] ?? []) : [];
  const idx = contextId ? (selectedIndex[contextId] ?? history.length - 1) : 0;
  const snapshot = history[idx];
  const prevSnapshot = idx > 0 ? history[idx - 1] : undefined;

  const diffEntries = useMemo(() => {
    if (!snapshot || !prevSnapshot) return [];
    return diffJson(prevSnapshot.data, snapshot.data);
  }, [snapshot, prevSnapshot]);

  const diffMap = useMemo(() => diffPathMap(diffEntries), [diffEntries]);
  const changeCount = countDiffChanges(diffEntries);
  const isLarge = useLargePayloadMode(snapshot?.payloadSizeBytes ?? 0);

  if (!contextOpen) {
    return (
      <button
        type="button"
        onClick={() => setContextOpen(true)}
        className="h-8 w-full border-t bg-gray-50 text-xs hover:bg-gray-100"
      >
        Context Inspector ▲
      </button>
    );
  }

  return (
    <section
      className="flex max-h-72 shrink-0 flex-col border-t bg-white"
      data-panel="context"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Context Inspector</h2>
        <button
          type="button"
          onClick={() => setContextOpen(false)}
          className="text-xs text-gray-500 hover:text-gray-800"
        >
          Collapse
        </button>
      </div>

      {!contextId || !snapshot ? (
        <p className="p-4 text-xs text-gray-400">
          No context snapshots yet. Send a message to the agent.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
            <span className="font-mono text-violet-700">{contextId}</span>
            <span className="text-gray-400">
              {(snapshot.payloadSizeBytes / 1024).toFixed(1)} KB
            </span>
            {isLarge && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                Large payload — tree collapsed by default
              </span>
            )}
            {changeCount > 0 && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800">
                {changeCount} changes vs previous
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 border-b px-3 py-2">
            <button
              type="button"
              disabled={idx <= 0}
              onClick={() => setSelectedIndex(contextId, idx - 1)}
              className="rounded border px-2 py-0.5 text-xs disabled:opacity-40"
            >
              ← Prev
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, history.length - 1)}
              value={idx}
              onChange={(e) =>
                setSelectedIndex(contextId, Number(e.target.value))
              }
              className="flex-1"
            />
            <span className="text-xs text-gray-500">
              {idx + 1} / {history.length}
            </span>
            <button
              type="button"
              disabled={idx >= history.length - 1}
              onClick={() => setSelectedIndex(contextId, idx + 1)}
              className="rounded border px-2 py-0.5 text-xs disabled:opacity-40"
            >
              Next →
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <JsonTree
              data={snapshot.data}
              diffMap={diffMap}
              defaultCollapsed={isLarge}
            />
          </div>
        </>
      )}
    </section>
  );
}
