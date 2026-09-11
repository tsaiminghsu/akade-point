import type { Metadata } from "next";

export const metadata: Metadata = { title: "Machines" };

export default function MachinesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
