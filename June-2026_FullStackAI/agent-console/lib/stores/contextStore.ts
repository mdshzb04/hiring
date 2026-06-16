import { create } from "zustand";
import type { ContextSnapshotMessage } from "@/lib/protocol/types";

export interface ContextSnapshot {
  seq: number;
  contextId: string;
  data: Record<string, unknown>;
  receivedAt: number;
  payloadSizeBytes: number;
}

interface ContextStoreState {
  snapshots: Record<string, ContextSnapshot[]>;
  activeContextId: string | null;
  selectedIndex: Record<string, number>;
  ingestSnapshot: (msg: ContextSnapshotMessage) => void;
  setSelectedIndex: (contextId: string, index: number) => void;
  reset: () => void;
}

export const useContextStore = create<ContextStoreState>((set) => ({
  snapshots: {},
  activeContextId: null,
  selectedIndex: {},

  ingestSnapshot: (msg) => {
    const payloadSizeBytes = JSON.stringify(msg.data).length;
    const snapshot: ContextSnapshot = {
      seq: msg.seq,
      contextId: msg.context_id,
      data: msg.data,
      receivedAt: Date.now(),
      payloadSizeBytes,
    };

    set((state) => {
      const history = state.snapshots[msg.context_id] ?? [];
      const newIndex = history.length;
      return {
        snapshots: {
          ...state.snapshots,
          [msg.context_id]: [...history, snapshot],
        },
        activeContextId: msg.context_id,
        selectedIndex: {
          ...state.selectedIndex,
          [msg.context_id]: newIndex,
        },
      };
    });
  },

  setSelectedIndex: (contextId, index) =>
    set((state) => ({
      selectedIndex: { ...state.selectedIndex, [contextId]: index },
      activeContextId: contextId,
    })),

  reset: () => set({ snapshots: {}, activeContextId: null, selectedIndex: {} }),
}));
