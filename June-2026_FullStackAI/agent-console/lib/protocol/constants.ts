// ─────────────────────────────────────────────────────────────
// Protocol constants — agent-server contract
// ─────────────────────────────────────────────────────────────

/** Override at runtime via AgentSocket options.url if needed. */
export const WS_URL = "ws://localhost:4747/ws";

/** Client must send TOOL_ACK within this window (assignment: 2s). */
export const TOOL_ACK_DEADLINE_MS = 2_000;

/** Server terminates after 3 missed PONGs; respond within 3s (assignment). */
export const PONG_DEADLINE_MS = 3_000;

/** Exponential backoff schedule for reconnection (assignment). */
export const RECONNECT_BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000] as const;

export const RECONNECT_MAX_DELAY_MS = 10_000;

/** Idle period after last replay message before treating session as live again. */
export const REPLAY_IDLE_MS = 150;

/** Banner should appear within 500ms of disconnect (assignment). */
export const RECONNECT_BANNER_DEADLINE_MS = 500;

export const CLOSE_REPLACED = 1000;
