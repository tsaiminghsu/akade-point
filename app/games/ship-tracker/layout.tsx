import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '船舶雷達監控台 — ARPA 避碰追蹤',
  description: '模擬航海雷達的 PPI 掃描、目標追蹤與 ARPA 避碰解算，並融合 AIS 船舶識別',
};

export default function ShipTrackerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
