"use client";

import { useStreamStore } from "@/lib/stores/streamStore";
import { useToolCallStore } from "@/lib/stores/toolCallStore";
import { useUiStore } from "@/lib/stores/uiStore";
import { useTimelineStore } from "@/lib/stores/timelineStore";
import { ToolCallCard } from "./ToolCallCard";

interface AgentMessageProps {
  streamId: string;
}

export function AgentMessage({ streamId }: AgentMessageProps) {
  const stream = useStreamStore((s) => s.streams[streamId]);
  const tools = useToolCallStore((s) => s.tools);
  const chatHighlight = useUiStore((s) => s.chatHighlight);
  const highlightFromChat = useUiStore((s) => s.highlightFromChat);

  if (!stream) {
    return (
      <span className="inline-block rounded bg-gray-100 px-3 py-2 text-gray-400">
        …
      </span>
    );
  }

  function handleTextClick(segmentId: string) {
    const trace = useTimelineStore.getState().findByStreamId(streamId);
    if (trace) {
      highlightFromChat(
        { type: "segment", streamId, segmentId },
        trace.id,
      );
    }
  }

  return (
    <div
      className="inline-block max-w-[85%] rounded bg-gray-100 px-3 py-2 text-left"
      data-stream-id={streamId}
    >
      {stream.segments.map((segment) => {
        if (segment.type === "text") {
          const highlighted =
            chatHighlight?.type === "segment" &&
            chatHighlight.segmentId === segment.id;
          return (
            <span
              key={segment.id}
              data-segment-id={segment.id}
              role="button"
              tabIndex={0}
              onClick={() => handleTextClick(segment.id)}
              onKeyDown={(e) =>
                e.key === "Enter" && handleTextClick(segment.id)
              }
              className={`whitespace-pre-wrap ${
                highlighted ? "rounded bg-blue-100 ring-1 ring-blue-300" : ""
              }`}
            >
              {segment.content || (stream.phase !== "done" ? "…" : "")}
            </span>
          );
        }

        const tool = tools[segment.callId];
        if (!tool) {
          return (
            <div
              key={segment.id}
              className="my-2 rounded border border-dashed border-gray-300 p-2 text-xs text-gray-500"
            >
              Tool {segment.callId} (waiting…)
            </div>
          );
        }

        return (
          <ToolCallCard
            key={segment.id}
            tool={tool}
            highlighted={
              chatHighlight?.type === "tool" &&
              chatHighlight.callId === segment.callId
            }
          />
        );
      })}
    </div>
  );
}
