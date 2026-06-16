import { create } from "zustand";
import type { ToolCallMessage, ToolResultMessage } from "@/lib/protocol/types";

export type ToolCallStatus =
  | "waiting"
  | "ack_sent"
  | "completed";

export interface ToolCallRecord {
  callId: string;
  streamId: string;
  seq: number;
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown> | null;
  status: ToolCallStatus;
  ackSent: boolean;
}

interface ToolCallStoreState {
  tools: Record<string, ToolCallRecord>;
  handleToolCall: (msg: ToolCallMessage) => void;
  handleToolResult: (msg: ToolResultMessage) => void;
  markAckSent: (callId: string) => void;
  reset: () => void;
}

export const useToolCallStore = create<ToolCallStoreState>((set) => ({
  tools: {},

  handleToolCall: (msg) => {
    set((state) => {
      if (state.tools[msg.call_id]) return state;
      return {
        tools: {
          ...state.tools,
          [msg.call_id]: {
            callId: msg.call_id,
            streamId: msg.stream_id,
            seq: msg.seq,
            toolName: msg.tool_name,
            args: msg.args,
            result: null,
            status: "waiting",
            ackSent: false,
          },
        },
      };
    });
  },

  handleToolResult: (msg) => {
    set((state) => {
      const existing = state.tools[msg.call_id];
      if (!existing) return state;
      return {
        tools: {
          ...state.tools,
          [msg.call_id]: {
            ...existing,
            result: msg.result,
            status: "completed",
          },
        },
      };
    });
  },

  markAckSent: (callId) => {
    set((state) => {
      const existing = state.tools[callId];
      if (!existing) return state;
      return {
        tools: {
          ...state.tools,
          [callId]: { ...existing, ackSent: true, status: "ack_sent" },
        },
      };
    });
  },

  reset: () => set({ tools: {} }),
}));
