import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentSocket } from "@/lib/agent/AgentSocket";

type WsHandler = ((event: { data?: string; code?: number }) => void) | null;

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: WsHandler = null;
  onmessage: WsHandler = null;
  onclose: WsHandler = null;
  onerror: WsHandler = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
    });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }

  simulateMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

describe("AgentSocket", () => {
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    Object.assign(globalThis.WebSocket, {
      OPEN: 1,
      CONNECTING: 0,
      CLOSING: 2,
      CLOSED: 3,
    });
  });

  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket;
  });

  it("connects and reports connected status", async () => {
    const statuses: string[] = [];
    const socket = new AgentSocket({
      callbacks: {
        onStatusChange: (s) => statuses.push(s),
      },
    });
    socket.connect();
    expect(statuses).toContain("connecting");
    await vi.waitFor(() => {
      expect(socket.connectionStatus).toBe("connected");
    });
    expect(statuses).toContain("connected");
  });

  it("sends USER_MESSAGE when connected", async () => {
    const socket = new AgentSocket();
    socket.connect();
    await vi.waitFor(() => {
      expect(socket.connectionStatus).toBe("connected");
    });
    const ok = socket.sendUserMessage("hello");
    expect(ok).toBe(true);
    const ws = MockWebSocket.instances[0];
    expect(ws?.sent.some((s) => s.includes("USER_MESSAGE"))).toBe(true);
  });

  it("responds to PING with PONG", async () => {
    const socket = new AgentSocket();
    socket.connect();
    await vi.waitFor(() => expect(socket.connectionStatus).toBe("connected"));
    const ws = MockWebSocket.instances[0];
    ws?.simulateMessage(
      JSON.stringify({ type: "PING", seq: 1, challenge: "abc123" }),
    );
    expect(ws?.sent.some((s) => s.includes('"echo":"abc123"'))).toBe(true);
  });

  it("skips PONG on corrupt PING", async () => {
    const corrupt = vi.fn();
    const socket = new AgentSocket({
      callbacks: { onCorruptPing: corrupt },
    });
    socket.connect();
    await vi.waitFor(() => expect(socket.connectionStatus).toBe("connected"));
    const ws = MockWebSocket.instances[0];
    ws?.simulateMessage(
      JSON.stringify({ type: "PING", seq: 2, challenge: "" }),
    );
    expect(corrupt).toHaveBeenCalled();
    expect(ws?.sent.some((s) => s.includes("PONG"))).toBe(false);
  });

  it("sends RESUME on reconnect during active turn", async () => {
    const socket = new AgentSocket({
      hasActiveTurn: () => true,
      getLastProcessedSeq: () => 5,
    });
    socket.connect();
    await vi.waitFor(() => expect(socket.connectionStatus).toBe("connected"));
    const ws = MockWebSocket.instances[0];
    expect(ws?.sent.some((s) => s.includes("RESUME"))).toBe(true);
    const resume = ws?.sent.find((s) => s.includes("RESUME"));
    expect(resume).toContain('"last_seq":5');
  });

  it("blocks USER_MESSAGE while resuming", async () => {
    const socket = new AgentSocket({
      hasActiveTurn: () => true,
      getLastProcessedSeq: () => 0,
    });
    socket.connect();
    await vi.waitFor(() => expect(socket.isResuming).toBe(true));
    expect(socket.sendUserMessage("blocked")).toBe(false);
  });
});
