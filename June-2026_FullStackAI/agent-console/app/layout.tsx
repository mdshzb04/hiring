import type { Metadata } from "next";
import "./globals.css";
import { AgentProvider } from "@/providers/AgentProvider";

export const metadata: Metadata = {
  title: "Agent Console",
  description: "Alchemyst Agent Console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AgentProvider>{children}</AgentProvider>
      </body>
    </html>
  );
}
