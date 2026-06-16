import type { ClientMessage, ServerMessage } from "@/lib/protocol/types";
import { isServerMessage, isPingMessage } from "@/lib/protocol/types";
import {
  CLOSE_REPLACED,
  PONG_DEADLINE_MS,
  RECONNECT_BACKOFF_MS,
  RECONNECT_MAX_DELAY_MS,
  REPLAY_IDLE_MS,
  WS_URL,
} from "@/lib/protocol/constants";

// ─────────────────────────────────────────────────────────────
// AgentSocket — WebSocket + reconnect + outbound protocol messages
// ─────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface AgentSocketCallbacks {
  onStatusChange?: (status: ConnectionStatus) => void;
  onServerMessage?: (msg: ServerMessage, source: "live" | "replay") => void;
  onParseError?: (raw: string) => void;
  onCorruptPing?: (msg: ServerMessage) => void;
}

export interface AgentSocketOptions {
  url?: string;
  callbacks?: AgentSocketCallbacks;
  /** Returns true when an agent turn is in progress (STREAM_END not yet processed). */
  hasActiveTurn?: () => boolean;
  /** Highest fully-processed seq — used for RESUME on reconnect. */
  getLastProcessedSeq?: () => number;
}

export class AgentSocket {
  private readonly url: string;
  private readonly callbacks: AgentSocketCallbacks;
  private readonly hasActiveTurn: () => boolean;
  private readonly getLastProcessedSeq: () => number;

  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private replayIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private resuming = false;
  private inputBlocked = false;

  constructor(options: AgentSocketOptions = {}) {
    this.url = options.url ?? WS_URL;
    this.callbacks = options.callbacks ?? {};
    this.hasActiveTurn = options.hasActiveTurn ?? (() => false);
    this.getLastProcessedSeq = options.getLastProcessedSeq ?? (() => 0);
  }

  get connectionStatus(): ConnectionStatus {
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      return "connected";
    }
    if (ws?.readyState === WebSocket.CONNECTING) {
      return this.status === "reconnecting" ? "reconnecting" : "connecting";
    }
    if (this.reconnectTimer !== null) {
      return "reconnecting";
    }
    // ws null or CLOSING/CLOSED — never report connected without a live socket
    if (this.status === "connected") {
      return "disconnected";
    }
    return this.status;
  }

  get isResuming(): boolean {
    return this.resuming;
  }

  get isInputBlocked(): boolean {
    return this.inputBlocked;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.setStatus("connected");
      return;
    }
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.setStatus("connecting");
      return;
    }
    this.intentionalClose = false;
    this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.clearReplayIdleTimer();
    this.resuming = false;
    this.inputBlocked = false;
    this.closeSocket();
    this.setStatus("disconnected");
  }

  /**
   * Failure #10: block USER_MESSAGE while reconnecting or resuming replay.
   */
  sendUserMessage(content: string): boolean {
    if (this.inputBlocked) {
      return false;
    }
    if (this.resuming) {
      return false;
    }
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return false;
    }
    return this.send({ type: "USER_MESSAGE", content });
  }

  sendToolAck(callId: string): boolean {
    return this.send({ type: "TOOL_ACK", call_id: callId });
  }

  /** Called by MessageRouter when replay catch-up is complete. */
  notifyReplayCaughtUp(): void {
    this.clearReplayIdleTimer();
    this.replayIdleTimer = setTimeout(() => {
      this.resuming = false;
      this.inputBlocked = false;
      this.replayIdleTimer = null;
    }, REPLAY_IDLE_MS);
  }

  /** Extend replay idle window when more replay messages are still arriving. */
  touchReplayIdle(): void {
    if (!this.resuming) return;
    this.notifyReplayCaughtUp();
  }

  destroy(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.clearReplayIdleTimer();
    this.resuming = false;
    this.inputBlocked = false;
    this.closeSocket();
    this.status = "disconnected";
    // Do not call onStatusChange — effect cleanup must not clobber the next socket's store state.
  }

  private socketGeneration = 0;

  private openSocket(): void {
    if (typeof WebSocket === "undefined") {
      throw new Error("WebSocket is not available in this environment");
    }

    this.closeSocket();
    this.setStatus("connecting");

    const generation = ++this.socketGeneration;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      if (generation !== this.socketGeneration) return;
      this.reconnectAttempt = 0;
      this.setStatus("connected");

      // Failure #9: RESUME first on reconnect during active turn
      if (this.hasActiveTurn()) {
        this.resuming = true;
        this.inputBlocked = true;
        const lastSeq = this.getLastProcessedSeq();
        this.sendResume(lastSeq);
      } else {
        this.resuming = false;
        this.inputBlocked = false;
      }
    };

    ws.onmessage = (event) => {
      if (generation !== this.socketGeneration) return;
      this.handleRawMessage(String(event.data));
    };

    ws.onerror = () => {
      // onclose will handle reconnect
    };

    ws.onclose = (event) => {
      if (generation !== this.socketGeneration) return;

      const wasCurrent = this.ws === ws;
      if (wasCurrent) {
        this.ws = null;
      }

      if (this.intentionalClose) {
        return;
      }

      // Replaced by another connection — do not reconnect (would fight the new socket).
      if (event.code === CLOSE_REPLACED) {
        if (wasCurrent) {
          this.clearReconnectTimer();
          this.setStatus("disconnected");
        }
        return;
      }

      // Failure #10: block input immediately on disconnect
      this.inputBlocked = true;
      this.resuming = false;
      this.clearReplayIdleTimer();
      this.scheduleReconnect();
    };
  }

  private handleRawMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.callbacks.onParseError?.(raw);
      return;
    }

    if (!isServerMessage(parsed)) {
      this.callbacks.onParseError?.(raw);
      return;
    }

    const source: "live" | "replay" = this.resuming ? "replay" : "live";

    // Failure #5: corrupt PING — do not throw; skip PONG
    // Failure #8: no PONG on replayed PING
    // Failure #4: respond to valid PING within deadline
    if (isPingMessage(parsed)) {
      if (parsed.challenge === "") {
        this.callbacks.onCorruptPing?.(parsed);
      } else if (source === "live") {
        this.sendPong(parsed.challenge);
      }
    }

    this.callbacks.onServerMessage?.(parsed, source);

    if (this.resuming) {
      this.touchReplayIdle();
    }
  }

  private sendResume(lastSeq: number): void {
    this.send({ type: "RESUME", last_seq: lastSeq });
  }

  private sendPong(echo: string): void {
    this.send({ type: "PONG", echo });
  }

  private send(msg: ClientMessage): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    ws.send(JSON.stringify(msg));
    return true;
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.setStatus("reconnecting");

    const delay = this.getBackoffDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempt++;
      this.openSocket();
    }, delay);
  }

  private getBackoffDelay(): number {
    const index = Math.min(
      this.reconnectAttempt,
      RECONNECT_BACKOFF_MS.length - 1,
    );
    const base = RECONNECT_BACKOFF_MS[index] ?? RECONNECT_MAX_DELAY_MS;
    return Math.min(base, RECONNECT_MAX_DELAY_MS);
  }

  private closeSocket(): void {
    if (!this.ws) return;
    try {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
    } catch {
      // ignore close errors
    }
    this.ws = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearReplayIdleTimer(): void {
    if (this.replayIdleTimer !== null) {
      clearTimeout(this.replayIdleTimer);
      this.replayIdleTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }
}

// Re-export for consumers documenting PONG deadline
export { PONG_DEADLINE_MS, CLOSE_REPLACED };
