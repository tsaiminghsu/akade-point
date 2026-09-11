'use client';
import dynamic from 'next/dynamic';

const ShipTrackerApp = dynamic(() => import('@/components/ship-tracker/ShipTrackerApp'), {
  ssr: false,
  loading: () => (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: '#060b09', color: '#4ade9a' }}
    >
      <div className="text-center">
        <div className="mb-3 animate-pulse text-3xl">📡</div>
        <div className="text-sm" style={{ color: '#7d9a8d' }}>
          載入船舶雷達監控台...
        </div>
      </div>
    </div>
  ),
});

export default function ShipTrackerPage() {
  return <ShipTrackerApp />;
}
