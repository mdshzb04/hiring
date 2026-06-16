import { create } from "zustand";
import type { MessageMeta, ServerMessage } from "@/lib/protocol/types";

export type TraceEntryKind =
  | "token_group"
  | "tool_call"
  | "tool_result"
  | "context"
  | "ping"
  | "stream_end"
  | "error"
  | "system";

export interface TraceEntry {
  id: string;
  kind: TraceEntryKind;
  seq?: number;
  streamId?: string;
  callId?: string;
  contextId?: string;
  summary: string;
  detail?: string;
  tokenCount?: number;
  durationMs?: number;
  source: MessageMeta["source"];
  receivedAt: number;
  startedAt?: number;
}

interface TimelineStoreState {
  entries: TraceEntry[];
  record: (msg: ServerMessage, meta: MessageMeta) => void;
  recordSystem: (summary: string) => void;
  recordDuplicate: (msg: ServerMessage, meta: MessageMeta) => void;
  findByCallId: (callId: string) => TraceEntry | undefined;
  findByStreamId: (streamId: string) => TraceEntry | undefined;
  reset: () => void;
}

function summarize(msg: ServerMessage): string {
  switch (msg.type) {
    case "TOKEN":
      return `TOKEN`;
    case "TOOL_CALL":
      return `TOOL_CALL ${msg.tool_name}`;
    case "TOOL_RESULT":
      return `TOOL_RESULT ${msg.call_id}`;
    case "CONTEXT_SNAPSHOT":
      return `CONTEXT ${msg.context_id}`;
    case "PING":
      return msg.challenge === "" ? "PING (corrupt)" : `PING`;
    case "STREAM_END":
      return `STREAM_END ${msg.stream_id}`;
    case "ERROR":
      return `ERROR ${msg.code}: ${msg.message}`;
  }
}

function baseEntry(
  msg: ServerMessage,
  meta: MessageMeta,
  kind: TraceEntryKind,
): TraceEntry {
  return {
    id: `trace-${msg.seq}-${kind}-${meta.receivedAt}`,
    kind,
    seq: msg.seq,
    streamId: "stream_id" in msg ? msg.stream_id : undefined,
    callId: "call_id" in msg ? msg.call_id : undefined,
    contextId: msg.type === "CONTEXT_SNAPSHOT" ? msg.context_id : undefined,
    summary: summarize(msg),
    detail:
      msg.type === "TOOL_CALL"
        ? JSON.stringify(msg.args, null, 2)
        : msg.type === "TOOL_RESULT"
          ? JSON.stringify(msg.result, null, 2)
          : msg.type === "CONTEXT_SNAPSHOT"
            ? `${Object.keys(msg.data).length} keys`
            : msg.type === "TOKEN"
              ? msg.text
              : msg.type === "PING"
                ? msg.challenge
                : undefined,
    source: meta.source,
    receivedAt: meta.receivedAt,
  };
}

export const useTimelineStore = create<TimelineStoreState>((set, get) => ({
  entries: [],

  record: (msg, meta) => {
    set((state) => {
      if (msg.type === "TOKEN") {
        const last = state.entries[state.entries.length - 1];
        if (
          last &&
          last.kind === "token_group" &&
          last.streamId === msg.stream_id &&
          meta.receivedAt - (last.startedAt ?? last.receivedAt) < 3000
        ) {
          const tokenCount = (last.tokenCount ?? 1) + 1;
          const startedAt = last.startedAt ?? last.receivedAt;
          const durationMs = meta.receivedAt - startedAt;
          const fullText = `${last.detail ?? ""}${msg.text}`;
          const updated = [...state.entries];
          updated[updated.length - 1] = {
            ...last,
            tokenCount,
            durationMs,
            detail: fullText,
            summary: `Streamed ${tokenCount} tokens (${(durationMs / 1000).toFixed(1)}s)`,
            receivedAt: meta.receivedAt,
            startedAt,
          };
          return { entries: updated };
        }

        return {
          entries: [
            ...state.entries,
            {
              ...baseEntry(msg, meta, "token_group"),
              tokenCount: 1,
              startedAt: meta.receivedAt,
              durationMs: 0,
              summary: "Streamed 1 token (0.0s)",
              detail: msg.text,
            },
          ],
        };
      }

      const kind: TraceEntryKind =
        msg.type === "TOOL_CALL"
          ? "tool_call"
          : msg.type === "TOOL_RESULT"
            ? "tool_result"
            : msg.type === "CONTEXT_SNAPSHOT"
              ? "context"
              : msg.type === "PING"
                ? "ping"
                : msg.type === "STREAM_END"
                  ? "stream_end"
                  : "error";

      const entry = baseEntry(msg, meta, kind);
      // Chaos may deliver the same seq twice on the wire before router dedup settles.
      if (state.entries.some((e) => e.seq === msg.seq && e.kind === kind)) {
        return {
          entries: [
            ...state.entries,
            {
              id: `dup-wire-${msg.seq}-${meta.receivedAt}`,
              kind: "system",
              seq: msg.seq,
              summary: `duplicate wire delivery seq=${msg.seq} (${msg.type})`,
              source: meta.source,
              receivedAt: meta.receivedAt,
            },
          ],
        };
      }

      return {
        entries: [...state.entries, entry],
      };
    });
  },

  recordSystem: (summary) => {
    set((state) => ({
      entries: [
        ...state.entries,
        {
          id: `system-${Date.now()}`,
          kind: "system",
          summary,
          source: "live",
          receivedAt: Date.now(),
        },
      ],
    }));
  },

  recordDuplicate: (msg, meta) => {
    set((state) => ({
      entries: [
        ...state.entries,
        {
          id: `dup-${msg.seq}-${meta.receivedAt}`,
          kind: "system",
          seq: msg.seq,
          summary: `duplicate rejected seq=${msg.seq}`,
          source: meta.source,
          receivedAt: meta.receivedAt,
        },
      ],
    }));
  },

  findByCallId: (callId) =>
    get().entries.find(
      (e) =>
        e.callId === callId &&
        (e.kind === "tool_call" || e.kind === "tool_result"),
    ),

  findByStreamId: (streamId) =>
    get().entries.find(
      (e) => e.kind === "token_group" && e.streamId === streamId,
    ),

  reset: () => set({ entries: [] }),
}));
