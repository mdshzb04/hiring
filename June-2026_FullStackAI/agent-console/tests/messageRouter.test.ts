import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageRouter } from "@/lib/agent/MessageRouter";
import type { ServerMessage } from "@/lib/protocol/types";

function token(seq: number, text = "x"): ServerMessage {
  return { type: "TOKEN", seq, text, stream_id: "s_1" };
}

function toolCall(seq: number, callId: string): ServerMessage {
  return {
    type: "TOOL_CALL",
    seq,
    call_id: callId,
    tool_name: "lookup",
    args: { q: "test" },
    stream_id: "s_1",
  };
}

describe("MessageRouter", () => {
  let dispatched: ServerMessage[];
  let duplicates: number;
  let router: MessageRouter;

  beforeEach(() => {
    dispatched = [];
    duplicates = 0;
    router = new MessageRouter({
      callbacks: {
        onDispatch: (msg) => {
          dispatched.push(msg);
          router.commitProcessed(msg.seq);
        },
        onDuplicate: () => {
          duplicates++;
        },
      },
    });
  });

  it("dispatches in-order messages", () => {
    router.ingest(token(1), "live");
    router.ingest(token(2), "live");
    expect(dispatched.map((m) => m.seq)).toEqual([1, 2]);
    expect(router.getLastProcessedSeq()).toBe(2);
  });

  it("reorders out-of-order messages", () => {
    router.ingest(token(1), "live");
    router.ingest(token(3), "live");
    expect(dispatched).toHaveLength(1);
    router.ingest(token(2), "live");
    expect(dispatched.map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  it("deduplicates replayed seq", () => {
    router.ingest(token(1), "live");
    router.ingest(token(1), "replay");
    expect(duplicates).toBe(1);
    expect(dispatched).toHaveLength(1);
  });

  it("tracks active turn until STREAM_END", () => {
    router.notifyUserMessageSent();
    expect(router.hasActiveTurn()).toBe(true);
    router.ingest(token(1), "live");
    router.ingest(
      { type: "STREAM_END", seq: 2, stream_id: "s_1" },
      "live",
    );
    expect(router.hasActiveTurn()).toBe(false);
  });

  it("fires onReplayCaughtUp when replay buffer drains", () => {
    const caughtUp = vi.fn();
    const replayRouter = new MessageRouter({
      callbacks: {
        onDispatch: (msg, _meta) => {
          replayRouter.commitProcessed(msg.seq);
        },
        onReplayCaughtUp: caughtUp,
      },
    });
    replayRouter.notifyUserMessageSent();
    replayRouter.ingest(token(1), "live");
    replayRouter.commitProcessed(1);
    replayRouter.ingest(token(2), "replay");
    expect(caughtUp).toHaveBeenCalled();
  });

  it("handles rapid tool calls in sequence", () => {
    router.notifyUserMessageSent();
    router.ingest(toolCall(1, "tc_a"), "live");
    router.ingest(toolCall(2, "tc_b"), "live");
    expect(dispatched.filter((m) => m.type === "TOOL_CALL")).toHaveLength(2);
  });
});
