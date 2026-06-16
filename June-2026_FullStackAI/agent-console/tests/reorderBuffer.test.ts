import { describe, it, expect, beforeEach } from "vitest";
import type { ServerMessage } from "@/lib/protocol/types";
import {
  createReorderBuffer,
  ingestMessage,
  resetReorderBuffer,
  isReorderBufferEmpty,
  type ReorderBufferState,
} from "@/lib/utils/reorderBuffer";

function token(seq: number, text = "x"): ServerMessage {
  return { type: "TOKEN", seq, text, stream_id: "s_1" };
}

describe("reorderBuffer", () => {
  let state: ReorderBufferState;

  beforeEach(() => {
    state = createReorderBuffer(0);
  });

  it("delivers a single in-order message", () => {
    const result = ingestMessage(state, token(1));
    expect(result.action).toBe("delivered");
    if (result.action === "delivered") {
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.seq).toBe(1);
    }
    expect(state.nextDispatchSeq).toBe(2);
    expect(isReorderBufferEmpty(state)).toBe(true);
  });

  it("returns stale for seq below nextDispatchSeq", () => {
    ingestMessage(state, token(1));
    const result = ingestMessage(state, token(1));
    expect(result.action).toBe("stale");
  });

  it("buffers out-of-order messages and drains in order", () => {
    ingestMessage(state, token(1));
    expect(ingestMessage(state, token(3)).action).toBe("buffered");
    expect(ingestMessage(state, token(4)).action).toBe("buffered");
    expect(isReorderBufferEmpty(state)).toBe(false);

    const result = ingestMessage(state, token(2));
    expect(result.action).toBe("delivered");
    if (result.action === "delivered") {
      expect(result.messages.map((m) => m.seq)).toEqual([2, 3, 4]);
    }
    expect(state.nextDispatchSeq).toBe(5);
    expect(isReorderBufferEmpty(state)).toBe(true);
  });

  it("handles fully reversed delivery", () => {
    ingestMessage(state, token(4));
    ingestMessage(state, token(3));
    ingestMessage(state, token(2));
    const result = ingestMessage(state, token(1));
    expect(result.action).toBe("delivered");
    if (result.action === "delivered") {
      expect(result.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    }
  });

  it("overwrites same seq in buffer when duplicate arrives before dispatch", () => {
    ingestMessage(state, token(2, "first"));
    ingestMessage(state, token(2, "second"));
    const result = ingestMessage(state, token(1));
    expect(result.action).toBe("delivered");
    if (result.action === "delivered") {
      const t2 = result.messages.find((m) => m.seq === 2);
      expect(t2?.type === "TOKEN" && t2.text).toBe("second");
    }
  });

  it("leaves gap when middle message never arrives", () => {
    ingestMessage(state, token(1));
    ingestMessage(state, token(3));
    expect(state.nextDispatchSeq).toBe(2);
    expect(isReorderBufferEmpty(state)).toBe(false);
    expect(ingestMessage(state, token(4)).action).toBe("buffered");
  });

  it("resets after turn boundary", () => {
    ingestMessage(state, token(1));
    ingestMessage(state, token(3));
    resetReorderBuffer(state, 0);
    expect(state.nextDispatchSeq).toBe(1);
    expect(isReorderBufferEmpty(state)).toBe(true);
    const result = ingestMessage(state, token(1));
    expect(result.action).toBe("delivered");
  });

  it("starts from arbitrary lastProcessedSeq", () => {
    state = createReorderBuffer(10);
    expect(ingestMessage(state, token(10)).action).toBe("stale");
    const result = ingestMessage(state, token(11));
    expect(result.action).toBe("delivered");
    if (result.action === "delivered") {
      expect(result.messages[0]?.seq).toBe(11);
    }
  });
});
