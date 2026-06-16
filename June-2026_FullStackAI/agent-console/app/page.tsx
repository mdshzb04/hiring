"use client";

import { ConnectionBanner } from "@/components/chat/ConnectionBanner";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ChatInput } from "@/components/chat/ChatInput";
import { TracePanel } from "@/components/timeline/TracePanel";
import { ContextPanel } from "@/components/context/ContextPanel";

export default function HomePage() {
  return (
    <main className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Agent Console</h1>
        <span className="text-xs text-gray-500">Alchemyst Assignment</span>
      </header>
      <ConnectionBanner />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatPanel />
          <ContextPanel />
          <ChatInput />
        </div>
        <TracePanel />
      </div>
    </main>
  );
}
