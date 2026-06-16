"use client";

import { useAgent } from "@/providers/AgentProvider";
import { FormEvent, useState } from "react";

export function ChatInput() {
  const { sendMessage, canSend } = useAgent();
  const [text, setText] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    const ok = sendMessage(text);
    if (ok) setText("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={canSend ? "Type a message…" : "Waiting for connection…"}
        disabled={!canSend}
        className="flex-1 rounded border px-3 py-2 disabled:bg-gray-100"
      />
      <button
        type="submit"
        disabled={!canSend || !text.trim()}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:bg-gray-400"
      >
        Send
      </button>
    </form>
  );
}
