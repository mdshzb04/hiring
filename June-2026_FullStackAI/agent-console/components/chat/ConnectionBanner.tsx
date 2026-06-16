"use client";

import { useAgent } from "@/providers/AgentProvider";

export function ConnectionBanner() {
  const { connectionStatus: status } = useAgent();

  if (status === "connected") return null;

  const label =
    status === "connecting"
      ? "Connecting…"
      : status === "reconnecting"
        ? "Reconnecting…"
        : "Disconnected";

  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
    >
      {label}
    </div>
  );
}
