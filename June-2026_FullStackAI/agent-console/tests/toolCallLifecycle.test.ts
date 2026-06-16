import { describe, it, expect, beforeEach } from "vitest";
import { useStreamStore } from "@/lib/stores/streamStore";
import { useToolCallStore } from "@/lib/stores/toolCallStore";

describe("tool call lifecycle", () => {
  beforeEach(() => {
    useStreamStore.getState().reset();
    useToolCallStore.getState().reset();
  });

  it("interleaves text and tool segments", () => {
    const stream = useStreamStore.getState();
    stream.appendToken("s_1", "Hello ");
    stream.addToolToStream("s_1", "tc_1");
    stream.appendToken("s_1", "ignored while paused");
    useToolCallStore.getState().handleToolCall({
      type: "TOOL_CALL",
      seq: 2,
      call_id: "tc_1",
      tool_name: "search",
      args: { q: "docs" },
      stream_id: "s_1",
    });
    stream.resumeStream("s_1");
    stream.appendToken("s_1", "world");

    const s = useStreamStore.getState().streams["s_1"];
    expect(s?.segments).toHaveLength(3);
    expect(s?.segments[0]).toMatchObject({ type: "text", content: "Hello " });
    expect(s?.segments[1]).toMatchObject({ type: "tool", callId: "tc_1" });
    expect(s?.segments[2]).toMatchObject({ type: "text", content: "world" });

    const tool = useToolCallStore.getState().tools["tc_1"];
    expect(tool?.status).toBe("waiting");

    useToolCallStore.getState().handleToolResult({
      type: "TOOL_RESULT",
      seq: 3,
      call_id: "tc_1",
      result: { ok: true },
      stream_id: "s_1",
    });
    expect(useToolCallStore.getState().tools["tc_1"]?.status).toBe("completed");
  });

  it("supports multiple tool calls in one stream", () => {
    const stream = useStreamStore.getState();
    stream.ensureAgentStream("s_2");
    stream.addToolToStream("s_2", "tc_a");
    stream.addToolToStream("s_2", "tc_b");
    const s = useStreamStore.getState().streams["s_2"];
    const tools = s?.segments.filter((seg) => seg.type === "tool");
    expect(tools).toHaveLength(2);
  });
});
