import { create } from "zustand";
import type { ConnectionStatus } from "@/lib/agent/AgentSocket";

export type StreamPhase = "streaming" | "paused" | "done";

export type StreamSegment =
  | { type: "text"; id: string; content: string }
  | { type: "tool"; id: string; callId: string };

export interface AgentStream {
  streamId: string;
  segments: StreamSegment[];
  phase: StreamPhase;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  streamId?: string;
}

interface StreamStoreState {
  connectionStatus: ConnectionStatus;
  messages: ChatMessage[];
  streams: Record<string, AgentStream>;
  activeStreamId: string | null;

  setConnectionStatus: (status: ConnectionStatus) => void;
  addUserMessage: (content: string) => void;
  ensureAgentStream: (streamId: string) => void;
  appendToken: (streamId: string, text: string) => void;
  resumeStream: (streamId: string) => void;
  endStream: (streamId: string) => void;
  addToolToStream: (streamId: string, callId: string) => void;
  reset: () => void;
}

function createEmptyStream(streamId: string): AgentStream {
  return {
    streamId,
    segments: [{ type: "text", id: crypto.randomUUID(), content: "" }],
    phase: "streaming",
  };
}

function streamFullText(stream: AgentStream): string {
  return stream.segments
    .filter((s): s is Extract<StreamSegment, { type: "text" }> => s.type === "text")
    .map((s) => s.content)
    .join("");
}

function appendToLastTextSegment(
  segments: StreamSegment[],
  text: string,
): StreamSegment[] {
  const last = segments[segments.length - 1];
  if (last?.type === "text") {
    return [
      ...segments.slice(0, -1),
      { ...last, content: last.content + text },
    ];
  }
  return [...segments, { type: "text", id: crypto.randomUUID(), content: text }];
}

function updateAgentMessageContent(
  messages: ChatMessage[],
  streamId: string,
  content: string,
): ChatMessage[] {
  return messages.map((m) =>
    m.role === "agent" && m.streamId === streamId ? { ...m, content } : m,
  );
}

export const useStreamStore = create<StreamStoreState>((set, get) => ({
  connectionStatus: "disconnected",
  messages: [],
  streams: {},
  activeStreamId: null,

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  addUserMessage: (content) => {
    const id = crypto.randomUUID();
    set((state) => ({
      messages: [...state.messages, { id, role: "user", content }],
      activeStreamId: null,
    }));
  },

  ensureAgentStream: (streamId) => {
    const { streams, messages } = get();
    if (streams[streamId]) return;

    const stream = createEmptyStream(streamId);
    const agentMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "agent",
      content: "",
      streamId,
    };

    set({
      streams: { ...streams, [streamId]: stream },
      messages: [...messages, agentMessage],
      activeStreamId: streamId,
    });
  },

  appendToken: (streamId, text) => {
    get().ensureAgentStream(streamId);

    set((state) => {
      const existing = state.streams[streamId] ?? createEmptyStream(streamId);
      if (existing.phase === "paused") {
        return state;
      }

      const segments = appendToLastTextSegment(existing.segments, text);
      const updated: AgentStream = {
        ...existing,
        segments,
        phase: "streaming",
      };
      const fullText = streamFullText(updated);

      return {
        streams: { ...state.streams, [streamId]: updated },
        messages: updateAgentMessageContent(state.messages, streamId, fullText),
        activeStreamId: streamId,
      };
    });
  },

  resumeStream: (streamId) => {
    set((state) => {
      const existing = state.streams[streamId];
      if (!existing) return state;

      const last = existing.segments[existing.segments.length - 1];
      const segments =
        last?.type === "text"
          ? existing.segments
          : [
              ...existing.segments,
              { type: "text" as const, id: crypto.randomUUID(), content: "" },
            ];

      return {
        streams: {
          ...state.streams,
          [streamId]: { ...existing, segments, phase: "streaming" },
        },
      };
    });
  },

  endStream: (streamId) => {
    set((state) => {
      const existing = state.streams[streamId];
      if (!existing) return state;
      return {
        streams: {
          ...state.streams,
          [streamId]: { ...existing, phase: "done" },
        },
        activeStreamId:
          state.activeStreamId === streamId ? null : state.activeStreamId,
      };
    });
  },

  addToolToStream: (streamId, callId) => {
    get().ensureAgentStream(streamId);
    set((state) => {
      const existing = state.streams[streamId];
      if (!existing) return state;
      if (existing.segments.some((s) => s.type === "tool" && s.callId === callId)) {
        return state;
      }
      return {
        streams: {
          ...state.streams,
          [streamId]: {
            ...existing,
            segments: [
              ...existing.segments,
              { type: "tool", id: crypto.randomUUID(), callId },
            ],
            phase: "paused",
          },
        },
      };
    });
  },

  reset: () =>
    set({
      messages: [],
      streams: {},
      activeStreamId: null,
    }),
}));
