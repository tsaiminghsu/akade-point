import type { Metadata } from 'next';
import { ARIPPageShell } from '@/components/arip/ARIPPageShell';

export const metadata: Metadata = { title: 'Dashboard' };

const STATUS_CARDS = [
  { label: 'Devices', value: '—', sub: 'No data yet', color: 'cyan' },
  { label: 'Fleets', value: '—', sub: 'No data yet', color: 'purple' },
  { label: 'Workflows', value: '—', sub: 'Node-RED', color: 'orange' },
  { label: 'AI Agents', value: '—', sub: 'No provider', color: 'green' },
];

export default function DashboardPage() {
  return (
    <ARIPPageShell
      title="Dashboard"
      description="Platform overview and real-time status"
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATUS_CARDS.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-white/10 bg-white/5 p-5"
          >
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
            <p className="mt-1 text-xs text-gray-600">{card.sub}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-dashed border-white/10 p-8 text-center">
        <p className="text-sm text-gray-500">
          Start the ARIP backend and connect devices to see live data here.
        </p>
        <code className="mt-3 block rounded bg-white/5 px-4 py-2 text-xs text-cyan-400">
          docker compose -f docker-compose.arip.yml up
        </code>
      </div>
    </ARIPPageShell>
  );
}
