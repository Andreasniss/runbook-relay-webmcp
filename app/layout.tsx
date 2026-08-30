import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Runbook Relay — Governed incident response with WebMCP",
  description: "A human-guided incident response control room demonstrating scoped, visible, and auditable WebMCP tools.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
