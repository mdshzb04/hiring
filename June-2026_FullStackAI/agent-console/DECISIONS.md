# DECISIONS.md

## Seq-based ordering and deduplication

**Data structure:** A `Map<number, ServerMessage>` reorder buffer (`lib/utils/reorderBuffer.ts`) plus `nextDispatchSeq` cursor.

**Why:** O(1) insert for out-of-order arrivals; drain loop releases contiguous runs starting at `nextDispatchSeq`. Dedup happens in `MessageRouter` via `lastProcessedSeq` (committed after store apply) and `dispatchedSeqs` (in-flight). This split prevents advancing `lastProcessedSeq` before the DOM/store has consumed a message — critical for correct `RESUME`.

**Chaos overlap:** Replay after reconnect may re-deliver seqs already committed; `msg.seq <= lastProcessedSeq` rejects them before the buffer.

## Layout shift during tool call interruptions

**Strategy:** Interleaved `StreamSegment[]` per stream — `{ type: "text" }` and `{ type: "tool" }` segments. When `TOOL_CALL` arrives, a tool segment is appended and `phase` becomes `paused`; `appendToken` no-ops until `TOOL_RESULT` triggers `resumeStream`, which opens a **new** text segment for post-tool tokens.

**CSS:** Tool cards are block-level siblings inside the agent bubble (`components/chat/AgentMessage.tsx`). Frozen text segments keep their DOM node; new tokens append to a new segment below the card — no reflow of prior text.

## Reconnection state recovery

**Consumed vs received:** `MessageRouter.commitProcessed(seq)` is called only after Zustand stores update (`AgentProvider` dispatch switch). `AgentSocket.getLastProcessedSeq()` reads the committed value for `RESUME`.

**Replay:** On reconnect during an active turn, `RESUME` is the first outbound message. Incoming replay messages are tagged `source: "replay"`; `MessageRouter` still reorders/dedups. `notifyReplayCaughtUp` clears `resuming`/`inputBlocked` after `REPLAY_IDLE_MS` idle.

**Stale socket guard:** `onStatusChange` ignores callbacks from sockets no longer in `socketRef` (Strict Mode / HMR).

## TOOL_ACK timeout race (protocol failure mode)

The server sends `TOOL_RESULT` after 5s even without `TOOL_ACK`. We schedule `TOOL_ACK` on `setTimeout(0)` after store ingest so the card exists before ack. If the server races ahead, `ToolAckRegistry` prevents duplicate acks; the card still renders from `TOOL_CALL`/`TOOL_RESULT` store state.

## 50 concurrent agent streams (ops dashboard)

- One `MessageRouter` per stream (or per session keyed by `stream_id`)
- Virtualize timeline and chat lists (`react-window`)
- Shared WebSocket multiplexer or connection pool with backpressure
- Move reorder buffers off the main thread (Worker) for burst replay

## 100× longer responses (document generation)

- Don't store full text in React state per token; use a `TextBuffer` ref + periodic flush (rAF batching)
- Timeline: always group tokens; never one row per token
- Context: stream JSON parser + lazy tree; never `JSON.stringify` entire payload on each snapshot
- Checkpoint `lastProcessedSeq` to IndexedDB for crash recovery

## State management

**Zustand** for protocol-derived state (streams, tools, timeline, context). **React context** (`AgentProvider`) only for connection/send API. Keeps high-frequency token updates out of context re-renders; components subscribe narrowly.

## Testing focus

- `reorderBuffer`: out-of-order, reversed, duplicates, gaps
- `MessageRouter`: dedup, replay caught-up, tool sequencing
- `AgentSocket`: PONG, corrupt PING, RESUME, send gates
- `contextDiff`: add/remove/change paths
- `toolCallLifecycle`: segment interleaving

## What I would change with more time

- Virtualize trace timeline rows for 30+ events/sec
- Full bidirectional scroll-sync between trace and chat selection
- IndexedDB persistence across page reload
- E2E Playwright suite against dockerized agent-server in CI
- Actual chaos screen recording uploaded to Loom/YouTube
