// ─────────────────────────────────────────────────────────────
// WebSocket protocol types — agent-server contract
// ─────────────────────────────────────────────────────────────

// ── Server → Client ───────────────────────────────────────────

export interface TokenMessage {
  type: "TOKEN";
  seq: number;
  text: string;
  stream_id: string;
}

export interface ToolCallMessage {
  type: "TOOL_CALL";
  seq: number;
  call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  stream_id: string;
}

export interface ToolResultMessage {
  type: "TOOL_RESULT";
  seq: number;
  call_id: string;
  result: Record<string, unknown>;
  stream_id: string;
}

export interface ContextSnapshotMessage {
  type: "CONTEXT_SNAPSHOT";
  seq: number;
  context_id: string;
  data: Record<string, unknown>;
}

export interface PingMessage {
  type: "PING";
  seq: number;
  challenge: string;
}

export interface StreamEndMessage {
  type: "STREAM_END";
  seq: number;
  stream_id: string;
}

export interface ErrorMessage {
  type: "ERROR";
  seq: number;
  code: string;
  message: string;
}

export type ServerMessage =
  | TokenMessage
  | ToolCallMessage
  | ToolResultMessage
  | ContextSnapshotMessage
  | PingMessage
  | StreamEndMessage
  | ErrorMessage;

export type ServerMessageType = ServerMessage["type"];

// ── Client → Server ───────────────────────────────────────────

export interface UserMessagePayload {
  type: "USER_MESSAGE";
  content: string;
}

export interface PongPayload {
  type: "PONG";
  echo: string;
}

export interface ResumePayload {
  type: "RESUME";
  last_seq: number;
}

export interface ToolAckPayload {
  type: "TOOL_ACK";
  call_id: string;
}

export type ClientMessage =
  | UserMessagePayload
  | PongPayload
  | ResumePayload
  | ToolAckPayload;

// ── Pipeline metadata ─────────────────────────────────────────

export type MessageSource = "live" | "replay";

export interface MessageMeta {
  source: MessageSource;
  receivedAt: number;
}

// ── Type guards ───────────────────────────────────────────────

const SERVER_TYPES: ReadonlySet<string> = new Set([
  "TOKEN",
  "TOOL_CALL",
  "TOOL_RESULT",
  "CONTEXT_SNAPSHOT",
  "PING",
  "STREAM_END",
  "ERROR",
]);

export function isServerMessage(value: unknown): value is ServerMessage {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.type !== "string" || !SERVER_TYPES.has(obj.type)) return false;
  if (typeof obj.seq !== "number" || !Number.isFinite(obj.seq)) return false;
  return true;
}

export function isPingMessage(msg: ServerMessage): msg is PingMessage {
  return msg.type === "PING";
}

export function isToolCallMessage(msg: ServerMessage): msg is ToolCallMessage {
  return msg.type === "TOOL_CALL";
}

export function isToolResultMessage(msg: ServerMessage): msg is ToolResultMessage {
  return msg.type === "TOOL_RESULT";
}

export function isStreamEndMessage(msg: ServerMessage): msg is StreamEndMessage {
  return msg.type === "STREAM_END";
}
