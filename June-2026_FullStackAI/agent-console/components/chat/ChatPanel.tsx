"use client";

import { useStreamStore } from "@/lib/stores/streamStore";
import { AgentMessage } from "./AgentMessage";

export function ChatPanel() {
  const messages = useStreamStore((s) => s.messages);

  return (
    <div className="flex-1 overflow-y-auto p-4" data-panel="chat">
      {messages.length === 0 ? (
        <p className="text-gray-500">Send a message to start.</p>
      ) : (
        <ul className="space-y-4">
          {messages.map((msg) => (
            <li
              key={msg.id}
              className={msg.role === "user" ? "text-right" : "text-left"}
            >
              {msg.role === "user" ? (
                <span className="inline-block rounded bg-blue-100 px-3 py-2">
                  {msg.content}
                </span>
              ) : msg.streamId ? (
                <AgentMessage streamId={msg.streamId} />
              ) : (
                <span className="inline-block rounded bg-gray-100 px-3 py-2">
                  {msg.content || "…"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
