import type { Metadata } from "next";

import { ControlCenterShell } from "@/components/control-center/shell/ControlCenterShell";

export const metadata: Metadata = {
  title: { template: "%s | IoT Control Center", default: "IoT Control Center" },
  description: "Enterprise IoT Control Center — real-time device monitoring & floor-plan editor",
};

export default function ControlCenterLayout({ children }: { children: React.ReactNode }) {
  return <ControlCenterShell>{children}</ControlCenterShell>;
}
