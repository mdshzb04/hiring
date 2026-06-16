"use client";

import type { ToolCallRecord } from "@/lib/stores/toolCallStore";
import { useUiStore } from "@/lib/stores/uiStore";
import { useTimelineStore } from "@/lib/stores/timelineStore";
import { useEffect, useRef } from "react";

interface ToolCallCardProps {
  tool: ToolCallRecord;
  highlighted: boolean;
}

export function ToolCallCard({ tool, highlighted }: ToolCallCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const highlightFromChat = useUiStore((s) => s.highlightFromChat);

  useEffect(() => {
    if (highlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlighted]);

  function handleClick() {
    const trace =
      useTimelineStore.getState().findByCallId(tool.callId) ??
      useTimelineStore
        .getState()
        .entries.find((e) => e.callId === tool.callId && e.kind === "tool_call");
    if (trace) {
      highlightFromChat(
        { type: "tool", callId: tool.callId },
        trace.id,
      );
    }
  }

  const statusLabel =
    tool.status === "waiting"
      ? "Waiting for result…"
      : tool.status === "ack_sent"
        ? "Acknowledged"
        : "Completed";

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      data-call-id={tool.callId}
      className={`my-2 rounded border-l-4 bg-white p-3 text-left shadow-sm ${
        highlighted
          ? "border-blue-600 ring-2 ring-blue-200"
          : "border-violet-500"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-violet-800">
          {tool.toolName}
        </span>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            tool.status === "completed"
              ? "bg-green-100 text-green-800"
              : tool.status === "waiting"
                ? "bg-amber-100 text-amber-800"
                : "bg-gray-100 text-gray-700"
          }`}
        >
          {statusLabel}
        </span>
      </div>
      <pre className="mt-2 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-700">
        {JSON.stringify(tool.args, null, 2)}
      </pre>
      {tool.result !== null && (
        <div className="mt-2 border-t pt-2">
          <p className="text-xs font-medium text-gray-500">Result</p>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-green-50 p-2 text-xs text-gray-800">
            {JSON.stringify(tool.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
