'use client';
import dynamic from 'next/dynamic';

const ShipTrackerDashboard = dynamic(
  () => import('@/components/ship-tracker/ShipTrackerDashboard'),
  {
    ssr: false,
    loading: () => (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: '#0d1117', color: '#00d4ff' }}
      >
        <div className="text-center">
          <div className="mb-3 animate-pulse text-3xl">🚢</div>
          <div className="text-sm" style={{ color: '#8b949e' }}>
            載入船舶監測系統...
          </div>
        </div>
      </div>
    ),
  }
);

export default function ShipTrackerPage() {
  return <ShipTrackerDashboard />;
}
