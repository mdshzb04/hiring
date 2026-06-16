"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AgentSocket, type ConnectionStatus } from "@/lib/agent/AgentSocket";
import {
  MessageRouter,
  ToolAckRegistry,
  scheduleToolAck,
} from "@/lib/agent/MessageRouter";
import { REPLAY_IDLE_MS } from "@/lib/protocol/constants";
import type { MessageMeta, ServerMessage } from "@/lib/protocol/types";
import { useContextStore } from "@/lib/stores/contextStore";
import { useStreamStore } from "@/lib/stores/streamStore";
import { useTimelineStore } from "@/lib/stores/timelineStore";
import { useToolCallStore } from "@/lib/stores/toolCallStore";

interface AgentContextValue {
  sendMessage: (content: string) => boolean;
  connectionStatus: ConnectionStatus;
  canSend: boolean;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) {
    throw new Error("useAgent must be used within AgentProvider");
  }
  return ctx;
}

interface AgentProviderProps {
  children: ReactNode;
}

export function AgentProvider({ children }: AgentProviderProps) {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [canSend, setCanSend] = useState(false);
  const socketRef = useRef<AgentSocket | null>(null);
  const routerRef = useRef<MessageRouter | null>(null);
  const ackRegistryRef = useRef(new ToolAckRegistry());
  const dispatchRef = useRef<(msg: ServerMessage, meta: MessageMeta, socket: AgentSocket) => void>(() => {});
  const refreshCanSendRef = useRef<() => void>(() => {});
  const applyConnectionStatusRef = useRef<(status: ConnectionStatus) => void>(() => {});

  const refreshCanSend = useCallback(() => {
    const socket = socketRef.current;
    setCanSend(
      socket?.connectionStatus === "connected" &&
        !socket.isInputBlocked &&
        !socket.isResuming,
    );
  }, []);

  const applyConnectionStatus = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
    useStreamStore.getState().setConnectionStatus(status);
    refreshCanSendRef.current();
  }, []);

  const dispatchToStores = useCallback(
    (msg: ServerMessage, meta: MessageMeta, socket: AgentSocket) => {
      const router = routerRef.current;
      if (!router) return;

      const timeline = useTimelineStore.getState();
      const stream = useStreamStore.getState();
      const tools = useToolCallStore.getState();
      const context = useContextStore.getState();

      timeline.record(msg, meta);

      switch (msg.type) {
        case "TOKEN":
          stream.appendToken(msg.stream_id, msg.text);
          router.commitProcessed(msg.seq);
          break;

        case "TOOL_CALL":
          tools.handleToolCall(msg);
          stream.addToolToStream(msg.stream_id, msg.call_id);
          if (!ackRegistryRef.current.hasAcked(msg.call_id)) {
            scheduleToolAck(msg.call_id, ackRegistryRef.current, (callId) => {
              const sent = socket.sendToolAck(callId);
              if (sent) {
                tools.markAckSent(callId);
              }
              return sent;
            });
          }
          router.commitProcessed(msg.seq);
          break;

        case "TOOL_RESULT":
          tools.handleToolResult(msg);
          stream.resumeStream(msg.stream_id);
          router.commitProcessed(msg.seq);
          break;

        case "CONTEXT_SNAPSHOT":
          context.ingestSnapshot(msg);
          router.commitProcessed(msg.seq);
          break;

        case "STREAM_END":
          stream.endStream(msg.stream_id);
          router.commitProcessed(msg.seq);
          break;

        case "PING":
        case "ERROR":
          // commitProcessed called inside MessageRouter for these types
          break;
      }
    },
    [],
  );

  useLayoutEffect(() => {
    dispatchRef.current = dispatchToStores;
    refreshCanSendRef.current = refreshCanSend;
    applyConnectionStatusRef.current = applyConnectionStatus;
  });

  // Single mount: empty deps — do NOT list callbacks (would recreate socket each render).
  useEffect(() => {
    const ackRegistry = ackRegistryRef.current;

    const router = new MessageRouter({
      callbacks: {
        onDispatch: (msg, meta) => {
          const socket = socketRef.current;
          if (socket) {
            dispatchRef.current(msg, meta, socket);
          }
        },
        onDuplicate: (msg, meta) => {
          useTimelineStore.getState().recordDuplicate(msg, meta);
        },
        onReplayCaughtUp: () => {
          socketRef.current?.notifyReplayCaughtUp();
          useTimelineStore.getState().recordSystem("replay complete");
          setTimeout(() => refreshCanSendRef.current(), REPLAY_IDLE_MS + 20);
        },
        onTurnReset: () => {
          ackRegistry.reset();
          useToolCallStore.getState().reset();
          useContextStore.getState().reset();
          useTimelineStore.getState().reset();
        },
      },
    });
    routerRef.current = router;

    const socket = new AgentSocket({
      hasActiveTurn: () => router.hasActiveTurn(),
      getLastProcessedSeq: () => router.getLastProcessedSeq(),
      callbacks: {
        onStatusChange: (status) => {
          // Ignore stale sockets (Strict Mode / HMR) so they cannot clobber live status.
          if (socketRef.current !== socket) return;
          applyConnectionStatusRef.current(status);
          useTimelineStore.getState().recordSystem(`connection: ${status}`);
        },
        onServerMessage: (msg, source) => {
          router.ingest(msg, source);
        },
        onCorruptPing: () => {
          // PING still flows through onServerMessage → router → timeline (once).
        },
        onParseError: () => {
          useTimelineStore.getState().recordSystem("parse error");
        },
      },
    });
    socketRef.current = socket;
    socket.connect();

    return () => {
      socketRef.current = null;
      socket.destroy();
      router.destroy();
      routerRef.current = null;
    };
  }, []);

  const sendMessage = useCallback((content: string): boolean => {
    const trimmed = content.trim();
    if (!trimmed) return false;

    const router = routerRef.current;
    const socket = socketRef.current;
    if (!router || !socket) return false;

    const sent = socket.sendUserMessage(trimmed);
    if (!sent) return false;

    router.notifyUserMessageSent();
    useStreamStore.getState().addUserMessage(trimmed);
    return true;
  }, []);

  const value: AgentContextValue = {
    sendMessage,
    connectionStatus,
    canSend,
  };

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}
