import type { Metadata } from "next";

export const metadata: Metadata = { title: "Claw machine setup" };

export default function ClawMachinesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
