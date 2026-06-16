import { create } from "zustand";
import type { TraceEntryKind } from "@/lib/stores/timelineStore";

export type ChatHighlight =
  | { type: "stream"; streamId: string }
  | { type: "tool"; callId: string }
  | { type: "segment"; streamId: string; segmentId: string };

interface UiStoreState {
  timelineOpen: boolean;
  contextOpen: boolean;
  timelineFilter: TraceEntryKind | "all";
  timelineSearch: string;
  highlightedTraceId: string | null;
  chatHighlight: ChatHighlight | null;
  contextScrubIndex: Record<string, number>;

  setTimelineOpen: (open: boolean) => void;
  setContextOpen: (open: boolean) => void;
  setTimelineFilter: (filter: TraceEntryKind | "all") => void;
  setTimelineSearch: (search: string) => void;
  highlightFromTrace: (traceId: string, highlight: ChatHighlight) => void;
  highlightFromChat: (highlight: ChatHighlight, traceId: string) => void;
  clearHighlight: () => void;
  setContextScrubIndex: (contextId: string, index: number) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  timelineOpen: true,
  contextOpen: true,
  timelineFilter: "all",
  timelineSearch: "",
  highlightedTraceId: null,
  chatHighlight: null,
  contextScrubIndex: {},

  setTimelineOpen: (open) => set({ timelineOpen: open }),
  setContextOpen: (open) => set({ contextOpen: open }),
  setTimelineFilter: (filter) => set({ timelineFilter: filter }),
  setTimelineSearch: (search) => set({ timelineSearch: search }),

  highlightFromTrace: (traceId, highlight) =>
    set({ highlightedTraceId: traceId, chatHighlight: highlight }),

  highlightFromChat: (highlight, traceId) =>
    set({ chatHighlight: highlight, highlightedTraceId: traceId }),

  clearHighlight: () =>
    set({ highlightedTraceId: null, chatHighlight: null }),

  setContextScrubIndex: (contextId, index) =>
    set((state) => ({
      contextScrubIndex: { ...state.contextScrubIndex, [contextId]: index },
    })),
}));
