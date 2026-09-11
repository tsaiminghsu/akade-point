import type { Metadata } from "next";

export const metadata: Metadata = { title: "Control Center" };

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
