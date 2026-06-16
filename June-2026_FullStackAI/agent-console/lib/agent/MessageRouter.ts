import type {
  MessageMeta,
  MessageSource,
  ServerMessage,
} from "@/lib/protocol/types";
import { isStreamEndMessage } from "@/lib/protocol/types";
import {
  createReorderBuffer,
  ingestMessage,
  isReorderBufferEmpty,
  resetReorderBuffer,
  type ReorderBufferState,
} from "@/lib/utils/reorderBuffer";

// ─────────────────────────────────────────────────────────────
// MessageRouter — dedup, reorder, dispatch, lastProcessedSeq
// ─────────────────────────────────────────────────────────────

export interface MessageRouterCallbacks {
  /**
   * Called for each in-order message after dedup + reorder.
   * Caller MUST call router.commitProcessed(msg.seq) after store/DOM commit.
   */
  onDispatch: (msg: ServerMessage, meta: MessageMeta) => void;
  onDuplicate?: (msg: ServerMessage, meta: MessageMeta) => void;
  onStale?: (msg: ServerMessage, meta: MessageMeta) => void;
  onReplayCaughtUp?: () => void;
  onTurnReset?: () => void;
}

export interface MessageRouterOptions {
  callbacks: MessageRouterCallbacks;
}

export class MessageRouter {
  private readonly callbacks: MessageRouterCallbacks;

  /** Failure #1: only advances via commitProcessed(), never on receive/dispatch. */
  private lastProcessedSeq = 0;

  /** Seq already handed to onDispatch (may be ahead of lastProcessedSeq). */
  private dispatchedSeqs = new Set<number>();

  private reorderState: ReorderBufferState;
  private activeTurn = false;
  private streamEnded = false;

  constructor(options: MessageRouterOptions) {
    this.callbacks = options.callbacks;
    this.reorderState = createReorderBuffer(0);
  }

  getLastProcessedSeq(): number {
    return this.lastProcessedSeq;
  }

  hasActiveTurn(): boolean {
    return this.activeTurn && !this.streamEnded;
  }

  isCaughtUp(): boolean {
    return isReorderBufferEmpty(this.reorderState);
  }

  /**
   * Failure #10: call BEFORE sending USER_MESSAGE to reset protocol state.
   */
  notifyUserMessageSent(): void {
    this.lastProcessedSeq = 0;
    this.dispatchedSeqs.clear();
    resetReorderBuffer(this.reorderState, 0);
    this.activeTurn = true;
    this.streamEnded = false;
    this.callbacks.onTurnReset?.();
  }

  ingest(msg: ServerMessage, source: MessageSource): void {
    const meta: MessageMeta = { source, receivedAt: Date.now() };

    // Failure #7: dedup committed + already-dispatched seq (chaos dup + replay overlap)
    if (msg.seq <= this.lastProcessedSeq || this.dispatchedSeqs.has(msg.seq)) {
      this.callbacks.onDuplicate?.(msg, meta);
      return;
    }

    // Failure #6: reorder before dispatch
    const result = ingestMessage(this.reorderState, msg);

    if (result.action === "stale") {
      this.callbacks.onStale?.(msg, meta);
      return;
    }

    if (result.action === "buffered") {
      return;
    }

    for (const delivered of result.messages) {
      this.dispatchOne(delivered, meta);
    }

    if (source === "replay" && this.isCaughtUp()) {
      this.callbacks.onReplayCaughtUp?.();
    }
  }

  /**
   * Failure #1: call after store/DOM has fully applied the message.
   */
  commitProcessed(seq: number): void {
    if (seq <= this.lastProcessedSeq) return;
    this.lastProcessedSeq = seq;
  }

  destroy(): void {
    this.dispatchedSeqs.clear();
    resetReorderBuffer(this.reorderState, 0);
  }

  private dispatchOne(msg: ServerMessage, meta: MessageMeta): void {
    this.dispatchedSeqs.add(msg.seq);

    if (isStreamEndMessage(msg)) {
      this.streamEnded = true;
    }

    this.callbacks.onDispatch(msg, meta);

    // PING/ERROR have no async store work — safe to commit immediately
    if (msg.type === "PING" || msg.type === "ERROR") {
      this.commitProcessed(msg.seq);
    }
  }
}

/**
 * Failure #8: tracks call_ids that already sent TOOL_ACK.
 */
export class ToolAckRegistry {
  private acked = new Set<string>();

  hasAcked(callId: string): boolean {
    return this.acked.has(callId);
  }

  markAcked(callId: string): void {
    this.acked.add(callId);
  }

  reset(): void {
    this.acked.clear();
  }
}

/**
 * Failure #2/#3/#8: schedule TOOL_ACK on next tick after render (assignment: within 2s).
 */
export function scheduleToolAck(
  callId: string,
  registry: ToolAckRegistry,
  sendAck: (callId: string) => boolean,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    if (registry.hasAcked(callId)) return;
    if (sendAck(callId)) {
      registry.markAcked(callId);
    }
  }, 0);
}
