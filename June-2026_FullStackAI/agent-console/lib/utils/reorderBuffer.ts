import type { ServerMessage } from "@/lib/protocol/types";

// ─────────────────────────────────────────────────────────────
// Pure reorder buffer — delivers ServerMessages in seq order
// ─────────────────────────────────────────────────────────────

export interface ReorderBufferState {
  /** First seq not yet handed to dispatch (lastProcessedSeq + 1 at turn start). */
  nextDispatchSeq: number;
  buffer: Map<number, ServerMessage>;
}

export type IngestResult =
  | { action: "delivered"; messages: ServerMessage[] }
  | { action: "buffered"; seq: number }
  | { action: "stale"; seq: number };

export function createReorderBuffer(lastProcessedSeq = 0): ReorderBufferState {
  return {
    nextDispatchSeq: lastProcessedSeq + 1,
    buffer: new Map(),
  };
}

export function resetReorderBuffer(
  state: ReorderBufferState,
  lastProcessedSeq: number,
): void {
  state.nextDispatchSeq = lastProcessedSeq + 1;
  state.buffer.clear();
}

export function ingestMessage(
  state: ReorderBufferState,
  msg: ServerMessage,
): IngestResult {
  const seq = msg.seq;

  if (seq < state.nextDispatchSeq) {
    return { action: "stale", seq };
  }

  if (seq > state.nextDispatchSeq) {
    state.buffer.set(seq, msg);
    return { action: "buffered", seq };
  }

  const delivered: ServerMessage[] = [msg];
  state.nextDispatchSeq++;

  while (state.buffer.has(state.nextDispatchSeq)) {
    const next = state.buffer.get(state.nextDispatchSeq);
    if (!next) break;
    state.buffer.delete(state.nextDispatchSeq);
    delivered.push(next);
    state.nextDispatchSeq++;
  }

  return { action: "delivered", messages: delivered };
}

export function isReorderBufferEmpty(state: ReorderBufferState): boolean {
  return state.buffer.size === 0;
}

export function bufferedSeqs(state: ReorderBufferState): number[] {
  return [...state.buffer.keys()].sort((a, b) => a - b);
}
