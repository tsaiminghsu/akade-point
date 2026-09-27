import type { Metadata } from "next";

export const metadata: Metadata = { title: "Store Management" };

export default function StoresLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
