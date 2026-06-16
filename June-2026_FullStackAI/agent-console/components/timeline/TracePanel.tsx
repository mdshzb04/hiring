"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import {
  useTimelineStore,
  type TraceEntry,
  type TraceEntryKind,
} from "@/lib/stores/timelineStore";
import { useUiStore } from "@/lib/stores/uiStore";

const FILTER_OPTIONS: { value: TraceEntryKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "token_group", label: "Tokens" },
  { value: "tool_call", label: "Tool calls" },
  { value: "tool_result", label: "Tool results" },
  { value: "context", label: "Context" },
  { value: "ping", label: "Ping" },
  { value: "stream_end", label: "Stream end" },
  { value: "error", label: "Error" },
  { value: "system", label: "System" },
];

function kindColor(kind: TraceEntryKind): string {
  switch (kind) {
    case "token_group":
      return "text-blue-700";
    case "tool_call":
      return "text-violet-700";
    case "tool_result":
      return "text-green-700";
    case "context":
      return "text-amber-700";
    case "ping":
      return "text-gray-600";
    case "stream_end":
      return "text-indigo-700";
    case "error":
      return "text-red-700";
    default:
      return "text-gray-500";
  }
}

function TraceRow({
  entry,
  highlighted,
  linkedCallId,
  onSelect,
}: {
  entry: TraceEntry;
  highlighted: boolean;
  linkedCallId?: string;
  onSelect: (entry: TraceEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLinkedTool =
    linkedCallId &&
    (entry.kind === "tool_call" || entry.kind === "tool_result") &&
    entry.callId === linkedCallId;

  return (
    <div
      className={`border-b border-gray-100 px-2 py-1.5 text-xs ${
        highlighted ? "bg-blue-50 ring-1 ring-inset ring-blue-300" : ""
      } ${isLinkedTool ? "border-l-2 border-l-violet-400 pl-3" : ""}`}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onSelect(entry)}
      >
        <div className="flex items-start gap-2">
          <span className="shrink-0 font-mono text-gray-400">
            {entry.seq ?? "—"}
          </span>
          <span className={`flex-1 ${kindColor(entry.kind)}`}>
            {entry.summary}
          </span>
          <span className="shrink-0 text-gray-400">
            {entry.source === "replay" ? "↺" : ""}
          </span>
        </div>
      </button>
      {(entry.detail || entry.kind === "token_group") && (
        <button
          type="button"
          className="mt-1 text-[10px] text-blue-600 hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
      {expanded && entry.detail && (
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-[10px] text-gray-700">
          {entry.detail.length > 2000
            ? `${entry.detail.slice(0, 2000)}…`
            : entry.detail}
        </pre>
      )}
    </div>
  );
}

export function TracePanel() {
  const entries = useTimelineStore((s) => s.entries);
  const timelineOpen = useUiStore((s) => s.timelineOpen);
  const setTimelineOpen = useUiStore((s) => s.setTimelineOpen);
  const filter = useUiStore((s) => s.timelineFilter);
  const setFilter = useUiStore((s) => s.setTimelineFilter);
  const search = useUiStore((s) => s.timelineSearch);
  const setSearch = useUiStore((s) => s.setTimelineSearch);
  const highlightedTraceId = useUiStore((s) => s.highlightedTraceId);
  const highlightFromTrace = useUiStore((s) => s.highlightFromTrace);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== "all" && e.kind !== filter) return false;
      if (!q) return true;
      return (
        e.summary.toLowerCase().includes(q) ||
        (e.detail?.toLowerCase().includes(q) ?? false) ||
        String(e.seq).includes(q)
      );
    });
  }, [entries, filter, search]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, autoScroll]);

  function handleSelect(entry: TraceEntry) {
    if (entry.kind === "tool_call" || entry.kind === "tool_result") {
      if (entry.callId) {
        highlightFromTrace(entry.id, { type: "tool", callId: entry.callId });
        const el = document.querySelector(`[data-call-id="${entry.callId}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } else if (entry.kind === "token_group" && entry.streamId) {
      highlightFromTrace(entry.id, {
        type: "stream",
        streamId: entry.streamId,
      });
      const el = document.querySelector(`[data-stream-id="${entry.streamId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  if (!timelineOpen) {
    return (
      <button
        type="button"
        onClick={() => setTimelineOpen(true)}
        className="w-8 shrink-0 border-l bg-gray-50 text-xs writing-mode-vertical hover:bg-gray-100"
        style={{ writingMode: "vertical-rl" }}
      >
        Trace
      </button>
    );
  }

  return (
    <aside
      className="flex w-80 shrink-0 flex-col border-l bg-white"
      data-panel="timeline"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Agent Trace</h2>
        <button
          type="button"
          onClick={() => setTimelineOpen(false)}
          className="text-xs text-gray-500 hover:text-gray-800"
        >
          Collapse
        </button>
      </div>

      <div className="space-y-2 border-b p-2">
        <input
          type="search"
          placeholder="Search trace…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border px-2 py-1 text-xs"
        />
        <select
          value={filter}
          onChange={(e) =>
            setFilter(e.target.value as TraceEntryKind | "all")
          }
          className="w-full rounded border px-2 py-1 text-xs"
        >
          {FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[10px] text-gray-500">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          Auto-scroll
        </label>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-4 text-xs text-gray-400">No events yet.</p>
        ) : (
          filtered.map((entry) => {
            const linkedCallId =
              entry.kind === "tool_result" ? entry.callId : undefined;
            return (
              <TraceRow
                key={entry.id}
                entry={entry}
                highlighted={highlightedTraceId === entry.id}
                linkedCallId={linkedCallId}
                onSelect={handleSelect}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </aside>
  );
}
